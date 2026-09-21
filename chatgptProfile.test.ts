import { afterEach, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// External I/O is replaced at the HTTP boundary. No test can reach a paid API.
let responseBody: unknown = {};
let responseStatus = 200;
const requests: string[] = [];
mock.module("node-fetch", () => ({
  default: async (url: unknown) => {
    requests.push(String(url));
    return {
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  },
}));
const { getServer } = await import("./server");
const originalProfile = process.env.LOCAL_FALCON_MCP_PROFILE;
const active: Array<{ client: Client; server: ReturnType<typeof getServer> }> = [];

async function connect(profile: string) {
  process.env.LOCAL_FALCON_MCP_PROFILE = profile;
  // In-memory transports have no session ID; this is a fixture credential only.
  const server = getServer(new Map([[undefined as any, { apiKey: "test-only" }]]));
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
  if (originalProfile === undefined) delete process.env.LOCAL_FALCON_MCP_PROFILE;
  else process.env.LOCAL_FALCON_MCP_PROFILE = originalProfile;
  requests.length = 0;
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

describe("deployment profile and actual MCP discovery", () => {
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

  test("profile is fixed when server is created and unknown deployment values fail closed", async () => {
    const client = await connect("chatgpt");
    process.env.LOCAL_FALCON_MCP_PROFILE = "normal";
    expect((await client.listTools()).tools).toHaveLength(57);
    process.env.LOCAL_FALCON_MCP_PROFILE = "chatgtp";
    expect(() => getServer(new Map())).toThrow(/profile/i);
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

