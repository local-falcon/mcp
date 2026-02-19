# CLAUDE.md — @local-falcon/mcp

## Project Overview

This is the **Local Falcon MCP Server** (`@local-falcon/mcp`), a Model Context Protocol server that wraps the [Local Falcon API](https://docs.localfalcon.com). It enables AI agents to run geo-grid rank tracking scans, retrieve reports, manage campaigns, monitor Google Business Profiles, and analyze competitive positioning across Google Maps, Apple Maps, and AI search platforms.

**Package:** `@local-falcon/mcp` (npm)
**License:** MIT
**Runtime:** Node.js / Bun
**Language:** TypeScript (strict mode)

## Architecture

```
index.ts          → Entry point. Transport selection (STDIO, SSE, HTTP), session management, OAuth 2.1
server.ts         → MCP tool registrations. Exports getServer() which creates McpServer with 37 tools
localfalcon.ts    → API client layer. All fetch functions, rate limiting, retry logic, timeout handling
oauth/            → OAuth 2.1 authorization server (routes, provider, config, state/client stores)
```

### Key Design Patterns

- **`server.ts`** exports a single `getServer(sessionMapping)` function that creates and returns an `McpServer` instance with all 37 tools registered via `server.tool(name, description, zodSchema, handler)`.
- **`localfalcon.ts`** contains one exported function per API endpoint. Two call patterns:
  - **URL params (v1):** `new URL(endpoint)` → `url.searchParams.set()` → POST with JSON headers
  - **FormData (v2):** `new FormData()` → `form.append()` → POST with form body
- **API key resolution:** `getApiKey(ctx)` checks the session mapping first (for OAuth-authenticated remote sessions), then falls back to `process.env.LOCAL_FALCON_API_KEY` (for STDIO/local use).
- **`handleNullOrUndefined()`** converts null/undefined Zod outputs to empty strings before passing to API client functions. The API client functions then use `if (value)` guards to skip empty params.

### Infrastructure (localfalcon.ts)

| Component | Details |
|---|---|
| Rate Limiter | Sliding window, 5 requests per 1000ms |
| Retry | Exponential backoff, 3 retries, 1s initial delay. Retries on network errors, timeouts, 5xx responses |
| Timeout | 30s default (`DEFAULT_TIMEOUT_MS`), 60s for long operations (`LONG_OPERATION_TIMEOUT_MS`) |
| JSON Parsing | `safeParseJson()` helper with error logging |

### Transport Modes

Started via CLI argument to `index.ts`:

| Mode | Command | Description |
|---|---|---|
| `stdio` (default) | `bun run index.ts` or `bun run index.ts stdio` | Standard I/O for local MCP clients |
| `sse` | `bun run index.ts sse` | Server-Sent Events, OAuth 2.1 protected |
| `http` | `bun run index.ts http` | Streamable HTTP, OAuth 2.1 protected |
| `HTTPAndSSE` | `bun run index.ts HTTPAndSSE` | Both HTTP and SSE on same server |

Remote modes (SSE, HTTP) use OAuth 2.1 with PKCE for authentication. The server implements RFC 8414 (Authorization Server Metadata), RFC 9728 (Protected Resource Metadata), and RFC 7591 (Dynamic Client Registration).

## Tool Inventory

### Reports — List & Retrieve (20 tools, all support `fieldmask`)

| Tool | Description |
|---|---|
| `listLocalFalconScanReports` | List scan reports. Filter by placeId, keyword, platform, gridSize, date range, campaignKey |
| `getLocalFalconReport` | Get a specific scan report by report_key |
| `listLocalFalconTrendReports` | List trend reports. Filter by placeId, keyword, platform, date range |
| `getLocalFalconTrendReport` | Get a specific trend report by report_key |
| `listLocalFalconLocationReports` | List location reports. Filter by placeId, keyword, date range |
| `getLocalFalconLocationReport` | Get a specific location report by report_key |
| `listLocalFalconKeywordReports` | List keyword reports. Filter by keyword, date range |
| `getLocalFalconKeywordReport` | Get a specific keyword report by report_key |
| `getLocalFalconCompetitorReports` | List competitor reports. Filter by placeId, keyword, gridSize, date range |
| `getLocalFalconCompetitorReport` | Get a specific competitor report by report_key |
| `listLocalFalconCampaignReports` | List campaign reports. Filter by placeId, date range, runDate |
| `getLocalFalconCampaignReport` | Get a specific campaign report by report_key, optional run date |
| `listLocalFalconGuardReports` | List Falcon Guard reports. Filter by status, date range |
| `getLocalFalconGuardReport` | Get a specific guard report by placeId, optional date range |
| `listLocalFalconReviewsAnalysisReports` | List reviews analysis reports. Filter by placeId, frequency, reviewsKey |
| `getLocalFalconReviewsAnalysisReport` | Get a specific reviews analysis report by report_key |
| `listAllLocalFalconLocations` | List all saved locations in the account. Filter by query |
| `getLocalFalconGoogleBusinessLocations` | Search Google for business listings by query, optional near filter |
| `listLocalFalconAutoScans` | List individually scheduled auto-scans. Filter by placeId, keyword, gridSize, frequency, status, platform |
| `viewLocalFalconAccountInformation` | Get account info (user, credits, subscription). Optional returnField filter |

### Actions (17 tools, no fieldmask)

| Tool | Description |
|---|---|
| `runLocalFalconScan` | Run a new geo-grid scan (costs credits) |
| `createLocalFalconCampaign` | Create a scheduled campaign |
| `runLocalFalconCampaign` | Manually trigger a campaign run (costs credits) |
| `pauseLocalFalconCampaign` | Pause a campaign schedule |
| `resumeLocalFalconCampaign` | Resume a paused/deactivated campaign |
| `reactivateLocalFalconCampaign` | Reactivate a campaign deactivated for insufficient credits |
| `addLocationsToFalconGuard` | Add location(s) to Falcon Guard monitoring |
| `pauseFalconGuardProtection` | Pause Guard monitoring for location(s) |
| `resumeFalconGuardProtection` | Resume Guard monitoring for location(s) |
| `removeFalconGuardProtection` | Remove location(s) from Guard entirely |
| `searchForLocalFalconBusinessLocation` | Search for businesses on Google or Apple Maps |
| `saveLocalFalconBusinessLocationToAccount` | Save a business to the Local Falcon account |
| `getLocalFalconGrid` | Generate grid coordinates for manual single-point checks |
| `getLocalFalconRankingAtCoordinate` | Check ranking at a single coordinate |
| `getLocalFalconKeywordAtCoordinate` | Get raw SERP data at a single coordinate |
| `searchLocalFalconKnowledgeBase` | Search the help/docs knowledge base |
| `getLocalFalconKnowledgeBaseArticle` | Get full content of a knowledge base article |

## Valid Enum Values

All enum values are validated via Zod schemas in `server.ts`.

### Platform

**`runLocalFalconScan`:**
`google`, `apple`, `gaio`, `chatgpt`, `gemini`, `grok`, `aimode`, `giao`

**Filter/list tools (`listLocalFalconScanReports`, `listLocalFalconTrendReports`, `listLocalFalconAutoScans`):**
`google`, `apple`, `gaio`, `chatgpt`, `gemini`, `grok`

**`searchForLocalFalconBusinessLocation`:**
`google`, `apple`

### Grid Size

**`runLocalFalconScan`:**
`3`, `5`, `7`, `9`, `11`, `13`, `15`

**Filter/list tools (`listLocalFalconScanReports`, `listLocalFalconAutoScans`) and `createLocalFalconCampaign`:**
`3`, `5`, `7`, `9`, `11`, `13`, `15`, `17`, `19`, `21`

**`getLocalFalconCompetitorReports`:**
`3`, `5`, `7`, `9`, `11`, `13`, `15`

### Measurement
`mi`, `km`

### Frequency (campaigns and auto-scans)
`one-time`, `daily`, `weekly`, `biweekly`, `monthly`

### Reviews Analysis Frequency
`one_time`, `daily`, `weekly`, `two_weeks`, `three_weeks`, `four_weeks`, `monthly`

### Guard Report Status
`protected`, `paused`

### Account Return Field
`user`, `credit package`, `subscription`, `credits`

## Fieldmask Support

All 20 get/list tools accept an optional `fieldmask` parameter — a comma-separated string of field names to return from the API.

### Syntax
- Dot notation for nested fields: `location.name`, `statistics.metrics.primaryBusiness`
- Wildcards for arrays: `scans.*.arp`, `businesses.*.name`
- Passed to the API as either a URL query parameter (`fieldmask=...`) or a FormData field (`fieldmask`), depending on the endpoint pattern

### Implementation
In `server.ts`, the `fieldmask` parameter is defined as `z.string().nullish()` on every get/list tool schema. It is passed through `handleNullOrUndefined()` to the corresponding `localfalcon.ts` function, which appends it to the request only when non-empty.

## Parameter Naming Conventions

Parameters use **camelCase** in the Zod schemas (server.ts) and are converted to **snake_case** when sent to the API (localfalcon.ts):

| Server (camelCase) | API (snake_case) |
|---|---|
| `placeId` | `place_id` |
| `reportKey` | `report_key` |
| `campaignKey` | `campaign_key` |
| `gridSize` | `grid_size` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| `nextToken` | `next_token` |
| `aiAnalysis` | `ai_analysis` |
| `reviewsKey` | `reviews_key` |
| `guardKey` | `guard_key` |
| `returnField` | `return` |
| `runDate` | `run` |

## API Versions

The Local Falcon API has two base URLs used by `localfalcon.ts`:

- **v1** (`https://api.localfalcon.com/v1`): Reports, trend reports, keyword reports, location reports, competitor reports, campaign list/detail, guard list/detail, grid, result, search, places, reviews, knowledge base
- **v2** (`https://api.localfalcon.com/v2`): Run scan, locations search/add, guard add/pause/resume/delete, campaigns create/run/pause/resume/reactivate, account, knowledge base

Public API documentation: [docs.localfalcon.com](https://docs.localfalcon.com)

## Development

### Prerequisites
- Node.js 18+ or Bun
- TypeScript 5.8+

### Setup
```bash
npm install        # or: bun install
cp .env.example .env.local
# Add your LOCAL_FALCON_API_KEY to .env.local
```

### Build & Type Check
```bash
npx tsc --noEmit         # Type check only (strict mode, zero warnings expected)
npm run build             # Build to dist/ (uses --noCheck for speed)
```

### Run
```bash
npm run start             # STDIO mode (default)
npm run start:sse         # SSE mode with OAuth
npm run start:http        # HTTP mode with OAuth
npm run start:HTTPAndSSE  # Both SSE and HTTP
```

### Inspect
```bash
npm run inspector         # Launch MCP Inspector UI
```

### Docker
```bash
npm run docker:build
npm run docker:run
```

### TypeScript Configuration
- Target: ES2022
- Module: NodeNext
- Strict mode enabled
- Output: `./dist`

## Project Constants

| Constant | Value | Location |
|---|---|---|
| `DEFAULT_LIMIT` | `"10"` | server.ts — default page size for list endpoints |
| `DEFAULT_TIMEOUT_MS` | `30000` | localfalcon.ts |
| `LONG_OPERATION_TIMEOUT_MS` | `60000` | localfalcon.ts |
| `MAX_RETRIES` | `3` | localfalcon.ts |
| `INITIAL_RETRY_DELAY_MS` | `1000` | localfalcon.ts |
| `RATE_LIMIT_MAX_REQUESTS` | `5` | localfalcon.ts |
| `RATE_LIMIT_WINDOW_MS` | `1000` | localfalcon.ts |

## File Reference

| File | Purpose |
|---|---|
| `index.ts` | Entry point — transport selection, session management, Express app, OAuth routes |
| `server.ts` | MCP server factory — `getServer()` with all 37 tool registrations |
| `localfalcon.ts` | API client — fetch functions, rate limiter, retry logic, types |
| `oauth/` | OAuth 2.1 implementation (authorization, tokens, PKCE, client registration) |
| `package.json` | Package config, scripts, dependencies |
| `tsconfig.json` | TypeScript compiler configuration |
| `.env.example` | Environment variable template |
| `Dockerfile` | Container build configuration |
| `_spec/` | Internal development specs (gitignored, not published) |
