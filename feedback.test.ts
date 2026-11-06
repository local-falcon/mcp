import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// External I/O is replaced at the HTTP boundary. API calls are recorded with
// their form fields; any other host is an image download served from `images`.
type Recorded = { url: string; method: string; fields: Record<string, string> };
const requests: Recorded[] = [];
const downloads: string[] = [];
let responseBody: unknown = { success: true, data: {} };
let responseStatus = 200;
let networkError: string | null = null;
const images = new Map<string, { status: number; body?: Buffer; location?: string }>();

mock.module("node-fetch", () => ({
  default: async (url: unknown, init?: { method?: string; body?: unknown }) => {
    const href = String(url);
    if (!href.startsWith("https://api.localfalcon.com/")) {
      downloads.push(href);
      const image = images.get(href.split("?")[0]) ?? { status: 404 };
      return {
        ok: image.status >= 200 && image.status < 300,
        status: image.status,
        headers: new Headers(image.location ? { location: image.location } : {}),
        arrayBuffer: async () => image.body ?? new ArrayBuffer(0),
      };
    }
    const fields: Record<string, string> = {};
    if (init?.body instanceof FormData) {
      for (const [key, value] of init.body.entries()) fields[key] = String(value);
    }
    requests.push({ url: href, method: init?.method ?? "GET", fields });
    if (networkError) throw new Error(networkError);
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
const { isBlockedAddress, sniffImageMime } = await import("./feedbackScreenshots");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const pngBase64 = PNG.toString("base64");

const active: Array<{ client: Client; server: ReturnType<typeof getServer> }> = [];

async function connect(opts: { profile?: "normal" | "chatgpt"; localFiles?: boolean } = {}) {
  // In-memory transports have no session ID; this is a fixture credential only.
  const server = runWithRequestSource({ value: opts.profile === "chatgpt" ? "chatgpt" : "claude", tier: 4 },
    () => getServer(new Map([[undefined as any, { apiKey: "test-only" }]]), undefined, { localFiles: opts.localFiles }));
  const client = new Client({ name: "feedback-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  active.push({ client, server });
  return client;
}

function textOf(result: any): string {
  return result.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}

let tempDir: string;
beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "lf-feedback-"));
  writeFileSync(join(tempDir, "shot.png"), PNG);
  writeFileSync(join(tempDir, "fake.png"), "not an image at all");
  writeFileSync(join(tempDir, "notes.txt"), PNG);
});
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

afterEach(async () => {
  for (const { client, server } of active.splice(0)) {
    await client.close();
    await server.close();
  }
  requests.length = 0;
  downloads.length = 0;
  images.clear();
  responseBody = { success: true, data: {} };
  responseStatus = 200;
  networkError = null;
});

describe("feedback tool registration", () => {
  test("both profiles register all three tools with non-destructive annotations", async () => {
    for (const profile of ["normal", "chatgpt"] as const) {
      const { tools } = await (await connect({ profile })).listTools();
      const byName = new Map(tools.map(t => [t.name, t]));
      expect(byName.get("submitLocalFalconFeedback")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
      expect(byName.get("listLocalFalconFeedback")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(byName.get("getLocalFalconFeedback")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });

  test("submit declares screenshotFiles as an openai/fileParams field with the required file shape", async () => {
    const { tools } = await (await connect({ profile: "chatgpt" })).listTools();
    const submit: any = tools.find(t => t.name === "submitLocalFalconFeedback");
    expect(submit._meta["openai/fileParams"]).toEqual(["screenshotFiles"]);
    const item = submit.inputSchema.properties.screenshotFiles.items;
    expect(Object.keys(item.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect([...item.required].sort()).toEqual(["download_url", "file_id"]);
  });

  test("screenshotPaths is offered only when the server can read local files", async () => {
    const remote: any = (await (await connect()).listTools()).tools.find(t => t.name === "submitLocalFalconFeedback");
    expect(remote.inputSchema.properties.screenshotPaths).toBeUndefined();
    expect(remote.description).not.toContain("screenshotPaths");
    const local: any = (await (await connect({ localFiles: true })).listTools()).tools.find(t => t.name === "submitLocalFalconFeedback");
    expect(local.inputSchema.properties.screenshotPaths).toBeDefined();
    expect(local.description).toContain("screenshotPaths");
  });
});

describe("submitLocalFalconFeedback", () => {
  test("sends snake_case and bracket fields, defaults app_version, and trims the parameters echo", async () => {
    responseBody = { success: true, message: "Your bug report has been submitted.", parameters: { message: "x".repeat(50) }, data: { feedback_key: "a3f9c2e81b7d540", status: "new", screenshot_count: 1 } };
    const client = await connect();
    const result: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: {
      type: "bug", message: "The heatmap is blank", subject: "Blank heatmap", category: "mcp", severity: "high",
      stepsToReproduce: "Open a report", expectedResult: "A map", actualResult: "Nothing",
      placeId: "ChIJ123", reportKey: "abc123", browser: "Chrome",
      screenshotsBase64: [`data:image/png;base64,${pngBase64}`],
    } });
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    const { url, method, fields } = requests[0];
    expect(url.split("?")[0]).toBe("https://api.localfalcon.com/v2/feedback/submit/");
    expect(method).toBe("POST");
    expect(fields).toMatchObject({
      type: "bug", message: "The heatmap is blank", subject: "Blank heatmap", category: "mcp", severity: "high",
      steps_to_reproduce: "Open a report", expected_result: "A map", actual_result: "Nothing",
      place_id: "ChIJ123", report_key: "abc123", "meta[browser]": "Chrome",
      "screenshots_base64[0]": `data:image/png;base64,${pngBase64}`,
    });
    expect(fields["meta[app_version]"]).toStartWith("@local-falcon/mcp ");
    const body = JSON.parse(textOf(result));
    expect(body.data.feedback_key).toBe("a3f9c2e81b7d540");
    expect(body.parameters).toBeUndefined();
  });

  test("drops bug-only fields for other types and keeps a caller-supplied app_version", async () => {
    const client = await connect();
    await client.callTool({ name: "submitLocalFalconFeedback", arguments: {
      type: "feature_request", message: "Add CSV export", severity: "critical", stepsToReproduce: "n/a", appVersion: "my-agent 2.0",
    } });
    const { fields } = requests[0];
    expect(fields.severity).toBeUndefined();
    expect(fields.steps_to_reproduce).toBeUndefined();
    expect(fields["meta[app_version]"]).toBe("my-agent 2.0");
  });

  test("is attempted exactly once on a server error or a network failure", async () => {
    const client = await connect();
    responseStatus = 500;
    responseBody = { code: 500, success: false, message: "An unexpected server error occurred." };
    const failed: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: { type: "feedback", message: "hi" } });
    expect(failed.isError).toBe(true);
    expect(requests).toHaveLength(1);

    requests.length = 0;
    networkError = "network socket disconnected";
    const dropped: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: { type: "feedback", message: "hi" } });
    expect(dropped.isError).toBe(true);
    expect(requests).toHaveLength(1);
  });

  test("rejects bad screenshots locally, before any request", async () => {
    const client = await connect({ localFiles: true });
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ screenshotsBase64: Array(3).fill(pngBase64), screenshotPaths: Array(3).fill(join(tempDir, "shot.png")) }, "at most 5 screenshots"],
      [{ screenshotsBase64: [Buffer.from("plain text, not an image").toString("base64")] }, "Screenshot #1 must be a PNG, JPEG, GIF or WEBP"],
      [{ screenshotsBase64: [pngBase64, "%%%"] }, "Screenshot #2 is not valid base64"],
      [{ screenshotsBase64: ["A".repeat(12 * 1024 * 1024)] }, "larger than 8 MB"],
      [{ screenshotPaths: [join(tempDir, "fake.png")] }, "must be a PNG, JPEG, GIF or WEBP"],
      [{ screenshotPaths: [join(tempDir, "notes.txt")] }, "must be a .png"],
      [{ screenshotPaths: [join(tempDir, "missing.png")] }, "was not found"],
    ];
    for (const [screens, expected] of cases) {
      const result: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: { type: "bug", message: "x", ...screens } });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(expected);
    }
    expect(requests).toHaveLength(0);
  });

  test("reads a local file path into a data URI when the server runs locally", async () => {
    const client = await connect({ localFiles: true });
    const result: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: { type: "bug", message: "x", screenshotPaths: [join(tempDir, "shot.png")] } });
    expect(result.isError).toBeFalsy();
    expect(requests[0].fields["screenshots_base64[0]"]).toBe(`data:image/png;base64,${pngBase64}`);
  });

  test("refuses file paths on a remote server even if the field is sent anyway", async () => {
    const { resolveFeedbackScreenshots } = await import("./feedbackScreenshots");
    await expect(resolveFeedbackScreenshots({ paths: [join(tempDir, "shot.png")] }, { localFiles: false })).rejects.toThrow("STDIO");
  });

  test("downloads ChatGPT file uploads, following and re-checking redirects", async () => {
    images.set("https://files.example.com/a", { status: 302, location: "https://cdn.example.com/a.jpg" });
    images.set("https://cdn.example.com/a.jpg", { status: 200, body: JPEG });
    const client = await connect({ profile: "chatgpt" });
    const result: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: {
      type: "bug", message: "x",
      screenshotFiles: [{ download_url: "https://files.example.com/a", file_id: "file_1", file_name: "a.jpg" }],
      screenshotsBase64: [pngBase64],
    } });
    expect(result.isError).toBeFalsy();
    expect(downloads).toEqual(["https://files.example.com/a", "https://cdn.example.com/a.jpg"]);
    expect(requests[0].fields["screenshots_base64[0]"]).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
    expect(requests[0].fields["screenshots_base64[1]"]).toBe(`data:image/png;base64,${pngBase64}`);
  });

  test("never downloads from non-https, private, or redirected-to-private URLs", async () => {
    images.set("https://files.example.com/hop", { status: 302, location: "https://169.254.169.254/latest/meta-data" });
    const client = await connect();
    for (const download_url of ["http://files.example.com/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://10.1.2.3/a.png", "https://localhost/a.png", "https://files.example.com/hop"]) {
      const result: any = await client.callTool({ name: "submitLocalFalconFeedback", arguments: { type: "bug", message: "x", screenshotFiles: [{ download_url, file_id: "f" }] } });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toStartWith("Feedback was not sent.");
    }
    expect(downloads).toEqual(["https://files.example.com/hop"]);
    expect(requests).toHaveLength(0);
  });

  test("ChatGPT sees the hourly submission limit as a neutral rate-limit message", async () => {
    responseStatus = 429;
    responseBody = { code: 429, success: false, message: "You have submitted the maximum of 20 feedback entries per hour. Please wait and try again.", data: [] };
    const result: any = await (await connect({ profile: "chatgpt" })).callTool({ name: "submitLocalFalconFeedback", arguments: { type: "feedback", message: "hi" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("limit for this action has been reached");
  });
});

describe("listLocalFalconFeedback and getLocalFalconFeedback", () => {
  test("list sends filters and pagination as query parameters", async () => {
    await (await connect()).callTool({ name: "listLocalFalconFeedback", arguments: { type: "bug", status: "in_progress", limit: 25, nextToken: "tok" } });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/feedback/");
    expect(requests[0].method).toBe("GET");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: "bug", status: "in_progress", limit: "25", next_token: "tok" });
  });

  test("list defaults the page size", async () => {
    await (await connect()).callTool({ name: "listLocalFalconFeedback", arguments: {} });
    expect(new URL(requests[0].url).searchParams.get("limit")).toBe("10");
  });

  test("get puts the key in the path and rejects malformed keys", async () => {
    const client = await connect();
    await client.callTool({ name: "getLocalFalconFeedback", arguments: { feedbackKey: "a3f9c2e81b7d540" } });
    expect(new URL(requests[0].url).pathname).toBe("/v2/feedback/a3f9c2e81b7d540/");
    requests.length = 0;
    for (const feedbackKey of ["../account", "a/b", ""]) {
      let rejected = false;
      try {
        rejected = ((await client.callTool({ name: "getLocalFalconFeedback", arguments: { feedbackKey } })) as any).isError === true;
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
    }
    expect(requests).toHaveLength(0);
  });

  test("get explains a 404 in feedback terms", async () => {
    responseStatus = 404;
    responseBody = { code: 404, success: false, message: "The feedback you requested is not available or you do not have permission to view it.", data: [] };
    const result: any = await (await connect()).callTool({ name: "getLocalFalconFeedback", arguments: { feedbackKey: "nope" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Feedback not found");
    expect(textOf(result)).not.toContain("reportKey");
  });
});

describe("screenshot helpers", () => {
  test("sniffs image types from magic bytes", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(Buffer.from("GIF89a......"))).toBe("image/gif");
    expect(sniffImageMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("<svg></svg>"))).toBeNull();
  });

  test("blocks non-public addresses and allows public ones", () => {
    for (const address of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2002:c0a8:0101::1", "64:ff9b::a00:1", "not-an-ip"]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    for (const address of ["8.8.8.8", "151.101.1.69", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});
