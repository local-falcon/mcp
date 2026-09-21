import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]);
}

const bundles = ["skills/local-falcon-mcp", "skills/local-visibility-skill"];
describe("ChatGPT skill upload bundles", () => {
  for (const bundle of bundles) {
    test(`${bundle}: every bundled file is free of commerce CTAs and unavailable tools`, () => {
      for (const file of filesBelow(bundle)) {
        const content = readFileSync(file, "utf8");
        expect(content, file).not.toMatch(/purchase more credits|enable auto[- ]recharge|please upgrade|upgrade (?:your|the) (?:subscription|package|plan)|\/billing\/(?:purchase-credits|auto-recharge)|https?:\/\/[^\s)"<>]*(?:checkout|\/upgrade)|\b(?:37|38) tools\b|\$19\/location/i);
        expect(content, file).not.toMatch(/getLocalFalcon(?:GoogleBusinessLocations|RankingAtCoordinate|KeywordAtCoordinate)/);
        expect(content, file).not.toMatch(/\bgrok\b|Falcon Agent|ORCHESTRATION MODE|GUIDANCE MODE/i);
        expect(content, file).not.toMatch(/(?<![\d.])(?:97|7|32|33|46|92|34\.5)%|16 simultaneous searches|Mapbox.powered|Bing is ChatGPT.s primary|Foursquare.{0,12}critical/i);
      }
    });
    test(`${bundle}: entry point is scoped and states existing-credit rules`, () => {
      const content = readFileSync(join(bundle, "SKILL.md"), "utf8");
      expect(content).toMatch(/^---\r?\nname: [a-z0-9-]+\r?\ndescription: \|\r?\n  Use when /);
      expect(content).toContain("2 existing Local Falcon credits");
      expect(content).toContain("existing-account integration");
      expect(content).toContain("https://www.localfalcon.com/pricing");
    });
  }
  test("tool reference enumerates the entire submitted ChatGPT profile", () => {
    const content = readFileSync("skills/local-visibility-skill/references/mcp-workflows.md", "utf8");
    const tools = [...content.matchAll(/^\| `([A-Za-z]+)` \|/gm)].map(match => match[1]);
    expect(new Set(tools).size).toBe(57);
    expect(tools).toContain("getLocalFalconGrid");
    expect(tools).toContain("searchForLocalFalconBusinessLocation");
    expect(tools).toContain("updateLocalFalconCampaign");
    const source = readFileSync("server.ts", "utf8");
    const excluded = new Set(["getLocalFalconGoogleBusinessLocations", "getLocalFalconRankingAtCoordinate", "getLocalFalconKeywordAtCoordinate"]);
    const registered = [...source.matchAll(/(?:registerTool\(|registerProfileAppTool\(|server\.tool\(|registerAppTool\(server,)\s*"([A-Za-z]+)",/g)]
      .map(match => match[1]).filter(name => !excluded.has(name));
    expect([...tools].sort()).toEqual(registered.sort());
  });
  test("operational guidance uses existing approval and contextual balances", () => {
    const content = readFileSync("skills/local-falcon-mcp/SKILL.md", "utf8");
    expect(content).toContain("do not require a second confirmation");
    expect(content).toContain("check the available existing-credit balance for context");
    expect(content).not.toMatch(/always confirm with the user|verify sufficient credits/i);
    for (const workflow of ["runLocalFalconScan", "createLocalFalconCampaign", "getLocalFalconReport", "getLocalFalconGuardReport", "getLocalFalconReviewsAnalysisReport", "getLocalFalconGbpProfile"]) {
      expect(content).toContain(workflow);
    }
    for (const file of filesBelow("skills/local-falcon-mcp")) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/normal for SABs|expected SAB behavior|Weak rankings near the office are NOT a problem|If SAB with offset pattern: This is likely expected/);
    }
  });
  test("educational bundle supports disconnected use and separates awareness-only platforms", () => {
    const content = readFileSync("skills/local-visibility-skill/SKILL.md", "utf8");
    expect(content).toMatch(/educational guidance without a connected account/i);
    expect(content).toContain("do not invent account data or metrics");
    expect(content).toContain("rather than assuming a fixed provider hierarchy");
    expect(content).not.toMatch(/small improvements will push/i);
    const metadata = JSON.parse(readFileSync("skills/local-visibility-skill/marketplace.json", "utf8"));
    expect(metadata.capabilities.ai_platforms_covered).not.toContain("perplexity");
    expect(metadata.capabilities.awareness_only_platforms).toContain("perplexity");
    const reference = readFileSync("skills/local-visibility-skill/references/ai-platforms.md", "utf8");
    expect(reference).toMatch(/Local Falcon does not currently track Perplexity/i);
  });
});
