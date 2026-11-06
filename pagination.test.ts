import { afterEach, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// External I/O is replaced at the HTTP boundary. No test can reach a paid API.
// The v1 list tools send `limit`, `next_token` and filters as the POST form
// body the API spec documents (docs.localfalcon.com/openapi.yaml). Each
// recorded request keeps its form fields so that placement can be asserted.
type Recorded = { url: string; fields: Record<string, string> };
const requests: Recorded[] = [];
let responseBody: unknown = {};
mock.module("node-fetch", () => ({
  default: async (url: unknown, init?: { body?: unknown }) => {
    const fields: Record<string, string> = {};
    if (init?.body instanceof FormData) {
      for (const [key, value] of init.body.entries()) fields[key] = String(value);
    }
    requests.push({ url: String(url), fields });
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  },
}));
const { getServer } = await import("./server");
const { runWithRequestSource } = await import("./requestSource");

const active: Array<{ client: Client; server: ReturnType<typeof getServer> }> = [];

async function connect() {
  // In-memory transports have no session ID; this is a fixture credential only.
  const server = runWithRequestSource({ value: "claude", tier: 4 },
    () => getServer(new Map([[undefined as any, { apiKey: "test-only" }]])));
  const client = new Client({ name: "pagination-test", version: "1" });
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
  responseBody = {};
});

function textOf(result: any): string {
  return result.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
}
function payload(result: any): any { return JSON.parse(textOf(result)); }

/** Schema rejection surfaces as either a thrown McpError or an isError result. */
async function rejected(client: Client, name: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const result: any = await client.callTool({ name, arguments: args });
    return result.isError === true;
  } catch {
    return true;
  }
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ report_key: `r${i}`, key: `g${i}` }));
const page = (n: number, nextToken: string) =>
  ({ success: true, data: { count: n, total: 60, next_token: nextToken, reports: rows(n), groups: rows(n) } });

const LIST_TOOLS: Array<{ name: string; path: string; limit: number }> = [
  { name: "listLocalFalconScanReports", path: "/v1/reports/", limit: 50 },
  { name: "listLocalFalconTrendReports", path: "/v1/trend-reports/", limit: 50 },
  { name: "listLocalFalconAutoScans", path: "/v1/autoscans/", limit: 50 },
  { name: "listLocalFalconLocationReports", path: "/v1/location-reports/", limit: 50 },
  { name: "listLocalFalconLocationGroups", path: "/v1/location-groups/", limit: 500 },
  { name: "listLocalFalconKeywordReports", path: "/v1/keyword-reports/", limit: 50 },
  { name: "getLocalFalconCompetitorReports", path: "/v1/competitor-reports/", limit: 50 },
  { name: "listLocalFalconCampaignReports", path: "/v1/campaigns/", limit: 50 },
  { name: "listLocalFalconGuardReports", path: "/v1/guard/", limit: 50 },
  { name: "listAllLocalFalconLocations", path: "/v1/locations/", limit: 50 },
];

