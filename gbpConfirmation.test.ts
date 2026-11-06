import { afterEach, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, ErrorCode, McpError, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { GateServer, GbpConfirmOperation } from "./gbpConfirmation";

// External I/O is replaced at the HTTP boundary. No test can reach a paid API.
// Each recorded request keeps the flattened form fields so the API-side literal
// token (`confirm`) and identifiers can be asserted.
type Recorded = { url: string; fields: Record<string, string> };
const requests: Recorded[] = [];
let responseBody: unknown = { success: true };
let responseStatus = 200;
mock.module("node-fetch", () => ({
  default: async (url: unknown, init?: { body?: unknown }) => {
    const fields: Record<string, string> = {};
    if (init?.body instanceof FormData) {
      for (const [key, value] of init.body.entries()) fields[key] = String(value);
    }
    requests.push({ url: String(url), fields });
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  },
}));
const { getServer } = await import("./server");
const { runWithRequestSource } = await import("./requestSource");
const { createGbpConfirmationGate, describeGbpOperation, stableStringify, isRemoteTransport, CANCELLED_TEXT, DEFAULT_LOCAL_ELICIT_TIMEOUT_MS, DEFAULT_REMOTE_ELICIT_TIMEOUT_MS } = await import("./gbpConfirmation");

type ElicitHandler = (params: any) => ElicitResult | Promise<ElicitResult>;
const active: Array<{ client: Client; server: ReturnType<typeof getServer> }> = [];

async function connect(profile: "normal" | "chatgpt", elicitation?: { capability: object; handler: ElicitHandler }) {
  // In-memory transports have no session ID; this is a fixture credential only.
  const server = runWithRequestSource({ value: profile === "chatgpt" ? "chatgpt" : "claude", tier: 4 },
    () => getServer(new Map([[undefined as any, { apiKey: "test-only" }]])));
  const client = new Client({ name: "gbp-confirm-test", version: "1" },
    elicitation ? { capabilities: { elicitation: elicitation.capability } } : {});
  if (elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => elicitation.handler(request.params));
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  active.push({ client, server });
  return client;
}

afterEach(async () => {
  for (const { client, server } of active.splice(0)) {
    await client.close();
    await server.close();
  }
  requests.length = 0;
  responseBody = { success: true };
  responseStatus = 200;
  delete process.env.GBP_CONFIRM_TIMEOUT_MS;
});

function textOf(result: any): string {
  return result.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}
function payload(result: any): any { return JSON.parse(textOf(result)); }
const accept = (): ElicitResult => ({ action: "accept", content: { confirm: true } });

const PLACE = "ChIJ-test-place";
const DELETE_POST = { action: "delete", placeId: PLACE, postId: "post-1" };
const WRITE_TOOLS = [
  "manageLocalFalconGbpPosts", "manageLocalFalconGbpMedia", "manageLocalFalconGbpReviewReplies",
  "manageLocalFalconGbpActionLinks", "manageLocalFalconGbpServices", "updateLocalFalconGbpProfile",
];

const GATED: Array<{ name: string; args: Record<string, unknown>; operation: GbpConfirmOperation; endpoint: string }> = [
  { name: "manageLocalFalconGbpPosts", args: DELETE_POST, operation: "DELETE_POST", endpoint: "delete-post" },
  { name: "manageLocalFalconGbpMedia", args: { action: "delete", placeId: PLACE, mediaId: "media-1" }, operation: "DELETE_MEDIA", endpoint: "delete-media" },
  { name: "manageLocalFalconGbpReviewReplies", args: { action: "delete", placeId: PLACE, reviewId: "review-1" }, operation: "DELETE_REPLY", endpoint: "delete-review-reply" },
  { name: "manageLocalFalconGbpActionLinks", args: { action: "delete", placeId: PLACE, linkId: "link-1" }, operation: "DELETE_LINK", endpoint: "delete-link" },
  { name: "manageLocalFalconGbpServices", args: { action: "replace", placeId: PLACE, services: [{ name: "Roof repair" }] }, operation: "REPLACE_SERVICES", endpoint: "replace-services" },
  { name: "updateLocalFalconGbpProfile", args: { action: "status", placeId: PLACE, status: "CLOSED_PERMANENTLY" }, operation: "CLOSED_PERMANENTLY", endpoint: "update-status" },
  { name: "updateLocalFalconGbpProfile", args: { action: "attributes", placeId: PLACE, attributes: [{ name: "has_wifi", values: [true] }] }, operation: "SET_ATTRIBUTES", endpoint: "update-attributes" },
];

const UNGATED: Array<{ name: string; args: Record<string, unknown>; endpoint: string }> = [
  { name: "manageLocalFalconGbpPosts", args: { action: "create", placeId: PLACE, summary: "Open late on Fridays" }, endpoint: "create-post" },
  { name: "manageLocalFalconGbpPosts", args: { action: "update", placeId: PLACE, postId: "post-1", summary: "Edited" }, endpoint: "update-post" },
  { name: "manageLocalFalconGbpMedia", args: { action: "update", placeId: PLACE, mediaId: "media-1", category: "INTERIOR" }, endpoint: "update-media" },
  { name: "manageLocalFalconGbpReviewReplies", args: { action: "reply", placeId: PLACE, reviewId: "review-1", reply: "Thank you!" }, endpoint: "reply-review" },
  { name: "manageLocalFalconGbpActionLinks", args: { action: "create", placeId: PLACE, actionType: "APPOINTMENT", uri: "https://example.com/book" }, endpoint: "create-link" },
  { name: "manageLocalFalconGbpServices", args: { action: "add", placeId: PLACE, services: [{ name: "Roof repair" }] }, endpoint: "add-services" },
  { name: "manageLocalFalconGbpServices", args: { action: "remove", placeId: PLACE, names: ["Roof repair"] }, endpoint: "remove-services" },
  { name: "updateLocalFalconGbpProfile", args: { action: "status", placeId: PLACE, status: "CLOSED_TEMPORARILY" }, endpoint: "update-status" },
  { name: "updateLocalFalconGbpProfile", args: { action: "hours", placeId: PLACE, clear: "special" }, endpoint: "update-hours" },
];

describe("clients that support form elicitation get a hard human gate", () => {
  test("an accepted approval dialog releases the API call with the literal token", async () => {
    const seen: any[] = [];
    const client = await connect("normal", { capability: { form: {} }, handler: (params) => { seen.push(params); return accept(); } });
    const result: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
    expect(seen).toHaveLength(1);
    expect(seen[0].mode).toBe("form");
    expect(seen[0].message).toContain("post-1");
    expect(seen[0].message).toContain(PLACE);
    expect(seen[0].message).toContain("cannot be recovered");
    expect(seen[0].requestedSchema.properties.confirm.type).toBe("boolean");
    expect(seen[0].requestedSchema.required).toContain("confirm");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/gbp/delete-post/");
    expect(requests[0].fields.confirm).toBe("DELETE_POST");
    expect(requests[0].fields.post_id).toBe("post-1");
    expect(result.isError).toBeUndefined();
    expect(payload(result)).toEqual({ success: true });
  });

  const refusals: ElicitResult[] = [{ action: "decline" }, { action: "cancel" }, { action: "accept", content: { confirm: false } }];
  for (const outcome of refusals) {
    test(`${JSON.stringify(outcome)} leaves the profile untouched and mints no token`, async () => {
      const client = await connect("normal", { capability: { form: {} }, handler: () => outcome });
      const result: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
      expect(requests).toHaveLength(0);
      expect(textOf(result)).toBe(CANCELLED_TEXT);
      expect(result.isError).toBeUndefined();
    });
  }

  test("a legacy empty elicitation capability is treated as form support", async () => {
    let invoked = 0;
    const client = await connect("normal", { capability: {}, handler: () => { invoked++; return accept(); } });
    await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
    expect(invoked).toBe(1);
    expect(requests).toHaveLength(1);
  });

  test("a failed dialog falls back to a token preview without approving anything", async () => {
    const client = await connect("normal", { capability: { form: {} }, handler: () => { throw new Error("dialog exploded"); } });
    const result: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
    expect(requests).toHaveLength(0);
    const preview = payload(result);
    expect(preview).toMatchObject({ confirmation_required: true, changed: false, approval_prompt: "failed" });
    expect(preview.approval_prompt_note).toContain("Confirm with the user in the conversation");
    expect(preview.confirmationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(result.isError).toBeUndefined();
    await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } });
    expect(requests).toHaveLength(1);
    expect(requests[0].fields.confirm).toBe("DELETE_POST");
  });

  test("an unanswered dialog falls back to a token after the timeout, and a late answer cannot approve", async () => {
    process.env.GBP_CONFIRM_TIMEOUT_MS = "200";
    let invoked = 0;
    const client = await connect("normal", { capability: { form: {} }, handler: async () => {
      invoked++;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return accept();
    } });
    const started = Date.now();
    const result: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
    expect(Date.now() - started).toBeLessThan(650);
    expect(invoked).toBe(1);
    const preview = payload(result);
    expect(preview).toMatchObject({ confirmation_required: true, changed: false, approval_prompt: "timed_out" });
    expect(preview.approval_prompt_note).toContain("did not answer it within");
    expect(preview.confirmationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(result.isError).toBeUndefined();
    expect(requests).toHaveLength(0);
    // The human's late "accept" resolves after the server has already cancelled
    // the dialog request and returned the preview: it must not reach the API.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(requests).toHaveLength(0);
    await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } });
    expect(requests).toHaveLength(1);
    expect(requests[0].fields.confirm).toBe("DELETE_POST");
  });

  test("a fabricated confirmationToken is ignored and the human is still asked", async () => {
    let invoked = 0;
    const client = await connect("normal", { capability: { form: {} }, handler: () => { invoked++; return { action: "decline" }; } });
    const result: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: "deadbeefdeadbeefdeadbeefdeadbeef" } });
    expect(invoked).toBe(1);
    expect(requests).toHaveLength(0);
    expect(textOf(result)).toBe(CANCELLED_TEXT);
    expect(textOf(result)).not.toContain("confirmationToken");
  });

  for (const { name, args, endpoint } of UNGATED) {
    test(`${name} ${args.action}${args.status ? " " + args.status : ""} is not gated and never prompts`, async () => {
      let invoked = 0;
      const client = await connect("normal", { capability: { form: {} }, handler: () => { invoked++; return accept(); } });
      const result: any = await client.callTool({ name, arguments: args });
      expect(invoked).toBe(0);
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain(`/gbp/${endpoint}/`);
      expect(requests[0].fields.confirm).toBeUndefined();
      expect(textOf(result)).not.toContain("confirmation_required");
    });
  }
});

