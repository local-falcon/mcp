import { afterEach, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// External I/O is replaced at the HTTP boundary. No test can reach a paid API.
// Each recorded request keeps its URL and flattened form fields.
type Recorded = { url: string; fields: Record<string, string> };
const requests: Recorded[] = [];
let responseBody: unknown = { success: true, data: {} };
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
  const client = new Client({ name: "campaigns-test", version: "1" });
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
  responseBody = { success: true, data: {} };
});

/** Schema rejection surfaces as either a thrown McpError or an isError result. */
async function rejected(client: Client, name: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const result: any = await client.callTool({ name, arguments: args });
    return result.isError === true;
  } catch {
    return true;
  }
}

const CREATE = {
  name: "New client",
  measurement: "mi",
  gridSize: "7",
  radius: 3,
  frequency: "monthly",
  placeId: "ChIJ-a,ChIJ-b",
  keyword: "{category} {city}",
  startDate: "12/01/2026",
  startTime: "9:00 AM",
};

describe("campaign platforms", () => {
  test("create sends normalized platforms as the singular `platform` field", async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: "createLocalFalconCampaign", arguments: { ...CREATE, platforms: "native, ChatGPT,gaio,native" } });
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/campaigns/create");
    expect(requests[0].fields.platform).toBe("native,chatgpt,gaio");
    expect(requests[0].fields.platforms).toBeUndefined();
  });

  test("create without platforms leaves the API default (maps only)", async () => {
    const client = await connect();
    await client.callTool({ name: "createLocalFalconCampaign", arguments: CREATE });
    expect(requests[0].fields.platform).toBeUndefined();
  });

  test("placeholder keywords are sent unexpanded", async () => {
    const client = await connect();
    await client.callTool({ name: "createLocalFalconCampaign", arguments: CREATE });
    expect(requests[0].fields.keyword).toBe("{category} {city}");
  });

  test("unknown platforms are refused before any request, on create and update", async () => {
    const client = await connect();
    expect(await rejected(client, "createLocalFalconCampaign", { ...CREATE, platforms: "native,bing" })).toBe(true);
    expect(await rejected(client, "updateLocalFalconCampaign", { campaignKey: "abc", action: "add-location", placeId: "ChIJ-a", platforms: "grok" })).toBe(true);
    expect(requests).toHaveLength(0);
  });

  test("update sends normalized platforms as `platforms`", async () => {
    const client = await connect();
    await client.callTool({ name: "updateLocalFalconCampaign", arguments: { campaignKey: "abc", action: "modify-location", placeId: "ChIJ-a", platforms: "Google, AIMODE" } });
    expect(requests[0].fields.platforms).toBe("google,aimode");
  });
});

describe("campaign keyword type and per-location settings", () => {
  test("create sends keywordType as `keyword_type`", async () => {
    const client = await connect();
    await client.callTool({ name: "createLocalFalconCampaign", arguments: { ...CREATE, keywordType: "traditional" } });
    expect(requests[0].fields.keyword_type).toBe("traditional");
  });

  test("create sends locationSettings as JSON keyed by Place ID with the API's snake_case keys", async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: "createLocalFalconCampaign", arguments: {
      ...CREATE,
      locationSettings: [
        { placeId: " ChIJ-b ", gridSize: "9", radius: "2.5", platforms: "Native, chatgpt,native" },
        { placeId: "ChIJ-a", measurement: "km" },
      ],
    } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(requests[0].fields.location_settings)).toEqual({
      "ChIJ-b": { grid_size: "9", radius: "2.5", platforms: "native,chatgpt" },
      "ChIJ-a": { measurement: "km" },
    });
  });

  test("create leaves keyword_type and location_settings out when not given", async () => {
    const client = await connect();
    await client.callTool({ name: "createLocalFalconCampaign", arguments: { ...CREATE, locationSettings: [] } });
    expect(requests[0].fields.keyword_type).toBeUndefined();
    expect(requests[0].fields.location_settings).toBeUndefined();
  });

  test("bad locationSettings are refused before any request", async () => {
    const client = await connect();
    const create = (locationSettings: unknown[]) => rejected(client, "createLocalFalconCampaign", { ...CREATE, locationSettings });
    expect(await create([{ placeId: "ChIJ-zzz", gridSize: "9" }])).toBe(true);
    expect(await create([{ placeId: "ChIJ-a", gridSize: "9" }, { placeId: "ChIJ-a", radius: 2 }])).toBe(true);
    expect(await create([{ placeId: "ChIJ-a" }])).toBe(true);
    expect(await create([{ placeId: "ChIJ-a", platforms: "native,grok" }])).toBe(true);
    expect(await create([{ placeId: "ChIJ-a", gridSize: "8" }])).toBe(true);
    expect(await create([{ placeId: "ChIJ-a", radius: 500 }])).toBe(true);
    expect(requests).toHaveLength(0);
  });

  test("create and update accept the every-N-weeks frequencies", async () => {
    const client = await connect();
    await client.callTool({ name: "createLocalFalconCampaign", arguments: { ...CREATE, frequency: "every-3-weeks" } });
    await client.callTool({ name: "updateLocalFalconCampaign", arguments: { campaignKey: "abc", action: "update-settings", frequency: "every-4-weeks" } });
    expect(requests[0].fields.frequency).toBe("every-3-weeks");
    expect(requests[1].fields.frequency).toBe("every-4-weeks");
  });
});

describe("campaign tool descriptions", () => {
  test("create and update document keyword placeholders, and create offers platforms", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const create: any = tools.find(t => t.name === "createLocalFalconCampaign");
    const update: any = tools.find(t => t.name === "updateLocalFalconCampaign");
    expect(create.description).toContain("{category}");
    expect(create.inputSchema.properties.keyword.description).toContain("{state_code}");
    expect(update.inputSchema.properties.keyword.description).toContain("{city}");
    expect(create.inputSchema.properties.platforms.description).toContain("chatgpt");
  });

  test("scan list explains that campaign scans are listed individually", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const list: any = tools.find(t => t.name === "listLocalFalconScanReports");
    expect(list.description).toContain("Campaign scans are listed here too");
  });
});

describe("campaign report run date", () => {
  const KEY = "d99524e4bcdebc4";
  const runOf = (url: string) => new URL(url).searchParams.get("run");

  test("ISO run dates pass through unchanged", async () => {
    const client = await connect();
    await client.callTool({ name: "getLocalFalconCampaignReport", arguments: { reportKey: KEY, run: "2026-10-23" } });
    expect(runOf(requests[0].url)).toBe("2026-10-23");
  });

  test("MM/DD/YYYY run dates are converted to the API's YYYY-MM-DD", async () => {
    const client = await connect();
    await client.callTool({ name: "getLocalFalconCampaignReport", arguments: { reportKey: KEY, run: "10/23/2026" } });
    await client.callTool({ name: "getLocalFalconCampaignReport", arguments: { reportKey: KEY, run: "3/5/2026" } });
    expect(runOf(requests[0].url)).toBe("2026-10-23");
    expect(runOf(requests[1].url)).toBe("2026-03-05");
  });

  test("an omitted run requests the latest run", async () => {
    const client = await connect();
    await client.callTool({ name: "getLocalFalconCampaignReport", arguments: { reportKey: KEY } });
    expect(runOf(requests[0].url)).toBeNull();
  });

  test("malformed run dates are refused before any request", async () => {
    const client = await connect();
    expect(await rejected(client, "getLocalFalconCampaignReport", { reportKey: KEY, run: "Oct 23" })).toBe(true);
    expect(requests).toHaveLength(0);
  });
});
