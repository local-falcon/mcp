import { afterEach, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { reportFromToolResult } from "./ui/geogrid-heatmap/report-loader";
import { projectReportFields } from "./reportPayload";

// External I/O is replaced at the HTTP boundary. No test can reach a paid API.
let responseBody: unknown = {};
let responseStatus = 200;
const requests: string[] = [];
const requestHeaders: Array<Record<string, string>> = [];
let denyOtherAccount = false;
mock.module("node-fetch", () => ({
  default: async (url: unknown, options: any) => {
    requests.push(String(url));
    requestHeaders.push(options.headers);
    const denied = denyOtherAccount && options.headers.Authorization !== "Bearer owner-fixture-key";
    const status = denied ? 403 : responseStatus;
    const body = denied ? { success: false, message: "This resource belongs to a different account", data: { private_report: "must-not-be-delivered" } } : typeof responseBody === "function" ? responseBody(String(url)) : responseBody;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  },
}));
const { getServer } = await import("./server");
const { runWithRequestSource } = await import("./requestSource");
const active: Array<{ client: Client; server: ReturnType<typeof getServer> }> = [];

async function connect(profile: string, apiKey: string | null = "test-only") {
  // In-memory transports have no session ID; this is a fixture credential only.
  const server = runWithRequestSource({ value: profile === "chatgpt" ? "chatgpt" : "claude", tier: 4 },
    () => getServer(new Map(apiKey === null ? [] : [[undefined as any, { apiKey }]])));
  const client = new Client({ name: "arbitrary-client-name", version: "1" });
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
  requestHeaders.length = 0;
  denyOtherAccount = false;
  responseBody = {};
  responseStatus = 200;
});

const excluded = ["getLocalFalconGoogleBusinessLocations", "getLocalFalconRankingAtCoordinate", "getLocalFalconKeywordAtCoordinate"];
const rejected = ["listLocalFalconScanReports", "getLocalFalconReport", "listAllLocalFalconLocations", "listLocalFalconCampaignReports", "viewLocalFalconAccountInformation", "searchLocalFalconKnowledgeBase", "getLocalFalconKnowledgeBaseArticle"];
const blocked = [15, 16, 23, 37, 57, 81];

function textOf(result: any): string {
  return result.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}
function payload(result: any): any { return JSON.parse(textOf(result)); }

describe("resolved source profile and actual MCP discovery", () => {
  test("normal retains all 60 tools and ChatGPT registers only its 57 tools", async () => {
    const normal = await connect("normal");
    const chatgpt = await connect("chatgpt");
    const full = (await normal.listTools()).tools;
    const safe = (await chatgpt.listTools()).tools;
    expect(full).toHaveLength(60);
    expect(safe).toHaveLength(57);
    for (const name of excluded) {
      expect(full.some(t => t.name === name)).toBe(true);
      expect(safe.some(t => t.name === name)).toBe(false);
      const result = await chatgpt.callTool({ name, arguments: {} });
      expect(result.isError).toBe(true);
    }
    expect(requests).toHaveLength(0);
    expect(safe.some(t => t.name === "getLocalFalconGrid")).toBe(true);
    const search = safe.find(t => t.name === "searchForLocalFalconBusinessLocation")!;
    expect(search.description).toMatch(/2 existing Local Falcon credits/i);
    expect(search.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true, destructiveHint: true });
    const guidance = JSON.stringify({ server: chatgpt.getServerVersion(), tools: safe });
    for (const name of excluded) expect(guidance).not.toContain(name);
    expect(guidance).not.toMatch(/\$19\/location|\$1\/month|Purchase more credits|Enable Auto Recharge/i);
  });

  test("both profiles use semantic annotations independently of data provenance", async () => {
    for (const profile of ["normal", "chatgpt"]) {
      const tools = (await (await connect(profile)).listTools()).tools;
      for (const name of [...rejected, "getLocalFalconGbpProfile", "listLocalFalconGbpReviews", "getLocalFalconGrid"]) {
        expect(tools.find(t => t.name === name)?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, destructiveHint: false });
      }
      expect(tools.find(t => t.name === "searchLocalFalconGbpChains")?.annotations?.openWorldHint).toBe(true);
      expect(tools.find(t => t.name === "updateLocalFalconCampaign")?.annotations?.destructiveHint).toBe(true);
      expect(tools.find(t => t.name === "manageLocalFalconGbpPosts")?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true, destructiveHint: true });
      for (const tool of tools) for (const key of ["readOnlyHint", "openWorldHint", "destructiveHint"]) expect(typeof tool.annotations?.[key]).toBe("boolean");
    }
  });

  test("profile is fixed for its connection, independently of concurrent request contexts", async () => {
    const client = await connect("chatgpt");
    await runWithRequestSource({ value: "claude", tier: 4 }, async () => {
      expect((await client.listTools()).tools).toHaveLength(57);
    });
  });
});