describe("clients without elicitation get a preview and an argument-bound token", () => {
  test("preview first, then the identical call plus token performs the action once", async () => {
    const client = await connect("normal");
    const first: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST });
    const preview = payload(first);
    expect(preview).toMatchObject({ confirmation_required: true, changed: false, tool: "manageLocalFalconGbpPosts", operation: "DELETE_POST", expires_in_seconds: 600 });
    expect(preview.summary).toContain("post-1");
    expect(preview.warning).toContain("cannot be recovered");
    expect(preview.details).toEqual({ placeId: PLACE, postId: "post-1" });
    expect(preview.confirmationToken).toMatch(/^[a-f0-9]{32}$/);
    expect(preview.instructions).toContain("Never approve on the user's behalf");
    expect(preview.success).toBeUndefined();
    expect(first.isError).toBeUndefined();
    expect(requests).toHaveLength(0);

    const second: any = await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/gbp/delete-post/");
    expect(requests[0].fields.confirm).toBe("DELETE_POST");
    expect(payload(second)).toEqual({ success: true });

    // Single use: the same token again is refused and re-previewed.
    const third = payload(await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } }));
    expect(third.confirmation_required).toBe(true);
    expect(third.previous_token).toBe("unknown");
    expect(third.confirmationToken).not.toBe(preview.confirmationToken);
    expect(requests).toHaveLength(1);
  });

  test("a token issued for different arguments is refused; the fresh one is bound to the new arguments", async () => {
    const client = await connect("normal");
    const preview = payload(await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: DELETE_POST }));
    const altered = { ...DELETE_POST, postId: "post-2" };
    const mismatch = payload(await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...altered, confirmationToken: preview.confirmationToken } }));
    expect(mismatch.previous_token).toBe("mismatch");
    expect(mismatch.details.postId).toBe("post-2");
    expect(requests).toHaveLength(0);
    // The consumed token is gone even for the original arguments.
    const reused = payload(await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } }));
    expect(reused.previous_token).toBe("unknown");
    await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...altered, confirmationToken: mismatch.confirmationToken } });
    expect(requests).toHaveLength(1);
    expect(requests[0].fields.post_id).toBe("post-2");
  });

  test("null, empty and omitted optional arguments hash identically", async () => {
    const client = await connect("normal");
    const preview = payload(await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, language: null, summary: "" } }));
    await client.callTool({ name: "manageLocalFalconGbpPosts", arguments: { ...DELETE_POST, confirmationToken: preview.confirmationToken } });
    expect(requests).toHaveLength(1);
  });

  for (const { name, args, operation, endpoint } of GATED) {
    test(`${operation} via ${name} is gated and sends the API's literal token only after approval`, async () => {
      const client = await connect("normal");
      const preview = payload(await client.callTool({ name, arguments: args }));
      expect(preview.operation).toBe(operation);
      expect(preview.confirmation_required).toBe(true);
      expect(requests).toHaveLength(0);
      await client.callTool({ name, arguments: { ...args, confirmationToken: preview.confirmationToken } });
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain(`/gbp/${endpoint}/`);
      expect(requests[0].fields.confirm).toBe(operation);
    });
  }

  test("the ChatGPT profile passes the preview through unchanged and completes the token path", async () => {
    const client = await connect("chatgpt");
    const first: any = await client.callTool({ name: "updateLocalFalconGbpProfile", arguments: GATED[6].args });
    const preview = payload(first);
    expect(preview.confirmation_required).toBe(true);
    expect(preview.operation).toBe("SET_ATTRIBUTES");
    expect(preview.warning).toContain("issue #40");
    expect(first.isError).toBeUndefined();
    expect(requests).toHaveLength(0);
    const second: any = await client.callTool({ name: "updateLocalFalconGbpProfile", arguments: { ...GATED[6].args, confirmationToken: preview.confirmationToken } });
    expect(requests).toHaveLength(1);
    expect(requests[0].fields.confirm).toBe("SET_ATTRIBUTES");
    expect(second.isError).toBeUndefined();
  });
});

