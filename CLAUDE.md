# CLAUDE.md — @local-falcon/mcp

## Project Overview

This is the **Local Falcon MCP Server** (`@local-falcon/mcp`), a Model Context Protocol server that wraps the [Local Falcon API](https://docs.localfalcon.com). It enables AI agents to run geo-grid rank tracking scans, retrieve reports, manage campaigns, monitor Google Business Profiles, and analyze competitive positioning across Google Maps, Apple Maps, and AI search platforms.

**Package:** [`@local-falcon/mcp`](https://www.npmjs.com/package/@local-falcon/mcp) (npm)
**Version:** 1.4.14
**License:** MIT
**Runtime:** Node.js 18+
**Language:** TypeScript (strict mode)

## Architecture

```
index.ts          → Entry point. Transport selection (STDIO, SSE, HTTP), session management, OAuth 2.1
server.ts         → MCP tool registrations. Exports getServer() with deployment-selected tool registration
localfalcon.ts    → API client layer. All fetch functions, rate limiting, retry logic, timeout handling
oauth/            → OAuth 2.1 authorization server (routes, provider, config, state/client stores)
```

### Key Design Patterns

- **`server.ts`** exports a single `getServer(sessionMapping)` function that creates and returns an `McpServer` instance with profile-selected tools registered via `server.tool(name, description, zodSchema, annotations, handler)`. Every tool includes MCP tool annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) that signal to AI clients whether a tool reads data or modifies state.
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
| Attribution | `request_source` stamped on every API call — see below |

### Request Source Attribution

Every outgoing Local Falcon API call carries a `request_source` parameter naming the client
that caused it, so usage can be attributed per integration instead of arriving as one
undifferentiated stream from this server.

**Applied at one choke point.** `applyRequestSource()` runs inside `fetchWithTimeout()`, which
all 43 call sites funnel through, so a new endpoint cannot forget it. The value goes on the
query string for every call and additionally into the body of the form-posting v2/`gbp`
endpoints, so it is readable from either. `set()` rather than `append()` keeps it idempotent —
`withRetry` re-invokes its callback with the same `FormData` instance. Scoped to hostname
`api.localfalcon.com`, so `fetchImageAsBase64` image URLs and the `app.localfalcon.com` OAuth
endpoints are untouched.

**Carried in `AsyncLocalStorage`** (`requestSource.ts`), entered by one middleware in
`createBaseApp`. The alternative was threading a parameter through ~100 client functions and
all 60 tool handlers, each of which would additionally need the tool `extra`/`ctx` plumbed in.
The context survives `await`, the rate limiter's queueing and the retry backoff timers.

**Resolution is tiered, best signal wins.** Recognised clients collapse to a canonical label
whichever signal reveals them; unrecognised callers report their literal Origin/Referer host
(port dropped). Values are charset-restricted and length-capped — headers are attacker input.

| Tier | Signal | Example value |
|---|---|---|
| 4 platform | Known host, `clientInfo.name` or User-Agent token | `chatgpt`, `claude` |
| 3 domain | Origin, else Referer hostname | `app.partner.example` |
| 2 clientName | MCP `clientInfo.name` from the initialize body | `some-agent` |
| 1 userAgent | User-Agent product token | `curl` |
| 0 fallback | `LOCAL_FALCON_REQUEST_SOURCE`, or `stdio` in STDIO mode | `stdio` |

**Why tiers, and why ChatGPT needs them.** ChatGPT reaches this server two ways with different
signals: the connector calls server-side with **no Origin header at all**, identifying itself
only by `User-Agent: openai-mcp/1.0.0`, while the MCP App widget calls from an unpredictable
`*.web-sandbox.oaiusercontent.com` sandbox — which, being a sandboxed iframe, may send the
literal `Origin: null`. A host-only implementation would therefore miss ChatGPT's plugin on the
path that matters and spread its widget traffic across a subdomain per session. Both paths
resolve to `chatgpt`.

Tiers also matter because the best signal rarely arrives on the request that opens a session:
the connector's `initialize` carries `clientInfo` but no Origin, and the `GET /sse` that creates
an SSE session precedes the `initialize` naming the client. `SessionData.requestSource` therefore
remembers the best tier seen and is upgraded, never downgraded, so later calls with no
identifying headers still report the right client. The resolved value is logged on session
creation.

### Transport Modes

Started via CLI argument to `index.ts`:

| Mode | Command | Description |
|---|---|---|
| `stdio` (default) | `npm run start` or `npm run start:stdio` | Standard I/O for local MCP clients |
| `sse` | `npm run start:sse` | Server-Sent Events, OAuth 2.1 protected |
| `http` | `npm run start:http` | Streamable HTTP, OAuth 2.1 protected |
| `HTTPAndSSE` | `npm run start:HTTPAndSSE` | Both HTTP and SSE on same server |

Remote modes (SSE, HTTP) use OAuth 2.1 with PKCE for authentication. The server implements RFC 8414 (Authorization Server Metadata), RFC 9728 (Protected Resource Metadata), and RFC 7591 (Dynamic Client Registration).

### OAuth Client Model

**One static `client_id` by design.** Every integration receives the same
`client_id` (`OAUTH_CONFIG.clientId`). Users must hold a Local Falcon account and log in
regardless, so per-client registration would add nothing. Clients are OAuth 2.1 *public*
clients authenticating with PKCE only — no `client_secret` is ever issued, and `client_id`
confidentiality is not a security boundary.

**Registration grants no trust.** `POST /register` (RFC 7591) is unauthenticated open
registration. It mints no per-client identity and stores nothing. The authoritative control is
the redirect URI policy in `oauth/clientStore.ts` (`checkRedirectUri`), which is stateless —
loopback per RFC 8252, or an https URI on an allowlisted MCP client platform host.

Operators extend it two ways, both server-side only and never reachable over HTTP:

| Env var | Matching | When to use |
|---|---|---|
| `ADDITIONAL_TRUSTED_REDIRECT_URIS` | **Exact URI.** Host/scheme case-fold, default port implied; path and query significant. | Preferred — grants one endpoint, not sibling paths or subdomains. Reason: `operator-allowlisted-uri`. |
| `ADDITIONAL_TRUSTED_REDIRECT_DOMAINS` | Bare domain **plus every subdomain**. | Only when the exact callback is unknown ahead of time. Reason: `trusted-domain`. |

Neither can widen the structural rules: scheme, fragment and userinfo are checked *before* any
allowlist, so a `javascript:` or fragment-bearing entry can never take effect. Malformed entries
are dropped with a startup warning.

It is enforced at three points, all of which must stay in agreement:

| Point | Behaviour |
|---|---|
| `POST /register` | `400 invalid_redirect_uri` if a URI is structurally impossible, or if **none** of the supplied URIs is usable. A mix containing a usable URI is accepted and reflected unchanged. |
| `GET /oauth/authorize` | `redirect_uri` is required; a disallowed one is `400`. |
| `GET /oauth/callback` | Re-validated before the authorization code is delivered, so a poisoned or stale state entry cannot exfiltrate. |

**Why `/register` rejects rather than filtering.** The MCP SDK's client metadata schema requires
`redirect_uris` (`shared/auth.js` — `z.array(SafeUrlSchema)`, not optional), so the response
cannot omit an offending entry, and silently dropping one could desync a client. Reflecting a URI
that `/oauth/authorize` would later refuse is what made this endpoint look exploitable in an
external security report, hence reject-or-reflect.

**Why "none usable" rather than per-URI.** A client supplying a mix keeps working. The TS SDK
authorizes with the same single `provider.redirectUrl` it registers and never compares the
reflected list, but other clients are not the TS SDK, so this avoids breaking a
register-one/authorize-with-another client.

**Accepted limitation.** Because the upstream consent screen is rendered by
`app.localfalcon.com` against our single fixed `client_id`, it always reads "LocalFalcon MCP"
regardless of which client initiated the flow — a user cannot visually distinguish a legitimate
integration from an attacker's. That is precisely why the redirect allowlist is the hard control
and must be enforced identically at all three points above. Note also that each bare vendor
domain in the allowlist delegates trust to its whole subdomain tree, so an open redirect or
subdomain takeover there would be a code-exfil path.

**Not applicable to STDIO.** `/register` and the `/oauth/*` routes live in `createBaseApp`,
reached only for `sse`/`http`/`HTTPAndSSE`. The `stdio` path builds only a
`StdioServerTransport`, so local npm/MCPB installs never execute any of this.

## Tool Inventory

### Account Retrieval and Business Lookup

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
| `listLocalFalconLocationGroups` | List saved account location groups |
| `getLocalFalconGoogleBusinessLocations` | Normal profile only: public business search with separate metered billing |
| `listLocalFalconAutoScans` | List individually scheduled auto-scans. Filter by placeId, keyword, gridSize, frequency, status, platform |
| `viewLocalFalconAccountInformation` | Get account info (user, credits, subscription). Optional returnField filter |

### Actions and Utilities

| Tool | Description |
|---|---|
| `runLocalFalconScan` | Run a new geo-grid scan (costs credits) |
| `createLocalFalconCampaign` | Create a scheduled campaign |
| `updateLocalFalconCampaign` | Edit a campaign — settings, locations, or keywords (action-driven) |
| `runLocalFalconCampaign` | Manually trigger a campaign run (costs credits) |
| `pauseLocalFalconCampaign` | Pause a campaign schedule |
| `resumeLocalFalconCampaign` | Resume a paused/deactivated campaign |
| `reactivateLocalFalconCampaign` | Reactivate a campaign deactivated for insufficient credits |
| `addLocationsToFalconGuard` | Add location(s) to Falcon Guard monitoring |
| `pauseFalconGuardProtection` | Pause Guard monitoring for location(s) |
| `resumeFalconGuardProtection` | Resume Guard monitoring for location(s) |
| `removeFalconGuardProtection` | Remove location(s) from Guard entirely |
| `searchForLocalFalconBusinessLocation` | Search Google or Apple Maps; costs 2 existing credits per successful search |
| `saveLocalFalconBusinessLocationToAccount` | Save a business to the Local Falcon account |
| `getLocalFalconGrid` | Generate grid coordinates for manual single-point checks |
| `getLocalFalconRankingAtCoordinate` | Normal profile only: single-coordinate ranking with separate metered billing |
| `getLocalFalconKeywordAtCoordinate` | Normal profile only: single-coordinate search with separate metered billing |
| `searchLocalFalconKnowledgeBase` | Search the help/docs knowledge base |
| `getLocalFalconKnowledgeBaseArticle` | Get full content of a knowledge base article |

### Manage Google Business Profile (21 tools, no fieldmask)

Act on the **live** Google profile behind a connected location, not on Local Falcon
report data. All are keyed on `place_id` and require the location to be linked to a
Google account (`POST /v1/locations/` with `gbp_linked`). Endpoints live under
`API_BASE_V2/gbp/*`.

Reads (15) — `{ readOnlyHint: true }`:

| Tool | Endpoint |
|---|---|
| `getLocalFalconGbpProfile` | `gbp/location` |
| `getLocalFalconGbpGoogleUpdates` | `gbp/google-updated` |
| `getLocalFalconGbpVerificationStatus` | `gbp/verification` |
| `getLocalFalconGbpAttributes` | `gbp/attributes` |
| `listLocalFalconGbpServices` | `gbp/services` |
| `getLocalFalconGbpPerformanceMetrics` | `gbp/metrics` |
| `listLocalFalconGbpPosts` | `gbp/posts` |
| `listLocalFalconGbpMedia` | `gbp/media` |
| `listLocalFalconGbpCustomerMedia` | `gbp/customer-media` |
| `listLocalFalconGbpReviews` | `gbp/reviews` |
| `listLocalFalconGbpActionLinks` | `gbp/links` |
| `searchLocalFalconGbpCategories` | `gbp/categories` |
| `searchLocalFalconGbpChains` | `gbp/chains` |
| `getLocalFalconGbpAvailableAttributes` | `gbp/attribute-metadata` |
| `getLocalFalconGbpAvailableActionTypes` | `gbp/action-types` |

Writes (6) — action-driven, all `{ destructiveHint: true }` because each group can delete:

| Tool | `action` values | Endpoints |
|---|---|---|
| `manageLocalFalconGbpPosts` | create, update, delete | `gbp/create-post`, `gbp/update-post`, `gbp/delete-post` |
| `manageLocalFalconGbpMedia` | create, update, delete | `gbp/create-media`, `gbp/update-media`, `gbp/delete-media` |
| `manageLocalFalconGbpReviewReplies` | reply, delete | `gbp/reply-review`, `gbp/delete-review-reply` |
| `manageLocalFalconGbpActionLinks` | create, update, delete | `gbp/create-link`, `gbp/update-link`, `gbp/delete-link` |
| `manageLocalFalconGbpServices` | add, remove, replace | `gbp/add-services`, `gbp/remove-services`, `gbp/replace-services` |
| `updateLocalFalconGbpProfile` | details, hours, status, attributes | `gbp/update-location`, `gbp/update-hours`, `gbp/update-status`, `gbp/update-attributes` |

**Wire format.** These endpoints take nested values as PHP bracket fields
(`attributes[0][name]`, `call_to_action[action_type]`, `names[0]`). `appendFormValue()`
in `localfalcon.ts` flattens objects and arrays into that shape, so tool schemas accept
ordinary objects/arrays and callers never build bracket keys by hand.

**Confirmation tokens.** The API requires literal tokens on destructive calls
(`DELETE_POST`, `DELETE_MEDIA`, `DELETE_LINK`, `DELETE_REPLY`, `REPLACE_SERVICES`,
`SET_ATTRIBUTES`, and `CLOSED_PERMANENTLY` for status). The client layer supplies these,
so a destructive call cannot be half-specified by the model.

**camelCase exception.** `getLocalFalconGbpProfile` and `getLocalFalconGbpGoogleUpdates`
return Google's own resource unchanged, so their response fields are camelCase. Every
other GBP endpoint returns snake_case.

## Tool Annotations

Every registered tool declares readOnlyHint, openWorldHint, and destructiveHint explicitly. Annotations describe behavior; they do not enforce authorization or replace user confirmation.

- Bounded Local Falcon account retrieval and connected GBP reads are read-only, closed-world, and non-destructive. Historical Google/public data provenance does not make a retrieval open-world.
- Arbitrary public business, category, and chain searches are open-world. Credit-consuming searches and separately metered lookups are also non-read-only and destructive.
- New scans and active campaign scheduling are non-read-only, open-world, and destructive because they cause public searches and existing-credit expenditure.
- Updates/removals of existing state are destructive even if reversible. In particular, campaign editing and pausing are not additive-only operations.
- Public GBP writes are non-read-only, open-world, and destructive. Bounded connected GBP reads do not inherit the write tools' open-world status.
- The seven previously flagged retrieval tools (scan report list/get, saved locations, campaign report list, account information, KB search, KB article get) use true/false/false in read-only/open-world/destructive order.

## Trusted ChatGPT Profile

See README.md deployment profiles for the canonical profile counts and deployment checklist. LOCAL_FALCON_MCP_PROFILE=chatgpt selects the dedicated ChatGPT tool set at the server deployment boundary; normal is the default. Never derive this setting from a request, client name, User-Agent, or model argument.

Only the three separately Stripe-metered On-Demand tools are excluded. Grid generation and the 2-existing-credit business search remain. ChatGPT KB search and direct retrieval share the hardcoded denylist 15, 16, 23, 37, 57, 81; articles 28, 50, and 58 remain accessible. Normal KB access is unchanged. ChatGPT failures are normalized, including HTTP-200 success:false responses, and account output cannot fall back to the whole raw account response.

Existing-credit use and neutral entitlement information are allowed; purchase, checkout, Auto Recharge, upgrade promotion, and separate monetary charges are not. A neutral informational link to https://www.localfalcon.com/pricing is permitted. Do not add quote infrastructure, KB hashes/allowlists/CMS schema, billing changes, or unrelated refactors.

**Release dependency:** Pia owns backend Auto Recharge isolation, including immediate and scheduled execution paths. This MCP profile and its sanitized responses do not prove that isolation. Release remains gated on that work. LF.app's neutral OAuth entitlement messages require separate review/deployment by Shaun/Pia. No production deployment is authorized by this implementation task.

## Valid Enum Values

All enum values are validated via Zod schemas in `server.ts`.

### Platform

**`runLocalFalconScan`:**
`google`, `apple`, `gaio`, `chatgpt`, `gemini`, `grok`, `aimode`

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
- **v2** (`https://api.localfalcon.com/v2`): Run scan, locations search/add, guard add/pause/resume/delete, campaigns create/update/run/pause/resume/reactivate, account, knowledge base

Public API documentation: [docs.localfalcon.com](https://docs.localfalcon.com)

## Memory Budget

The server OOM-cycled on Render roughly every 50 hours. Two causes, both measured:

**1. V8's heap ceiling, not the container's.** With no `--max-old-space-size`, V8 defaults to
~2 GB *regardless of container size* — so a 16 GB instance still died at ~2 GB with ~14 GB
unused. The `Dockerfile` now sets `NODE_OPTIONS=--max-old-space-size=12288`. Lower it for a
smaller instance, keeping it under the container limit so V8 GCs rather than the kernel
OOM-killing.

**2. Unbounded session count × ~1.3 MB per session.** `getServer()` builds a fresh `McpServer`
with the normal profile's tool registrations per session, historically measured at ~1.28 MB retained. This cannot be shared:
`Protocol.connect()` throws *"Already connected to a transport… use a separate Protocol instance
per connection."* Session creation had no cap — a re-initializing client abandons its previous
session, and auto-recovery mints another up to 5×/min/key — while retention was 8 h.

| Control | Default | Env var |
|---|---|---|
| Hard session cap; at the cap the least-recently-active session is evicted and its transport closed | 2000 | `MAX_SESSIONS` |
| Idle time before a session is swept | 1 h | `SESSION_INACTIVITY_TIMEOUT_MS` |
| Sweep frequency (must be well under the timeout) | 5 min | `INACTIVITY_CHECK_INTERVAL_MS` |
| Full request/response body logging | off | `DEBUG_PAYLOAD_LOGGING` |

Verified by A/B under a 128 MB heap: with the cap disabled the server died of a heap OOM after
~81 initializes; with `MAX_SESSIONS=25` it survived 240, plateauing at 25 sessions and 33% heap.

**`SessionManager.remove()` now closes the transport.** It previously only deleted map entries,
leaving the SDK's per-stream keep-alive timer, stream controller and Express response reachable.
Only the inactivity checker closed explicitly; every other path leaked. Two orphan paths were
also closed: the SSE handler registers the session before `server.connect()` and did not clean up
if connect threw, and the DELETE handler relied on the SDK's `finally`, which is skipped when its
own validation rejects the request.

**`BoundedEventStore` (`eventStore.ts`)** replaces the SDK's example `InMemoryEventStore`, which
has no cap, TTL or eviction — its own header says "not for production use" — and whose
`replayEventsAfter` copies and sorts *every* stored event on each reconnect. The replacement keeps
events per stream in ring buffers (256/stream, 1024/store, oldest-first eviction) so replay cost
is bounded by the cap rather than by history. Its fill path is currently gated off by
`enableJsonResponse: true`, so this is closing a latent cliff rather than an active leak.

**`/healthz` reports memory** — `rss`, `heapUsed`, `heapTotal`, `heapLimitMb`,
`heapUsedPctOfLimit`, `transports`, `maxSessions` and buffered-event totals — and a warning is
logged above 80% of the heap limit. Previously it reported only uptime and a session count, which
was not enough to tell a leak from a high baseline.

**Known gap:** auto-recovery (`attemptSessionRecovery`) currently returns 404 — the private-field
poke at `_webStandardTransport` no longer suffices under SDK 1.30. Recovery runs and registers the
session, but the SDK's `handleRequest` rejects it. Clients recover by re-initializing, so the
effect is one wasted round-trip rather than a hard failure, but the shorter idle timeout leans on
this path more than the old 8 h one did. Worth fixing via the SDK's public API.

## Release & Deployment

| Component | Details |
|---|---|
| npm auto-publish | GitHub Action (`.github/workflows/npm-publish.yml`) triggers on GitHub release creation |
| MCPB packaging | `manifest.json` (v0.3 spec) + `.mcpbignore` + `mcpb pack . local-falcon-mcp.mcpb` |
| OAuth 2.1 | Working end-to-end for remote transports (SSE, HTTP). RFC 8414 / RFC 9728 / RFC 7591 |
| SKILL.md | AI client integration skill definition in `skills/` with 3 reference files |

### MCPB Build
```bash
npm run build                          # Compile TypeScript to dist/
mcpb validate manifest.json            # Validate manifest
mcpb pack . local-falcon-mcp.mcpb      # Create .mcpb bundle
```

## Development

### Prerequisites
- Node.js 18+
- TypeScript 5.8+

### Setup
```bash
npm install
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
| `server.ts` | MCP server factory — `getServer()` with deployment-selected tool registrations |
| `localfalcon.ts` | API client — fetch functions, rate limiter, retry logic, types |
| `eventStore.ts` | Bounded resumability buffer — replaces the SDK's unbounded example store |
| `requestSource.ts` | Resolves which client is calling; carries it in AsyncLocalStorage for `request_source` |
| `oauth/` | OAuth 2.1 implementation (authorization, tokens, PKCE, client registration) |
| `package.json` | Package config, scripts, dependencies |
| `manifest.json` | MCPB Desktop Extension manifest (v0.3 spec) — tools, icons, user_config |
| `.mcpbignore` | Exclusion patterns for MCPB bundle creation |
| `tsconfig.json` | TypeScript compiler configuration |
| `.env.example` | Environment variable template |
| `Dockerfile` | Container build configuration |
| `skills/` | AI skills — MCP tool usage skill and local visibility strategy skill |
| `.claude-plugin/` | Claude Code plugin manifest (`plugin.json`) |
| `.mcp.json` | Remote MCP server configuration for Claude Code plugin |
| `.github/workflows/` | npm auto-publish on GitHub release |
| `vite.ui.config.ts` | Vite build config for MCP App UI entries |
| `ui/geogrid-heatmap/` | Geo-grid heatmap MCP App — interactive Google Maps widget |
| `_spec/` | Internal development specs (gitignored, not published) |

## MCP Apps

The server includes MCP App support via `@modelcontextprotocol/ext-apps`. Apps are interactive HTML widgets embedded in AI clients.

### Geo-Grid Heatmap

An interactive Google Maps widget that visualizes geo-grid scan data with colored rank pins, metrics bar, and clickable detail panels.

| Component | Details |
|---|---|
| Source | `ui/geogrid-heatmap/` (index.html, main.ts, styles.css) |
| Build | `npm run build:ui` → `dist/ui/geogrid-heatmap/index.html` (~230 KB single-file) |
| Google Maps API Key | Set `GOOGLE_MAPS_API_KEY` env var at build time (GCP project `lf-mcp-apps`) |
| Resource URI | `ui://reports/geogrid-heatmap` |
| Linked Tool | `getLocalFalconReport` (via `registerAppTool` with `_meta.ui.resourceUri`) |
| Data Resource | `localfalcon://reports/{report_key}/data_points` (fetches full grid data for the widget) |

### Build

```bash
GOOGLE_MAPS_API_KEY=your-key npm run build:ui
```

The `build` script runs both TypeScript compilation and UI builds.

## ChatGPT MCP Connector Compatibility

### OAuth 2.1 Requirements (ChatGPT-specific)

ChatGPT MCP connector compatibility requires the following OAuth settings:

| Requirement | Detail | File |
|---|---|---|
| **Scopes aligned** | Both `.well-known/oauth-authorization-server` and `.well-known/oauth-protected-resource` must advertise `["api", "offline_access"]` | `index.ts` |
| **Token response scope** | Token endpoint must return `scope: "api offline_access"` matching the requested scope — mismatches cause re-auth loops | `oauth/routes.ts` |
| **`refresh_token` grant** | `grant_types_supported` must include `"refresh_token"` | `index.ts` |
| **Widget domain** | `_meta.ui.domain` required on MCP App resources — without it, ChatGPT loops OAuth on tool calls. Format: `{url-derived}.oaiusercontent.com` | `server.ts` |

### MCP Apps Bridge Differences (ChatGPT vs Claude)

ChatGPT's MCP Apps bridge delivers tool results differently from Claude's:

**Claude:** `ontoolresult` receives `{content: [{type: "text", text: "single-encoded JSON"}]}`

**ChatGPT:** `ontoolresult` receives `params` from `ui/notifications/tool-result` with TWO paths:
- `content[0].text` — **double-encoded**: JSON string wrapping a `{text: "json"}` envelope
- `structuredContent.text` — **single-encoded**: clean JSON string (preferred)

**Parsing strategy in `main.ts` (priority order):**
1. **Tier 0:** `result.structuredContent.text` → `JSON.parse()` (ChatGPT clean path)
2. **Tier 1:** `result.content[]` array → find `type: "text"` block → `JSON.parse(block.text)` (Claude path)
3. **Tier 2:** `result.text` as string → `JSON.parse(result.text)` (simple text wrapper)
4. **Tier 3:** `result.data` or raw `result` (generic fallback)
5. **Double-encoding unwrapper:** If result has no `report_key` but has `text` string → `JSON.parse(reportData.text)`

### `_meta: null` Workaround (Critical for ChatGPT)

The MCP SDK's `server.resource()` serializes `_meta` as `null` in JSON-RPC responses. ChatGPT's bridge Zod schema requires `_meta` to be an object — `null` fails validation, causing `readServerResource` to time out.

**Fix:** `patchNullMeta()` in `main.ts` — a recursive function that replaces `_meta: null` with `_meta: {}` at any depth. Installed as a monkey-patch on `window.addEventListener` before `new App()`. Safe for Claude — Claude's responses have `_meta` as an object or absent, never `null`.

### Google Maps API Key — ChatGPT Referrer

The Maps JavaScript API key (GCP project `lf-mcp-apps`) must allow ChatGPT's widget sandbox as an HTTP referrer:

| Referrer | Purpose |
|---|---|
| `*.oaiusercontent.com/*` | ChatGPT widget sandbox |
| `*.web-sandbox.oaiusercontent.com/*` | ChatGPT specific sandbox subdomain |
| `*.claudemcpcontent.com/*` | Claude widget sandbox |
| `*.localfalcon.com/*` | Production + dev |

### OAuth Browser State Issue

ChatGPT's OAuth dialog enters an infinite React render loop in normal Chrome sessions due to stale React Router state. **Incognito mode works reliably.** This is a ChatGPT frontend bug.

### Error Handling in Tool Responses

ChatGPT-facing Local Falcon failures are normalized for both non-2xx responses and HTTP-200 payloads with `success:false`. Do not return raw upstream commerce HTML, purchase/checkout links, or upgrade prompts. Use authoritative credit requirements/balances only when present; otherwise use the neutral insufficient-credit fallback. Normal-profile behavior is preserved.