describe("ChatGPT KB denylist at both entry points", () => {
  test("search removes complete blocked records and adjusts visible counts without changing pagination", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: true, data: { total: 40, count: 9, next_token: "page-two", articles: [...blocked, 28, 50, 58].map(id => ({ id: `KB${id}`, title: blocked.includes(id) ? "Purchase Credits" : "Ordinary documentation", summary: blocked.includes(id) ? "https://app.localfalcon.com/billing/purchase-credits" : "Useful guidance" })) } };
    const result = payload(await client.callTool({ name: "searchLocalFalconKnowledgeBase", arguments: {} }));
    expect(result.data.articles.map((a: any) => a.id)).toEqual(["KB28", "KB50", "KB58"]);
    expect(result.data.count).toBe(3);
    expect(result.data.next_token).toBe("page-two");
    expect(JSON.stringify(result)).not.toMatch(/Purchase Credits|purchase-credits/);
  });

  test("every blocked numeric or KB-prefixed ID is refused before any upstream request", async () => {
    const client = await connect("chatgpt");
    for (const id of blocked) for (const articleId of [String(id), `KB${id}`, `kb${id}`, `KB00${id}`]) {
      const result = await client.callTool({ name: "getLocalFalconKnowledgeBaseArticle", arguments: { articleId } });
      expect(textOf(result)).toContain("not available through the ChatGPT integration");
      expect(textOf(result)).toContain("https://www.localfalcon.com/pricing");
    }
    expect(requests).toHaveLength(0);
  });

  test("KB28/50/58 remain available; normal profile does not apply the denylist", async () => {
    const chatgpt = await connect("chatgpt");
    for (const id of [28, 50, 58]) {
      responseBody = { success: true, data: { id: `KB${id}`, content: "Normal Local Falcon guidance" } };
      expect(payload(await chatgpt.callTool({ name: "getLocalFalconKnowledgeBaseArticle", arguments: { articleId: `KB${id}` } })).data.content).toBe("Normal Local Falcon guidance");
    }
    const normal = await connect("normal");
    responseBody = { success: true, data: { id: "KB15", content: "Original normal-profile article" } };
    expect(payload(await normal.callTool({ name: "getLocalFalconKnowledgeBaseArticle", arguments: { articleId: "15" } })).data.id).toBe("KB15");
  });
});