describe("tool surface is unchanged apart from the token parameter", () => {
  test("60/57 tools, every write tool accepts confirmationToken, annotations intact", async () => {
    const normal = (await (await connect("normal")).listTools()).tools;
    const chatgpt = (await (await connect("chatgpt")).listTools()).tools;
    expect(normal).toHaveLength(60);
    expect(chatgpt).toHaveLength(57);
    for (const tools of [normal, chatgpt]) {
      for (const name of WRITE_TOOLS) {
        const tool = tools.find(t => t.name === name)!;
        expect(tool, name).toBeDefined();
        expect((tool.inputSchema.properties as any).confirmationToken).toBeDefined();
        expect(tool.inputSchema.required ?? []).not.toContain("confirmationToken");
        expect(tool.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true, destructiveHint: true });
        expect(tool.description).toContain("approval");
      }
    }
  });
});

describe("gate internals", () => {
  function fakeServer(capabilities: unknown, elicitInput?: (...args: any[]) => any): GateServer {
    return {
      server: {
        getClientCapabilities: () => capabilities,
        elicitInput: elicitInput ?? (async () => { throw new Error("elicitInput must not be called"); }),
      },
    } as unknown as GateServer;
  }
  const request = (extra: Record<string, unknown> = {}) => ({
    tool: "manageLocalFalconGbpPosts", operation: "DELETE_POST" as GbpConfirmOperation, args: { ...DELETE_POST, ...extra },
  });
  const tokenOf = (outcome: any) => JSON.parse(outcome.result.content[0].text).confirmationToken as string;
  const reasonOf = (outcome: any) => JSON.parse(outcome.result.content[0].text).previous_token as string;

  test("tokens expire after the TTL", async () => {
    let clock = 1_000_000;
    const gate = createGbpConfirmationGate(fakeServer(undefined), { now: () => clock, tokenTtlMs: 5_000 });
    const token = tokenOf(await gate.confirm(request()));
    clock += 5_001;
    const late = await gate.confirm(request({ confirmationToken: token }));
    expect(late.approved).toBe(false);
    expect(reasonOf(late)).toBe("expired");
    const fresh = await gate.confirm(request({ confirmationToken: tokenOf(late) }));
    expect(fresh.approved).toBe(true);
  });

  test("the store is bounded and evicts the oldest token first", async () => {
    const gate = createGbpConfirmationGate(fakeServer(undefined), { maxTokens: 3 });
    const tokens: string[] = [];
    for (const postId of ["p1", "p2", "p3", "p4"]) tokens.push(tokenOf(await gate.confirm(request({ postId }))));
    const evicted = await gate.confirm(request({ postId: "p1", confirmationToken: tokens[0] }));
    expect(evicted.approved).toBe(false);
    expect(reasonOf(evicted)).toBe("unknown");
    // The eviction test itself minted a replacement for p1, which evicted p2; p3 and p4 survive.
    expect((await gate.confirm(request({ postId: "p4", confirmationToken: tokens[3] }))).approved).toBe(true);
    expect((await gate.confirm(request({ postId: "p3", confirmationToken: tokens[2] }))).approved).toBe(true);
  });

  test("a pre-aborted request is cancelled without prompting or minting", async () => {
    let calls = 0;
    const gate = createGbpConfirmationGate(fakeServer({ elicitation: { form: {} } }, async () => { calls++; return accept(); }));
    const controller = new AbortController();
    controller.abort();
    const outcome: any = await gate.confirm({ ...request(), signal: controller.signal });
    expect(outcome.approved).toBe(false);
    expect(outcome.result.content[0].text).toBe(CANCELLED_TEXT);
    expect(calls).toBe(0);
  });

  test("elicitation is passed the timeout and signal, and an accept with confirm=true approves", async () => {
    let received: any;
    const controller = new AbortController();
    const gate = createGbpConfirmationGate(
      fakeServer({ elicitation: { form: {} } }, async (params: any, options: any) => { received = { params, options }; return accept(); }),
      { elicitTimeoutMs: 4321 },
    );
    const outcome = await gate.confirm({ ...request(), signal: controller.signal });
    expect(outcome.approved).toBe(true);
    expect(received.options).toEqual({ timeout: 4321, signal: controller.signal });
    expect(received.params.requestedSchema.properties.confirm.default).toBe(false);
  });

  test("a timed-out or failed dialog is reported on the fallback preview, whose token then works", async () => {
    const timedOut = createGbpConfirmationGate(
      fakeServer({ elicitation: { form: {} } }, async () => { throw new McpError(ErrorCode.RequestTimeout, "Request timed out"); }),
      { elicitTimeoutMs: 10 },
    );
    const late: any = await timedOut.confirm(request());
    expect(late.approved).toBe(false);
    expect(JSON.parse(late.result.content[0].text)).toMatchObject({ confirmation_required: true, approval_prompt: "timed_out" });
    const failed = createGbpConfirmationGate(fakeServer({ elicitation: { form: {} } }, async () => { throw new Error("boom"); }));
    const broken: any = await failed.confirm(request());
    expect(JSON.parse(broken.result.content[0].text)).toMatchObject({ confirmation_required: true, approval_prompt: "failed" });
    expect((await failed.confirm(request({ confirmationToken: tokenOf(broken) }))).approved).toBe(true);
  });

  test("the dialog timeout is short on remote transports, longer locally, and env-overridable", async () => {
    const seen: number[] = [];
    const server = fakeServer({ elicitation: { form: {} } }, async (_params: any, options: any) => { seen.push(options.timeout); return accept(); });
    const gate = createGbpConfirmationGate(server);
    await gate.confirm(request());
    expect(seen.at(-1)).toBe(DEFAULT_LOCAL_ELICIT_TIMEOUT_MS);
    (server.server as any).transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await gate.confirm(request());
    expect(seen.at(-1)).toBe(DEFAULT_REMOTE_ELICIT_TIMEOUT_MS);
    process.env.GBP_CONFIRM_TIMEOUT_MS = "777";
    await gate.confirm(request());
    expect(seen.at(-1)).toBe(777);
    expect(DEFAULT_REMOTE_ELICIT_TIMEOUT_MS).toBeLessThan(DEFAULT_LOCAL_ELICIT_TIMEOUT_MS);
    expect(isRemoteTransport(undefined)).toBe(false);
    expect(isRemoteTransport(InMemoryTransport.createLinkedPair()[1])).toBe(false);
  });

  test("stableStringify sorts keys, keeps array order and drops null/undefined/empty at every depth", () => {
    expect(stableStringify({ b: 1, a: [1, null, "", { z: null, y: "", x: 0 }], c: undefined })).toBe('{"a":[1,{"x":0}],"b":1}');
    // A container emptied by stripping puts nothing on the wire, so it hashes as absent.
    expect(stableStringify({ keep: 1, a: { b: { c: "" } }, list: [null, ""], bare: {} })).toBe('{"keep":1}');
    expect(stableStringify({ tool: "t", args: { callToAction: { url: "" } } })).toBe(stableStringify({ tool: "t", args: {} }));
    expect(stableStringify("")).toBe("null");
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(stableStringify({ flag: false, zero: 0 })).toBe('{"flag":false,"zero":0}');
  });

  test("every operation is described from its arguments with an irreversibility warning", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Service ${i + 1}` }));
    const cases: Array<[GbpConfirmOperation, Record<string, unknown>, string[]]> = [
      ["DELETE_POST", { placeId: PLACE, postId: "post-1" }, ["post-1", PLACE]],
      ["DELETE_MEDIA", { placeId: PLACE, mediaId: "media-1" }, ["media-1"]],
      ["DELETE_REPLY", { placeId: PLACE, reviewId: "review-1" }, ["review-1", "publicly"]],
      ["DELETE_LINK", { placeId: PLACE, linkId: "link-1" }, ["link-1"]],
      ["REPLACE_SERVICES", { placeId: PLACE, services: many }, ["12 service(s)", "Service 10", "+2 more"]],
      ["CLOSED_PERMANENTLY", { placeId: PLACE, status: "CLOSED_PERMANENTLY" }, ["CLOSED_PERMANENTLY"]],
      ["SET_ATTRIBUTES", { placeId: PLACE, attributes: [{ name: "has_wifi", values: [true] }, { name: "url_menu", uris: ["https://x.test/menu"] }] }, ["2 attribute(s)", "has_wifi =true", "url_menu uris=https://x.test/menu"]],
    ];
    for (const [operation, args, expected] of cases) {
      const description = describeGbpOperation(operation, args);
      for (const fragment of expected) expect(description.summary, operation).toContain(fragment);
      expect(description.warning.length, operation).toBeGreaterThan(10);
      expect(description.details.placeId).toBe(PLACE);
    }
    expect(describeGbpOperation("REPLACE_SERVICES", { placeId: PLACE, services: many }).summary).not.toContain("Service 11");
    expect(describeGbpOperation("SET_ATTRIBUTES", { placeId: PLACE, attributes: [] }).warning).toContain("issue #40");
  });
});