describe("v1 list tools send pagination in the form body", () => {
  for (const { name, path, limit } of LIST_TOOLS) {
    test(`${name} posts limit and next_token as form fields to ${path}`, async () => {
      const client = await connect();
      responseBody = page(3, "next-page");
      const result: any = await client.callTool({ name, arguments: { limit, nextToken: "abc" } });
      expect(result.isError).toBeFalsy();
      expect(requests).toHaveLength(1);
      const url = new URL(requests[0].url);
      expect(url.pathname).toBe(path);
      expect(url.searchParams.has("limit")).toBe(false);
      expect(url.searchParams.has("next_token")).toBe(false);
      expect(requests[0].fields.limit).toBe(String(limit));
      expect(requests[0].fields.next_token).toBe("abc");
    });
  }

  test("filters travel in the body alongside the page token", async () => {
    const client = await connect();
    responseBody = page(1, "");
    await client.callTool({ name: "listLocalFalconScanReports", arguments: { limit: 25, nextToken: "abc", placeId: "ChIJ-x", platform: "google" } });
    expect(requests[0].fields).toMatchObject({ limit: "25", next_token: "abc", place_id: "ChIJ-x", platform: "google" });
    expect(new URL(requests[0].url).searchParams.has("place_id")).toBe(false);
  });

  test("an omitted limit sends the default page size of 10", async () => {
    const client = await connect();
    responseBody = page(1, "");
    await client.callTool({ name: "listLocalFalconScanReports", arguments: {} });
    expect(requests[0].fields.limit).toBe("10");
    expect(requests[0].fields.next_token).toBeUndefined();
  });

  test("saved locations forward query and the gbpLinked filter with the page token", async () => {
    const client = await connect();
    responseBody = { success: true, data: { count: 1, total: 726, next_token: "loc-2", locations: [{ place_id: "ChIJ-a" }] } };
    const result = payload(await client.callTool({ name: "listAllLocalFalconLocations", arguments: { query: "roof", gbpLinked: true, limit: 25, nextToken: "loc-1" } }));
    expect(requests[0].fields).toMatchObject({ query: "roof", gbp_linked: "true", limit: "25", next_token: "loc-1" });
    expect(result.data.next_token).toBe("loc-2");
  });

  test("gbp_linked is omitted unless requested", async () => {
    const client = await connect();
    responseBody = { success: true, data: { locations: [] } };
    await client.callTool({ name: "listAllLocalFalconLocations", arguments: {} });
    expect(requests[0].fields.gbp_linked).toBeUndefined();
    expect(requests[0].fields.limit).toBe("10");
  });

  test("a numeric-string limit is coerced", async () => {
    const client = await connect();
    responseBody = page(1, "");
    await client.callTool({ name: "listLocalFalconCampaignReports", arguments: { limit: "40" } });
    expect(requests[0].fields.limit).toBe("40");
  });
});

describe("pages are returned whole", () => {
  test("rows beyond the requested limit are not trimmed, and next_token survives", async () => {
    const client = await connect();
    responseBody = page(25, "page-two");
    const result = payload(await client.callTool({ name: "listLocalFalconScanReports", arguments: { limit: 10 } }));
    expect(result.reports).toHaveLength(25);
    expect(result.next_token).toBe("page-two");
    expect(result.total).toBe(60);
  });

  test("projected list shapes keep count, total and next_token", async () => {
    const client = await connect();
    for (const name of ["listLocalFalconLocationReports", "listLocalFalconLocationGroups"]) {
      responseBody = page(2, "more");
      const result = payload(await client.callTool({ name, arguments: {} }));
      expect(result).toMatchObject({ count: 2, total: 60, next_token: "more" });
    }
  });

  test("fieldmask responses are not trimmed either", async () => {
    const client = await connect();
    responseBody = page(12, "fm-next");
    const result = payload(await client.callTool({ name: "listLocalFalconTrendReports", arguments: { limit: 5, fieldmask: "report_key" } }));
    expect(result.reports).toHaveLength(12);
    expect(result.next_token).toBe("fm-next");
  });
});

describe("limit bounds follow the API spec", () => {
  test("out-of-range limits are refused before any request", async () => {
    const client = await connect();
    expect(await rejected(client, "listLocalFalconScanReports", { limit: 101 })).toBe(true);
    expect(await rejected(client, "listLocalFalconScanReports", { limit: 0 })).toBe(true);
    expect(await rejected(client, "listLocalFalconScanReports", { limit: 2.5 })).toBe(true);
    expect(await rejected(client, "listLocalFalconLocationGroups", { limit: 1001 })).toBe(true);
    expect(await rejected(client, "listLocalFalconGuardReports", { limit: 2 })).toBe(true);
    expect(requests).toHaveLength(0);
  });

  test("location groups accept up to 1000 per page", async () => {
    const client = await connect();
    responseBody = page(1, "");
    const result: any = await client.callTool({ name: "listLocalFalconLocationGroups", arguments: { limit: 1000 } });
    expect(result.isError).toBeFalsy();
    expect(requests[0].fields.limit).toBe("1000");
  });
});