describe("ChatGPT result and error boundary", () => {
  const commerce = 'You do not have enough credits. <a href="/billing/purchase-credits">Purchase Credits</a> <a href="/billing/auto-recharge">Enable Auto Recharge</a>';
  test("HTTP 200 application failure cannot leak purchasing HTML or imply success", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: false, message: commerce, data: { url: "https://app.localfalcon.com/checkout" } };
    const result = await client.callTool({ name: "searchForLocalFalconBusinessLocation", arguments: { term: "Coffee", platform: "google" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Your existing Local Falcon credit balance is insufficient for this action, so it was not run.");
    expect(textOf(result)).not.toMatch(/purchase-credits|auto-recharge|checkout|<a|Purchase Credits|Enable Auto Recharge/);
  });

  test("HTTP error preserves neutral reason without raw purchase/upgrade links", async () => {
    const client = await connect("chatgpt");
    responseStatus = 403;
    responseBody = { success: false, message: commerce + ' <a href="https://app.localfalcon.com/upgrade">Upgrade now</a>' };
    const result = await client.callTool({ name: "getLocalFalconKnowledgeBaseArticle", arguments: { articleId: "28" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("existing Local Falcon credit balance is insufficient");
    expect(textOf(result)).not.toMatch(/purchase-credits|auto-recharge|\/upgrade|<a|Server:/);
  });

  test("failure is caught before report clients unwrap the HTTP 200 envelope", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: false, message: commerce, data: { reports: [], help: "/billing/purchase-credits" } };
    const result = await client.callTool({ name: "listLocalFalconScanReports", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("existing Local Falcon credit balance is insufficient");
    expect(textOf(result)).not.toContain("purchase-credits");
  });

  test("report widget resource failures cannot bypass the ChatGPT error policy", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: false, message: commerce, data: { help: "/billing/auto-recharge" } };
    for (const status of [200, 403]) {
      responseStatus = status;
      const result = await client.readResource({ uri: "localfalcon://reports/abc123def456789/data_points" });
      const text = result.contents.map((c: any) => c.text).join("\n");
      expect(text).toContain("existing Local Falcon credit balance is insufficient");
      expect(text).not.toMatch(/purchase-credits|auto-recharge|<a/);
    }
  });

  test("structured authoritative credit amounts are used, prose numbers are not guessed", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: false, message: commerce, required_credits: 2, available_credits: 1 };
    const result = await client.callTool({ name: "searchForLocalFalconBusinessLocation", arguments: { term: "Coffee", platform: "google" } });
    expect(textOf(result)).toContain("This action requires 2 existing Local Falcon credits. Your account currently has 1 available credits, so the action was not run.");
  });

  test("account retains normal identity/entitlements but removes transactional fields and promotion", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: true, data: { user: { name: "Reviewer" }, credits: { total_usable_credits: 25 }, subscription: { name: "Existing plan", status: "active", price: "$20", purchase_url: "/billing/purchase-credits", checkout_url: "https://pay.example/session/abc", message: "Please upgrade your subscription" }, informational_url: "https://www.localfalcon.com/pricing" } };
    const result = payload(await client.callTool({ name: "viewLocalFalconAccountInformation", arguments: {} }));
    expect(result.data.user.name).toBe("Reviewer");
    expect(result.data.credits.total_usable_credits).toBe(25);
    expect(result.data.subscription.name).toBe("Existing plan");
    expect(result.data.subscription.price).toBe("$20");
    expect(result.data.informational_url).toBe("https://www.localfalcon.com/pricing");
    expect(JSON.stringify(result)).not.toMatch(/purchase-credits|pay\.example|upgrade your subscription/);
  });

  test("account payment links cannot escape under generic field names", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: true, data: { billing_link: "https://buy.stripe.com/test_abc", notice: '<a href="https://buy.stripe.com/test_abc">Get credits</a>', credits: 10 } };
    const result = payload(await client.callTool({ name: "viewLocalFalconAccountInformation", arguments: {} }));
    expect(result.data.credits).toBe(10);
    expect(JSON.stringify(result)).not.toContain("buy.stripe.com");
  });

  test("credits extraction failure never broadens to raw account; zero is a valid balance", async () => {
    const client = await connect("chatgpt");
    responseBody = { success: true, data: { user: { name: "not requested" } } };
    const result = await client.callTool({ name: "viewLocalFalconAccountInformation", arguments: { returnField: "credits", fieldmask: "user.name" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("not requested");
    responseBody = { success: true, data: { credits: 0 } };
    expect(payload(await client.callTool({ name: "viewLocalFalconAccountInformation", arguments: { returnField: "credits" } })).data.credits).toBe(0);
  });

  test("normal results and errors retain original behavior", async () => {
    const client = await connect("normal");
    responseBody = { success: false, message: commerce };
    expect(textOf(await client.callTool({ name: "searchLocalFalconKnowledgeBase", arguments: {} }))).toContain("purchase-credits");
  });
});



describe("authenticated HTTP session profiles", () => {
  test("source selects actual registries, sticks through recovery, and rejects unsafe transitions/ownership", async () => {
    const { SessionManager, createUnifiedServer } = await import("./index");
    const manager = new SessionManager();
    const listener = createUnifiedServer(manager, ["http"]).listen(0, "127.0.0.1");
    await new Promise<void>(resolve => listener.once("listening", resolve));
    const url = `http://127.0.0.1:${(listener.address() as any).port}/mcp`;
    const send = (body: any, sid?: string, extra: Record<string, string> = {}) => fetch(url, {
      method: "POST", headers: { authorization: "Bearer session-fixture", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26", ...(sid ? { "mcp-session-id": sid } : {}), ...extra }, body: JSON.stringify(body),
    });
    const init = (name: string) => send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name, version: "1" } } });
    const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
    try {
      responseBody = { success: true, data: {} };
      const started = await init("ChatGPT");
      expect(started.status).toBe(200);
      const sid = started.headers.get("mcp-session-id")!;
      await started.json();
      expect((await (await send(list, sid)).json()).result.tools).toHaveLength(57);
      // Conflicting platform signals cannot change this established session's billing attribution.
      const call = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "getLocalFalconKnowledgeBaseArticle", arguments: { articleId: "28" } } };
      await (await send(call, sid, { origin: "https://claude.ai" })).json();
      expect(requests.at(-1)).toContain("request_source=chatgpt");
      manager.remove(sid);
      const [recovered, concurrentRecovery] = await Promise.all([send(list, sid), send(list, sid)]);
      expect((await concurrentRecovery.json()).result.tools).toHaveLength(57);
      expect(recovered.status).toBe(200);
      expect((await recovered.json()).result.tools).toHaveLength(57);
      const newSid = recovered.headers.get("mcp-session-id")!;
      const forbidden = await send({ ...call, params: { name: excluded[0], arguments: {} } }, newSid);
      expect((await forbidden.json()).result.isError).toBe(true);
      const normal = await init("Claude");
      const normalSid = normal.headers.get("mcp-session-id")!;
      await normal.json();
      expect((await (await send(list, normalSid)).json()).result.tools).toHaveLength(60);
      const wrongOwner = await send(list, normalSid, { authorization: "Bearer other-fixture", origin: "https://chatgpt.com" });
      expect(wrongOwner.status).toBe(403);
      expect(manager.getSession(normalSid)?.profile).toBe("normal");
      const changed = await send(list, normalSid, { origin: "https://chatgpt.com" });
      expect(changed.status).toBe(404);
      expect(await changed.text()).toContain("initialize");
      expect((await send(list, normalSid)).status).toBe(404);
      const retiredNormal = await init("Claude");
      const retiredId = retiredNormal.headers.get("mcp-session-id")!;
      await retiredNormal.json();
      manager.remove(retiredId);
      expect((await send(list, retiredId, { origin: "https://chatgpt.com" })).status).toBe(404);
      expect((await send(list, retiredId)).status).toBe(404);
      expect((await send(list, sid, { authorization: "Bearer other-fixture" })).status).toBe(403);
      expect((await send(list, "unknown-session")).status).toBe(404);
    } finally {
      await manager.cleanup();
      listener.closeAllConnections();
      await new Promise<void>(resolve => listener.close(() => resolve()));
    }
  });
});


test("legacy SSE waits for authenticated initialize attribution before registering tools", async () => {
  const { SessionManager, createUnifiedServer } = await import("./index");
  const manager = new SessionManager();
  const listener = createUnifiedServer(manager, ["sse"]).listen(0, "127.0.0.1");
  await new Promise<void>(resolve => listener.once("listening", resolve));
  const base = `http://127.0.0.1:${(listener.address() as any).port}`;
  const controller = new AbortController();
  const decoder = new TextDecoder();
  responseBody = { success: true, data: {} };
  try {
    const stream = await fetch(base + "/sse", { headers: { authorization: "Bearer sse-fixture" }, signal: controller.signal });
    const reader = stream.body!.getReader();
    const endpoint = decoder.decode((await reader.read()).value).match(/data: (.+)/)![1].trim();
    const sid = new URL(endpoint, base).searchParams.get("sessionId")!;
    expect(manager.getSession(sid)?.profile).toBeUndefined();
    const conflicting = await fetch(base + endpoint, { method: "POST", headers: { authorization: "Bearer sse-fixture", "content-type": "application/json", "mcp-session-id": "different-session" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(conflicting.status).toBe(400);
    const post = (body: any, auth = "sse-fixture") => fetch(base + endpoint, { method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "ChatGPT", version: "1" } } };
    expect((await post(init, "wrong-owner")).status).toBe(403);
    expect(manager.getSession(sid)?.profile).toBeUndefined();
    expect((await post(init)).status).toBe(202);
    await reader.read(); // initialize reply
    expect(manager.getSession(sid)?.profile).toBe("chatgpt");
    expect((await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })).status).toBe(202);
    let text = "";
    while (!text.includes("\n\n")) text += decoder.decode((await reader.read()).value);
    const message = JSON.parse(text.match(/data: (.+)/)![1]);
    expect(message.result.tools).toHaveLength(57);
  } finally {
    controller.abort();
    await manager.cleanup();
    listener.closeAllConnections();
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }
});

describe("pending Scan Report resource", () => {
  test("HTTP 202 preserves warnings and report identity for tool and resource", async () => {
    const client = await connect("chatgpt");
    responseStatus = 202;
    responseBody = { success: true, data: [], field_mask_warnings: { exceptions: ["data_points"] } };
    const reportKey = "494b540411352e4";
    const report = payload(await client.callTool({ name: "getLocalFalconReport", arguments: { reportKey } }));
    expect(report._mcp_status).toBe("processing");
    expect(report.report_key).toBe(reportKey);
    expect(report._mcp_note).toContain("same report_key");
    expect(report._warnings).toEqual(["Unknown field in fieldmask: data_points"]);
    const resource = await client.readResource({ uri: `localfalcon://reports/${reportKey}/data_points` });
    const data = JSON.parse((resource.contents[0] as any).text);
    expect(data).toMatchObject({ report_key: reportKey, _mcp_status: "processing" });
    expect(data._mcp_note).toContain("processing");
    expect(data).not.toHaveProperty("items");
    expect(data).not.toHaveProperty("data_points");
    expect(requests.every(url => url.includes(`/reports/${reportKey}`))).toBe(true);
  });
  test("completed resource retains its grid payload", async () => {
    const client = await connect("normal");
    const completed = { report_key: "494b540411352e4", platform: "gemini", keyword: "coffee", grid_size: 3, data_points: [{ lat: 41, lng: -81, rank: 2 }], places: {}, sources: [] };
    responseBody = { success: true, data: completed };
    const resource = await client.readResource({ uri: "localfalcon://reports/494b540411352e4/data_points" });
    expect(JSON.parse((resource.contents[0] as any).text)).toEqual(completed);
    expect(new URL(requests.at(-1)!).searchParams.get("fieldmask")).toContain("platform");
  });
});

describe("inline Scan Report widget delivery", () => {
  const reportKey = "abc123def456789";
  const completed = {
    report_key: reportKey, platform: "google", keyword: "coffee", grid_size: 3,
    place_id: "ChIJtarget", location: { name: "Target", address: "Main Street" },
    arp: 2, atrp: 2, solv: 100,
    data_points: [{ lat: 41, lng: -81, rank: 2, results: ["ChIJtarget"] }],
    places: { ChIJtarget: { name: "Target", rank: 2, solv: 100 } }, sources: [],
  };

  test("SDK result delivery preserves widget-only grid and lean model content on both profiles", async () => {
    for (const profile of ["normal", "chatgpt"]) {
      const client = await connect(profile);
      responseBody = { success: true, data: completed };
      const result = await client.callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "report_key,arp,location.name" } });
      expect(result._meta?.["localfalcon/report"]).toEqual(completed);
      expect(reportFromToolResult(JSON.parse(JSON.stringify(result)))).toEqual(completed);
      // ChatGPT's canonical global channel is also decoded by the actual widget helper.
      expect(reportFromToolResult(payload(result), { call_tool_result: result })).toEqual(completed);
      expect(payload(result)).toEqual({ report_key: reportKey, arp: 2, location: { name: "Target" } });
      expect(result.structuredContent).toBeUndefined();
      expect(textOf(result)).not.toContain("data_points");
      expect(textOf(result)).not.toContain("Main Street");
    }
    expect(requests).toHaveLength(2); // One backend request per tool call, no resource request.
  });

  test("only the read-only report tool is explicitly widget accessible", async () => {
    const client = await connect("chatgpt");
    const tools = (await client.listTools()).tools;
    const report = tools.find(tool => tool.name === "getLocalFalconReport")!;
    expect(report._meta?.ui).toMatchObject({ resourceUri: "ui://reports/geogrid-heatmap/v1.4.17", visibility: ["model", "app"] });
    expect(report._meta?.["openai/outputTemplate"]).toBe("ui://reports/geogrid-heatmap/v1.4.17");
    expect(report._meta?.["openai/widgetAccessible"]).toBe(true);
    for (const tool of tools.filter(tool => tool.name !== report.name)) {
      expect(tool._meta?.["openai/widgetAccessible"]).not.toBe(true);
    }
    const resources = (await client.listResources()).resources;
    for (const version of ["1.4.17", "1.4.16"]) expect(resources.some(resource => resource.uri === `ui://reports/geogrid-heatmap/v${version}`)).toBe(true);
  });

  test("SDK serializes backend-style partial masks without changing hidden grid arrays", async () => {
    const full = { ...completed, location: { name: null, address: "Main Street" }, data_points: [{ lat: 41, lng: -81 }, { lat: 42, lng: -82, rank: 2 }] };
    responseBody = (url: string) => ({ success: true, data: projectReportFields(full, new URL(url).searchParams.get("fieldmask")!), field_mask_warnings: { exceptions: ["location.name", "sources"] } });
    for (const profile of ["normal", "chatgpt"]) {
      const result = await (await connect(profile)).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "location.name,data_points.*.rank" } });
      expect(payload(result)).toEqual({ data_points: { "1": { rank: 2 } }, _warnings: ["Unknown field in fieldmask: location.name"] });
      const widget: any = result._meta?.["localfalcon/report"];
      expect(widget.data_points).toEqual(full.data_points);
      expect(Array.isArray(widget.data_points)).toBe(true);
      expect(widget.location).toEqual(full.location);
      expect(widget._warnings).toHaveLength(2);
      expect(result.structuredContent).toBeUndefined();
    }
    expect(requests).toHaveLength(2);
    for (const url of requests) {
      const mask = new URL(url).searchParams.get("fieldmask")!;
      expect(mask.split(",")).toContain("location.name");
      expect(mask.split(",")).toContain("location");
      expect(mask.split(",")).toContain("data_points.*.rank");
      expect(mask.split(",")).toContain("data_points");
    }
  });

  test("AI point results, AI identifiers and citations survive serialization for drill-down", async () => {
    const ai = { ...completed, platform: "gemini", ai_place_id: "AI-target-hash", saiv: 100,
      data_points: [{ lat: 41, lng: -81, rank: false, results: [{ rank: 1, place_id: "AI-target-hash", name: "Target" }], scrape: "**Target** is nearby [1]", sources: [{ title: "Citation", subtitle: "example.test", link: "https://example.test/citation" }] }],
      places: { "AI-target-hash": { name: "Target", saiv: 100 } }, sources: [{ href: "https://example.test/citation", index: 1 }] };
    responseBody = { success: true, data: ai };
    const result = await (await connect("chatgpt")).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "report_key,saiv" } });
    const decoded = reportFromToolResult(JSON.parse(JSON.stringify(result)));
    expect(decoded).toEqual(ai);
    expect(decoded.data_points[0].scrape).toBe("**Target** is nearby [1]");
    expect(decoded.data_points[0].sources).toEqual(ai.data_points[0].sources);
    expect(payload(result)).toEqual({ report_key: reportKey, saiv: 100 });
    expect(requests).toHaveLength(1);
  });

  test("processing result keeps its key and explicit state in both channels with a lean mask", async () => {
    responseStatus = 202;
    responseBody = { success: true, data: [] };
    const result = await (await connect("chatgpt")).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } });
    expect(payload(result)).toMatchObject({ report_key: reportKey, _mcp_status: "processing" });
    expect(reportFromToolResult(result)).toEqual(payload(result));
    expect(reportFromToolResult(result)).not.toHaveProperty("data_points");
  });

  test("account-bound read rejects cross-account report access in both profiles and every channel", async () => {
    denyOtherAccount = true;
    responseBody = { success: true, data: completed };
    for (const profile of ["normal", "chatgpt"]) {
      const owner = await connect(profile, "owner-fixture-key");
      const other = await connect(profile, "other-fixture-key");
      expect((await owner.callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } }))._meta?.["localfalcon/report"]).toEqual(completed);
      const denied = await other.callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } });
      expect(denied.isError).toBe(true);
      expect(denied._meta?.["localfalcon/report"]).toBeUndefined();
      expect(JSON.stringify(denied)).not.toContain("must-not-be-delivered");
      expect(JSON.stringify(denied)).not.toContain("other-fixture-key");
    }
    expect(requestHeaders.map(headers => headers.Authorization)).toEqual(["Bearer owner-fixture-key", "Bearer other-fixture-key", "Bearer owner-fixture-key", "Bearer other-fixture-key"]);
    expect(requests).toHaveLength(4); // A 403 is terminal, never retried.
  });

  test("HTTP 200 application denial cannot become inline data after its error fields are masked", async () => {
    responseBody = { code: 403, success: false, message: "Access denied", data: completed };
    for (const profile of ["normal", "chatgpt"]) {
      const result = await (await connect(profile)).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } });
      expect(result.isError).toBe(true);
      expect(result._meta?.["localfalcon/report"]).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("ChIJtarget");
    }
  });

  test("credentials and upstream authentication parameters never enter report result channels", async () => {
    const credential = "fixture-credential-never-to-widget";
    responseBody = { success: true, parameters: { key: credential, oauth_token: "fixture-oauth-token" }, api_key: credential, data: completed };
    const result = await (await connect("chatgpt", credential)).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } });
    expect(JSON.stringify(result)).not.toContain(credential);
    expect(JSON.stringify(result)).not.toContain("fixture-oauth-token");
    expect(requestHeaders[0].Authorization).toBe(`Bearer ${credential}`);
    expect(new URL(requests[0]).searchParams.has("key")).toBe(false);
  });

  test("malformed completed responses are errors, never a made-up processing state", async () => {
    for (const data of [null, "malformed", []]) {
      responseBody = { success: true, data };
      const result = await (await connect("chatgpt")).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "arp" } });
      expect(result.isError).toBe(true);
      expect(result._meta?.["localfalcon/report"]).toBeUndefined();
      expect(textOf(result)).not.toContain("still processing");
    }
  });

  test("missing credentials yield an explicit error without fetching or delivering widget data", async () => {
    const original = process.env.LOCAL_FALCON_API_KEY;
    delete process.env.LOCAL_FALCON_API_KEY;
    try {
      for (const profile of ["normal", "chatgpt"]) {
        const result = await (await connect(profile, null)).callTool({ name: "getLocalFalconReport", arguments: { reportKey } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain("Missing LOCAL_FALCON_API_KEY");
        expect(result._meta?.["localfalcon/report"]).toBeUndefined();
      }
      expect(requests).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.LOCAL_FALCON_API_KEY;
      else process.env.LOCAL_FALCON_API_KEY = original;
    }
  });

  test("dense inline payload preserves every point/result without expanding model content", async () => {
    for (const gridSize of [3, 21]) {
      const places = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`ChIJ${i}`, { name: `Business ${i}`, address: `${i} Main Street`, lat: 41, lng: -81, rating: 4.7, reviews: 150, phone: "555-0100", url: "https://example.test/business", arp: 10, atrp: 12, solv: 30 }]));
      const dense = { ...completed, grid_size: gridSize, places, data_points: Array.from({ length: gridSize ** 2 }, (_, i) => ({ lat: 41 + i / 1000, lng: -81 - i / 1000, rank: 2, results: Array.from({ length: 20 }, (_, rank) => ({ rank: rank + 1, place_id: `ChIJ${(i + rank) % 100}`, name: `Business ${(i + rank) % 100}`, distance: "0.5" })) })) };
      responseBody = { success: true, data: dense };
      const result = await (await connect("chatgpt")).callTool({ name: "getLocalFalconReport", arguments: { reportKey, fieldmask: "report_key,arp" } });
      const decoded = reportFromToolResult(result);
      expect(decoded.data_points).toHaveLength(gridSize ** 2);
      expect(decoded.data_points.at(-1).results).toHaveLength(20);
      expect(decoded.places).toEqual(places);
      expect(payload(result)).toEqual({ report_key: reportKey, arp: 2 });
      const bytes = { gridSize, model: Buffer.byteLength(textOf(result)), widget: Buffer.byteLength(JSON.stringify(result._meta)), total: Buffer.byteLength(JSON.stringify(result)) };
      console.info("Synthetic inline report payload bytes:", JSON.stringify(bytes));
    }
    expect(requests).toHaveLength(2);
  });
});
