import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchAllLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports, fetchLocalFalconCompetitorReports, fetchLocalFalconCompetitorReport, fetchLocalFalconCampaignReports, fetchLocalFalconCampaignReport, fetchLocalFalconGuardReports, fetchLocalFalconGuardReport, runLocalFalconScan, searchForLocalFalconBusinessLocation, fetchLocalFalconAccountInfo, saveLocalFalconBusinessLocationToAccount, addLocationsToFalconGuard, pauseFalconGuardProtection, resumeFalconGuardProtection, removeFalconGuardProtection, createLocalFalconCampaign, runLocalFalconCampaign, pauseLocalFalconCampaign, resumeLocalFalconCampaign, reactivateLocalFalconCampaign, fetchLocalFalconReviewsAnalysisReports, fetchLocalFalconReviewsAnalysisReport, searchLocalFalconKnowledgeBase, getLocalFalconKnowledgeBaseArticle } from "./localfalcon.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

dotenv.config({ path: ".env.local" });


const DEFAULT_LIMIT = "10"

function handleNullOrUndefined(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}


export const getServer = (sessionMapping: Map<string, { apiKey: string }>) => {
  const getApiKey = (ctx: any) => {
    const sessionId = ctx?.sessionId;
    const sessionHeaders = sessionMapping.get(sessionId)
    if (!sessionHeaders) {
      return process.env.LOCAL_FALCON_API_KEY;
    }
    return sessionHeaders.apiKey;
  };

  const server = new McpServer({
    name: "Local Falcon MCP Server",
    version: "1.0.0",
    icons: [
      {
        src: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCA3MTQuNzIgMTAwMCI+CiAgPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDIuMS4wIEJ1aWxkIDE4NikgIC0tPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuc3QwIHsKICAgICAgICBmaWxsOiAjMjg0MDYwOwogICAgICB9CgogICAgICAuc3QwLCAuc3QxIHsKICAgICAgICBmaWxsLXJ1bGU6IGV2ZW5vZGQ7CiAgICAgIH0KCiAgICAgIC5zdDEgewogICAgICAgIGZpbGw6ICNlNjJhMmQ7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xMjguNTIsMjM2Ljc3YzAsNjUuMzgsMjUuODksMTI0LjU4LDY3LjcyLDE2Ny40M2wxNjEuMDksMTY0Ljk3LDE2MS4wOC0xNjQuOTdjNDEuODMtNDIuODUsNjcuNzItMTAyLjA1LDY3LjcyLTE2Ny40M0M1ODYuMTMsMTA2LjgyLDQ4My45MSwxLjMyLDM1Ny4zMywwYy0xMjYuNTksMS4zMi0yMjguODEsMTA2LjgyLTIyOC44MSwyMzYuNzdaTTI1NC43NiwyMzcuMTVjMC01Ni43NSw0NS45Mi0xMDIuNzYsMTAyLjU3LTEwMi43NnMxMDIuNTYsNDYuMDEsMTAyLjU2LDEwMi43Ni00NS45MiwxMDIuNzctMTAyLjU2LDEwMi43Ny0xMDIuNTctNDYuMDEtMTAyLjU3LTEwMi43N1oiLz4KICA8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMjA0Ljg3LDY3OC45OWwtMjguNDQsNDguODJzLTYuOTQsOS43OS04LjgzLDI4LjQxYy0xLjg5LDE4LjYzLDEwLjc1LDMwLjcyLDEwLjc1LDMwLjcyLDAsMC0yLjk2LDE3LjgyLS42NSwzMC44Niw1LjUxLDMxLjAxLDM5LjEyLDI0LjY2LDM5LjEyLDI0LjY2LDAsMC05LjE4LTcuOC0xMC43Ni0xNS42OS0xLjU5LTcuODksOS44MS0yMS4zOSw5LjgxLTIxLjM5bDQ5LjI1LTY1LjQ5YzEuMTksMS41MSwyLjM2LDMuMDQsMy41Myw0LjU4di4wMmMzLjE0LDQuMTUsNi4xNyw4LjQsOS4wOSwxMi43NCw1LjQzLDguMDgsMTAuNSwxNi40NywxNS4yNCwyNS4wNiwxNi4wNy01MS43NSw0MS4yMi0xMDguOTIsNzkuOTgtMTQ5Ljg4LDU1LjgyLTU5LjAxLDE0My43LTEyMi4yMiwyMDAuNzMtMTk4LjkxaC4yMWMzNC42NS00Ni42LDU3LjkyLTk4LjE4LDU1LjY4LTE1Ni44Mi0uNy0xOC4zNC0zLjc3LTM1LjM5LTguNjQtNTEuMTktMi4zOC01LjU2LTYuMDMtMTMuNjgtOS0xOC40OS0zLjQ1LTUuNjEtNy4xOC0xMC4zOC0xMC4zMS0xMy45OSwyLjgxLDE0LjE4LDQuMjgsMjguODEsNC4yOCw0My43NiwwLDE5LjA3LTIuMzgsMzcuNjItNi45LDU1LjM4LTkuMjYsNTIuNDItMzguMjksOTguOTQtNzUuMDIsMTQxLjM1aC0uMmMtNDcuNzEsNTUuMDktMTA4LjQsMTAzLjI2LTE1NS42MSwxNDguNGwtMTEsMTAuOTl2LS4yNmMtNC4wOCw0LjA2LTguMDMsOC4wOS0xMS44NCwxMi4xMS0yMS44NSwyMy4xLTM5LjM3LDUxLjM1LTUzLjM3LDgwLjg3bC0xLjcxLTEuODJDMjAyLjE3LDU5MC42OCwzNC4yNSw0ODcuMDksMzMuNywzMzYuNTdjLTYuNDQsNC44OS0xNi41NSwxNC45MS0yNS40MywzMy45My0xMC44MSwyMy4xNy04LjUsNDguMTMtNi44OSw1OC4yOSwyNy4xLDEwMS4wNCwxMjYuMTIsMTc5Ljg1LDIwMy40OSwyNTAuMlpNMTkwLjczLDc3NC41N2MtLjk4LS4xNS0xLjg3LS41Ni0yLjYzLTEuMiwzLjAxLTEuMjUsNS42NS00LjkzLDYuNDktOS41NS44NS00LjYyLS4zNC04Ljg1LTIuNzYtMTAuODcuOTUtLjQsMS45NC0uNTUsMi45Mi0uNDEsNC4xLjU5LDYuNTEsNS45OSw1LjQsMTIuMDgtMS4xMSw2LjA4LTUuMzMsMTAuNTMtOS40Miw5Ljk1Wk0xMTguMjcsOTIyLjU1czU3LjI2LDE0LDE0Ny43LTE5LjAxYzE3LjUtNi4zOCwzMi45Mi0xMy40NSw0Ni40LTIwLjY4LTMuODEtMTEuMTYtOC4wNi0yMi40Ni0xMi43OC0zMy42OS0xNy43OCwxNC41My0zNy43NCwyOC4xMy01OC41MSwzNy4zNy02OS43LDMxLjAxLTEyMi44MSwzNi4wMS0xMjIuODEsMzYuMDFaTTY5Ni4yNyw4MjMuNTVzLTUzLjExLTUtMTIyLjgxLTM2LjAxYy0zMS40OS0xNC4wMS02MS4xMi0zOC4wMy04NC4xNC02MC4xNS00LjAxLDQtNy44OSw3Ljk3LTExLjYzLDExLjkzLTUuNTksNS45MS0xMC44OSwxMi4xNS0xNS45MywxOC42NiwxOS45NSwxNS4yNCw0OC4zNiwzMi41Myw4Ni44MSw0Ni41Niw5MC40NCwzMy4wMSwxNDcuNywxOS4wMSwxNDcuNywxOS4wMVpNNzA2LjI3LDg4Ni41cy02NC01LTE0OC0zNmMtNDMuMzEtMTUuOTgtODMuNjktNDQuOTktMTEyLjY1LTY5LjM1LTguMDYsMTIuNzktMTUuMjcsMjYuMjQtMjEuNzQsMzkuOTQsMjQuMDMsMTUuMiw1OC4xOSwzMi40MiwxMDQuMzksNDYuNDEsMTA5LDMzLDE3OCwxOSwxNzgsMTlaTTMwNC4yMSw2MTguODljLTkzLjMtODguNTEtMjM2LjMxLTE4OC45LTIzMC45MS0zMzAuMzUuNTgtMTUuMjUsMi40OC0yOC45NSw1LjU1LTQxLjUyLTUuNTQsNS4yMi0xNC40NSwxNS4yMi0yMi41OCwzMS40OC01Ljc2LDExLjUzLTEwLDIwLTEwLjU5LDM3LjcxLTQuOCwxNDQuNzUsMTQ0LjMxLDI0Ni40NiwyMzcuMywzMzYuNDgsNi40NC0xMS43MiwxMy41LTIzLjA4LDIxLjIzLTMzLjhaTTM0MS4zMyw1NzcuMTVjLTgzLjQ3LTc4LjY4LTIwNC43Ni0xNjYuODgtMjI1LjYzLTI4NS00LjUxLTE3Ljc2LTYuOS0zNi4zMS02LjktNTUuMzgsMC0xNC45NSwxLjQ3LTI5LjU4LDQuMjgtNDMuNzYtMy4xMywzLjYxLTYuODYsOC4zOC0xMC4zMSwxMy45OS0yLjk2LDQuODEtNi42MSwxMi45My04Ljk5LDE4LjQ5LTQuODgsMTUuOC03Ljk1LDMyLjg1LTguNjUsNTEuMTktNS4zNiwxNDAuNjYsMTM2LjAzLDI0MC43MiwyMjkuMzUsMzI4Ljg3LDMuNTktNC4zNiw3LjI5LTguNiwxMS4xNC0xMi42NiwzLjgtNC4wMiw3Ljc1LTguMDYsMTEuODMtMTIuMTJ2LjI2bDMuODgtMy44OFpNMzMzLjY2LDgxNy45NmMzLjIzLTEwLjE5LDYuODItMjAuNTksMTAuODEtMzFsLjUzLTEuMzcuMjktLjc1LjU4LTEuNDYuOTItMi4zNSwyLjAzLTUuMDZjMTUuNDItMzcuNjksMzYuMDctNzQuOTUsNjMuNTgtMTA0LjAzLDY1LjE0LTY4Ljg1LDE3My45LTE0My40MiwyMjYuMzktMjM4LjQ0aC0uMDljMTkuODYtMzUuOTEsMzEuNzQtNzQuNzQsMzAuMzMtMTE3LjI5LS41OS0xNy43MS00LjgyLTI2LjE4LTEwLjU5LTM3LjcxLTguMTMtMTYuMjYtMTcuMDQtMjYuMjYtMjIuNTgtMzEuNDgsMy4wOCwxMi41Nyw0Ljk4LDI2LjI3LDUuNTYsNDEuNTIsMi4wNSw1My43MS0xNy4zLDEwMS40OS00Ny4yLDE0NC45NmgtLjIxYy01Ni40Niw4Mi4wOC0xNTAuNTQsMTQ4Ljc1LTIwOS4yMiwyMTAuNzctMjQsMjUuMzYtNDIuNzcsNTYuOTYtNTcuNDEsODkuNjItOC40OCwxOC45NC0xNS41OCwzOC4yMi0yMS40OSw1Ni44OGwtMi4wMSw5LjcsMiw3LjM2YzQuMzQsOS4zNSw4LjMzLDE4LjgxLDEyLDI4LjI2LDIuMDksNS4zOCw0LjA3LDEwLjc1LDUuOTUsMTYuMSwyLjg1LTEwLjk5LDYuMS0yMi40OCw5LjgzLTM0LjIzWk0zNTcuMzMsMTAwMHYtMS40OHMtLjA4LjcyLS4wOC43MmwuMDguNzZaTTM1Ny4zMiw5OTguNTJjMS44My0xNy40NywyMS4zNi0xODUuMzQsMTA2LjM3LTI3NS4yLDc2LjQzLTgwLjc5LDIxMi45NS0xNjkuNDYsMjQ4LjExLTI4OS44MmguMjFjLjQ2LTEuNTYuOS0zLjEzLDEuMzItNC43MSwxLjYyLTEwLjE2LDMuOTMtMzUuMTItNi44OS01OC4yOS04Ljg3LTE5LjAyLTE4Ljk5LTI5LjA0LTI1LjQzLTMzLjkzLS4xMiwzNC42NS05LjEyLDY2LjgxLTIzLjk3LDk2LjkzaC0uMjFjLTQ5LjY2LDEwMC43Mi0xNjQuNzcsMTc4LjYxLTIzMi41OSwyNTAuMjktMjkuNTksMzEuMjgtNTEuMjYsNzIuMDItNjYuOTksMTEyLjU3bC0uMDQuMDktLjAzLjExYy0xMC45OCwyOC4zMS0xOS4wNyw1Ni41My0yNC45Niw4MS4zNiwxOC4wNSw1OS44MSwyMy45OSwxMTEuMzgsMjQuOTUsMTIwLjYxbC4wOC43MS4wNy0uNzJaTTM1Ny4xNyw5OTguNTN2MS40N3MuMDgtLjc2LjA4LS43NmwtLjA4LS43MVoiLz4KPC9zdmc+",
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
    ],
    description: `Local Falcon is a geo-grid rank tracking and local SEO analytics platform. This MCP server provides tools to run scans, retrieve reports, manage campaigns, monitor Google Business Profiles, and analyze competitive positioning across Google Maps, Apple Maps, and AI search platforms (ChatGPT, Gemini, Grok, Google AI Overviews, AI Mode).

## CORE CONCEPTS

**Scan:** A grid-based ranking analysis for one business + one keyword + one platform from a set of geographic coordinates. Each grid point checks who ranks at that location. Scans cost credits.

**Google Business Profile (GBP):** Always use this term. Never say "Google My Business" or "GMB" — rebranded in 2021.

**Service Area Business (SAB):** Businesses that serve customers at the customer's location (plumbers, HVAC, etc.). Their ranking patterns differ from storefronts — strong rankings far from the business address with weak rankings nearby is normal and expected for SABs. The center point of a scan should be where their customers are, not where their office is.

**Place ID:** Google's unique identifier for a business location (format: ChIJXXXXXXXXXXXXXXXX). Required for running scans. Find via listAllLocalFalconLocations first, then searchForLocalFalconBusinessLocation or getLocalFalconGoogleBusinessLocations as fallbacks.

## PLATFORMS & METRICS

**Map Platforms (Google Maps, Apple Maps):**
- ARP (Average Rank Position): Average rank only where the business appears. Measures ranking quality when visible.
- ATRP (Average Total Rank Position): Average rank across ALL grid points including where the business doesn't appear (counted as 21). Primary metric for overall visibility.
- SoLV (Share of Local Voice): Percentage of grid points where the business ranks in top 3 (the map pack). This is the most important map-based metric.
- Competition SoLV: Count of unique competitors with any top-3 placements.
- Max SoLV: Highest SoLV achieved by any single business in the scan.
- Opportunity SoLV: Max SoLV minus your SoLV — quantifies realistic growth potential.
- SoLV Distance / Average SoLV Distance: How far from the business location top-3 rankings extend. Measures geographic reach.
- Found In: Number of grid points where the business appears at all.
- Total Competitors: Count of all unique businesses appearing anywhere in results.
- Distance from Center Point / Distance from Data Point: Geographic distance metrics for proximity analysis.

**AI/Generative Platforms (ChatGPT, Gemini, Grok, AI Overviews, AI Mode):**
- SAIV (Share of AI Visibility): Percentage of AI results mentioning the business. AI-only metric.
- ARP/ATRP on AI scans are pseudo-ranks derived from mention order, not map positions.
- NEVER confuse SAIV with SoLV — they measure completely different things on different platforms.

**Review Metrics (from Reviews Analysis Reports):**
- Review Volume Score (RVS): Composite of review velocity + total volume.
- Review Quality Score (RQS): Composite of rating distribution, response engagement, and recency.
- Review Velocity: Average reviews per month over last 90 days.
- Review Freshness: Recency-weighted score of how current the review profile is.

**Critical metric distinction:** SoLV is for maps ONLY. SAIV is for AI platforms ONLY. If a user mentions a SoLV drop and asks about AI visibility, correct the terminology before analyzing.

## REPORT TYPES & RELATIONSHIPS

**Scan Report** — Point-in-time ranking snapshot. User-initiated, costs credits. Foundation for all other report types. Contains full grid point data, aggregate metrics (ARP, ATRP, SoLV), competitor data, and optional AI analysis.

**Trend Report** — Historical ranking changes over time. AUTO-GENERATED when 2+ scans exist with identical settings (same place ID, keyword, coordinates, grid, radius, platform). Shows ARP/ATRP/SoLV movement across scan dates. Cannot be created manually.

**Competitor Report** — Competitive landscape from a scan. AUTO-GENERATED with every scan. Shows top-ranking businesses with their metrics, review counts, ratings, and positioning. Available for all platforms including AI scans.

**Campaign Report** — Aggregated view across multiple locations and/or keywords on a schedule. User-configured. Consolidates all data in one report — scans run from campaigns do NOT generate separate location, keyword, or trend reports.

**Location Report** — Aggregates all scans for a specific business location across keywords. AUTO-GENERATED after 2+ keywords scanned for the same location outside of campaigns.

**Keyword Report** — Aggregates all scans for a specific keyword across locations. AUTO-GENERATED after 2+ locations scanned for the same keyword outside of campaigns.

**Reviews Analysis Report** — AI-powered review analysis covering up to 1M reviews with competitor comparison. Separate from ranking reports. Premium feature ($19/location), does not use scan credits. Includes RVS, RQS, velocity, freshness, sentiment, and topic analysis.

**Falcon Guard Report** — GBP monitoring service. Checks for profile changes twice daily and sends alerts. $1/month for up to 10 locations. OAuth-connected locations get enhanced data: calls, website clicks, directions, impressions (up to 18 months historical). Non-OAuth locations only get change history.

## FIELDMASK USAGE

Most get* and list* tools accept an optional \`fieldmask\` parameter — a comma-separated string of field names to return. **Always use fieldmasks** to request only the fields needed for the current task. This prevents context window overflow and improves performance.

**Recommended fieldmasks by use case:**

Scan report — quick overview:
\`report_key,date,keyword,location.name,location.address,arp,atrp,solv,found_in,grid_size,radius,measurement\`

Scan report — full analysis:
\`report_key,date,place_id,keyword,location,lat,lng,grid_size,radius,measurement,arp,atrp,solv,found_in,total_competitors,competition_solv,max_solv,opportunity_solv,ai_analysis,image,heatmap\`

Scan report list — browsing:
\`report_key,date,keyword,location.name,arp,atrp,solv,grid_size,platform\`

Trend report — performance tracking:
\`report_key,last_date,keyword,location.name,scan_count,scans.*.date,scans.*.arp,scans.*.atrp,scans.*.solv\`

Competitor report — competitive analysis:
\`date,keyword,grid_size,radius,businesses.*.name,businesses.*.place_id,businesses.*.arp,businesses.*.atrp,businesses.*.solv,businesses.*.reviews,businesses.*.rating,businesses.*.lat,businesses.*.lng\`

Campaign report list — overview:
\`report_key,name,status,locations,keywords,frequency,last_run,next_run,arp,atrp,solv,arp_move,atrp_move,solv_move\`

Campaign report — detailed:
\`report_key,name,status,locations,keywords,frequency,last_run,next_run,arp,atrp,solv,arp_move,atrp_move,solv_move,scans,grid_size,radius,measurement\`

Guard report list:
\`report_key,place_id,location.name,location.address,location.rating,location.reviews,status,date_added,date_last\`

Reviews analysis:
\`reviews_key,name,date,locations,frequency,statistics.metrics.primaryBusiness\`

**Fieldmask rules:**
- Use dot notation for nested fields: \`location.name\`, \`statistics.metrics.primaryBusiness\`
- Use wildcards for arrays: \`scans.*.arp\`, \`businesses.*.name\`
- Start with the minimal fieldmask for the task, expand only if more data is needed
- When a user asks a specific question (e.g., "what's my ARP?"), use a narrow fieldmask
- When performing comprehensive analysis, use broader fieldmasks but still exclude raw grid point arrays when aggregate metrics suffice

## TOOL WORKFLOW PATTERNS

**Finding a business:**
1. listAllLocalFalconLocations (check saved locations first)
2. If not found: searchForLocalFalconBusinessLocation (search Google/Apple)
3. Last resort: getLocalFalconGoogleBusinessLocations
4. If needed: saveLocalFalconBusinessLocationToAccount (must be saved before scanning)

**Analyzing current performance:**
1. listLocalFalconScanReports (check for existing data — always do this before running new scans)
2. getLocalFalconReport with appropriate fieldmask (get metrics + grid visualization)
3. getLocalFalconCompetitorReport (see who's outranking the business and where)

**Tracking changes over time:**
1. listLocalFalconTrendReports (find existing trend reports)
2. getLocalFalconTrendReport (view historical ARP/ATRP/SoLV movement)

**Multi-location/keyword analysis:**
1. listLocalFalconCampaignReports (find campaigns)
2. getLocalFalconCampaignReport (get aggregated performance data)

**Running new scans (costs credits — confirm with user):**
1. Verify the location is saved (listAllLocalFalconLocations)
2. Get coordinates (from saved location data or previous scan reports)
3. runLocalFalconScan with appropriate grid size, radius, measurement, platform, keyword

**Comprehensive location assessment:**
For a full performance picture of a single location, gather (only if data exists):
1. Latest scan report (getLocalFalconReport) — current ranking snapshot
2. Competitor report (getLocalFalconCompetitorReport) — competitive landscape
3. Trend report (getLocalFalconTrendReport) — historical trajectory
4. Guard report (getLocalFalconGuardReport) — GBP health + engagement metrics
5. Reviews analysis (getLocalFalconReviewsAnalysisReport) — review profile strength
6. AI platform scan if available — AI visibility baseline
Use fieldmasks on each call to keep context manageable. Not all report types will exist for every location.

## INTERPRETING RESULTS

**Scoring is always contextual.** There are no universal "good" or "bad" thresholds. Interpretation depends on:
- Keyword competitiveness (e.g., "emergency plumber" is far more competitive than "antique clock repair")
- Market density (urban downtown vs. rural area)
- Scan radius (a 1-mile scan in Manhattan vs. a 15-mile scan in rural Texas)
- Business category (restaurants have different competitive dynamics than law firms)
- Business type (storefront vs. SAB)

**Diagnostic patterns:**
- Red/high-rank pins near the business + green/low-rank pins far away = competitor density problem near the business location. Common in urban areas. Consider Google Maps Ads for contested zones and focus organic efforts on opportunity areas.
- Green pins far from business + red nearby (SAB) = normal SAB pattern. Verify center point is set to customer area, not office.
- Good ARP (5-7) but low SoLV (<10%) = consistently ranking just outside the map pack (positions 4-10). On the bubble — small improvements could push into top 3.
- High ARP (15+) = near-invisible. Check GBP verification status, primary category accuracy, and center point placement before optimizing.
- SoLV above 80% with ARP below 3 = dominant position. Expand scan radius to find new markets or shift focus to conversion optimization.
- Declining SoLV in trend reports with stable ARP = competitors improving, not necessarily the business declining. Check competitor report for new entrants.

**Competitive analysis framework:**
- Compare ARP, SoLV, review count, rating, and primary categories between the target business and top competitors.
- High Opportunity SoLV with low Competition SoLV = untapped market potential, quick win zone.
- High Competition SoLV with low Opportunity SoLV = saturated market, consider adjacent keywords or geographic expansion.
- Competitors with significantly more reviews or higher ratings often dominate despite proximity disadvantages.

**AI visibility analysis:**
- Low SAIV = the business isn't being cited by AI platforms. Strategy should focus on becoming a citable source: get mentioned on authoritative sites, build structured data, increase real-world prominence signals.
- AI rankings are emerging and volatile — recommend monitoring via regular scans but keeping primary strategic focus on maps (SoLV) where ranking factors are better understood.

**Review analysis patterns:**
- High RVS + low RQS = getting lots of reviews but not managing them well (low response rate, stale profile).
- Low RVS + high RQS = well-managed but insufficient volume. Focus on review generation campaigns.
- Low review freshness with high total reviews = historical authority but declining engagement signals.
- Compare review velocity against top competitors — matching or exceeding their pace is the target.

## SCAN CONFIGURATION GUIDANCE

**Grid size:** Larger grids (11x11, 13x13, 15x15) provide more granular geographic coverage but cost more credits. Smaller grids (3x3, 5x5) are sufficient for quick checks or dense urban areas.

**Radius:** Should reflect the realistic service area of the business.
- Dense urban storefront: 1-3 miles
- Suburban storefront: 3-5 miles
- Service area business: 5-15+ miles depending on service radius
- Rural business: 10-25+ miles

**Platform selection:**
- google: Standard Google Maps rankings (most common)
- apple: Apple Maps rankings
- gaio: Google AI Overviews
- chatgpt: ChatGPT mentions/recommendations
- gemini: Gemini AI mentions/recommendations
- grok: Grok AI mentions/recommendations

## OPERATIONAL RULES

1. **Always check for existing data before running new scans.** Use listLocalFalconScanReports first. Scans cost credits.
2. **Confirm with the user before running scans or any action that costs credits or money.**
3. **Always use fieldmasks** on get* and list* tools. Start narrow, expand only if needed.
4. **Omit optional parameters entirely** when you don't have a useful value. Do not pass null or empty strings.
5. **Don't chain excessive tool calls.** If a user asks about scan reports, fetch scan reports — don't also fetch campaigns, trends, competitors, guard reports, and reviews unless specifically needed.
6. **Use the Knowledge Base tools** (searchLocalFalconKnowledgeBase, getLocalFalconKnowledgeBaseArticle) for questions about Local Falcon features, settings, and how-to guidance. These return platform documentation, not user-specific data.
7. **Pagination:** Most list tools return limited results per page. Use the nextToken from responses to fetch additional pages when needed.
8. **Credit awareness:** runLocalFalconScan, runLocalFalconCampaign, and createLocalFalconCampaign consume credits. Use viewLocalFalconAccountInformation to check credit balance if relevant.
    `
  });

  // Get list of Scan Reports
  server.tool(
    "listLocalFalconScanReports",
    "Lists existing scan reports. ALWAYS check here before running new scans to avoid duplicates and save credits. Returns report metadata including date, keyword, location, ARP, ATRP, SoLV, grid size, and platform. Use filters to narrow results. If a report has a campaign_key, its data is consolidated in the campaign report — no separate trend/location/keyword reports exist for campaign scans. Use fieldmask to control returned fields. Recommended fieldmask for browsing: \"report_key,date,keyword,location.name,arp,atrp,solv,grid_size,platform\". Returns limited results per page; use nextToken for pagination.",
    { 
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."), 
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '21']).nullish().describe("Filter only for specific grid sizes. Expects 3, 5, 7, 9, 11, 13, 15, 17, 19, or 21."), 
      campaignKey: z.string().nullish().describe("Filter only results for a specific campaign using the campaign_key."), 
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("Filter only results for a specific platform."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ nextToken, startDate, endDate, placeId, keyword, gridSize, campaignKey, platform, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = DEFAULT_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(campaignKey), handleNullOrUndefined(platform), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Scan Report
  server.tool(
    "getLocalFalconReport",
    `Retrieves a specific scan report by report_key. Returns full ranking data including ARP, ATRP, SoLV, grid point data, competitor summary, grid visualization images, and AI analysis text (if enabled). Use fieldmask to control response size — scan reports contain large grid point arrays that can overflow context. Recommended fieldmask for analysis: "report_key,date,place_id,keyword,location,arp,atrp,solv,found_in,total_competitors,competition_solv,max_solv,opportunity_solv,grid_size,radius,measurement,ai_analysis,image,heatmap". Add "places" to the fieldmask only when you need individual grid point data. Requires a report_key from listLocalFalconScanReports. Cannot create new reports — use runLocalFalconScan for that.`,
    {
      reportKey: z.string().describe("The report key of the scan report."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Saved Locations
  server.tool(
    "listAllLocalFalconLocations",
    "Lists all business locations already configured in the Local Falcon account. Check here BEFORE using getLocalFalconGoogleBusinessLocations - if the business is already in the account, you'll get the Place ID instantly without needing to search Google. Saves time and ensures consistency with previous scans.",
    {
      query: z.string().nullish().describe("Search query. Matches against location name, address, Place ID, or store code."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ query, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchAllLocalFalconLocations(apiKey, handleNullOrUndefined(query), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Search Google for Place ID - OnDemand Endpoint
  server.tool(
    "getLocalFalconGoogleBusinessLocations",
    "Searches Google for business listings to find Place IDs needed for runLocalFalconScan. ONLY use this if: 1) Place ID not found in previous scan reports, AND 2) Business not found in listAllLocalFalconLocations. This is the last resort for finding a Place ID. Returns multiple potential matches - verify you have the correct business before scanning.",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      query: z.string().describe("The query to search for."),
      near: z.string().nullish().describe("Narrow results by location. City, state, country, etc."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ nextToken, query, near, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, handleNullOrUndefined(nextToken), query, handleNullOrUndefined(near), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Run a Dashboard Scan v2
  server.tool(
    "runLocalFalconScan",
    "Runs a new ranking scan for a business. COSTS CREDITS — always confirm with the user before running. Requires: Place ID (business must be saved first), keyword, center coordinates (lat/lng), grid size, radius, measurement unit, and platform. Returns ranking data across the grid. Available platforms: google (Maps), apple (Apple Maps), gaio (Google AI Overviews), chatgpt (ChatGPT), gemini (Gemini), grok (Grok), aimode (Google AI Mode), giao (Google Immersive AI Overviews). Enable aiAnalysis for AI-generated insights on the results (Google Maps only). Grid size and radius should match the business type and service area.",
    {
      placeId: z.string().describe("The Google Place ID of the business to match against in results."),
      keyword: z.string().describe("The desired search term or keyword."),
      lat: z.string().describe("The data point latitude value."),
      lng: z.string().describe("The data point longitude value."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).describe("The size of the grid."),
      radius: z.string().describe("The radius of the grid from center point to outer most north/east/south/west point (0.1 to 100)."),
      measurement: z.enum(['mi', 'km']).describe("The measurement unit of the radius (mi for miles, km for kilometers)."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt', 'gemini', 'grok', 'aimode', 'giao']).describe("The platform to run the scan against."),
      aiAnalysis: z.boolean().default(false).describe("Whether AI analysis should be generated for this scan (optional, defaults to false)."),
    },
    async ({ placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await runLocalFalconScan(apiKey, placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Campaign Reports
  server.tool(
    "listLocalFalconCampaignReports",
    `Lists campaign reports in the account. Campaigns are the primary method for scheduled, recurring scans across multiple locations and/or keywords. Can be configured as: single location + single keyword, multiple locations + single keyword, single location + multiple keywords, or multiple locations + multiple keywords. Campaign scans consolidate all data in the campaign report — no separate location/keyword/trend reports are generated. Use fieldmask to control returned fields. Recommended fieldmask: "report_key,name,status,locations,keywords,frequency,last_run,next_run,arp,atrp,solv,arp_move,atrp_move,solv_move".`,
    {
      startDate: z.string().date().nullish().describe("A lower limit date of a Campaign run you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit date of a Campaign run or schedule you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      runDate: z.string().date().nullish().describe("Filter only results for a specific Campaign run date. Expects date formatted as MM/DD/YYYY. Defaults to the last report run."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ startDate, endDate, placeId, runDate, nextToken, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconCampaignReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(runDate), handleNullOrUndefined(nextToken), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Campaign Report
  server.tool(
    "getLocalFalconCampaignReport",
    `Retrieves a specific campaign report with full details: aggregated ARP, ATRP, SoLV metrics, individual scan results, performance breakdowns by keyword and location, and scheduling info. Use the 'run' parameter (MM/DD/YYYY) to retrieve a specific historical run — defaults to the latest run. Use fieldmask to control response size — campaign reports with many locations/keywords can be very large. Recommended fieldmask for overview: "report_key,name,status,locations,keywords,arp,atrp,solv,arp_move,atrp_move,solv_move,frequency,last_run,next_run". Get the report_key from listLocalFalconCampaignReports.`,
    {
      reportKey: z.string().describe("The report_key of the Campaign Report you wish to retrieve."),
      run: z.string().nullish().describe("Optional specific campaign run date to retrieve (MM/DD/YYYY). Defaults to latest run."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, run, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCampaignReport(apiKey, reportKey, handleNullOrUndefined(run), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Create a new Campaign
  server.tool(
    "createLocalFalconCampaign",
    "Creates a new campaign in Local Falcon. Campaigns allow you to schedule recurring scans for one or multiple locations with one or multiple keywords. Locations must already exist in your Saved Locations (use listAllLocalFalconLocations to verify).",
    {
      name: z.string().describe("A name to give the campaign."),
      measurement: z.enum(['mi', 'km']).describe("The measurement unit of your radius (mi for miles, km for kilometers)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '21']).describe("The size of your desired grid."),
      radius: z.string().describe("The radius of your grid from center point to outer most point (0.1 to 100)."),
      frequency: z.enum(['one-time', 'daily', 'weekly', 'biweekly', 'monthly']).describe("The specific run frequency for the campaign."),
      placeId: z.string().describe("The location(s) to include in the campaign. Supports multiple Google Place IDs separated by commas."),
      keyword: z.string().describe("The keyword(s) to run against the campaign locations. Supports multiple keywords separated by commas."),
      startDate: z.string().describe("The date when your campaign runs the first time. Format: MM/DD/YYYY."),
      startTime: z.string().describe("The time of day your campaign should run. Format: friendly time like '9:00 AM'."),
      aiAnalysis: z.boolean().nullish().describe("Whether campaign scans should include AI analysis."),
      notify: z.boolean().nullish().describe("Whether email notification should be enabled for the campaign."),
      emailRecipients: z.string().nullish().describe("Recipients of email notification. Supports multiple email addresses separated by commas. Required if notify is true."),
      emailSubject: z.string().nullish().describe("Email subject of the email notification. Required if notify is true."),
      emailBody: z.string().nullish().describe("Email body of the email notification."),
    },
    async ({ name, measurement, gridSize, radius, frequency, placeId, keyword, startDate, startTime, aiAnalysis, notify, emailRecipients, emailSubject, emailBody }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (notify && !emailRecipients) {
        return { content: [{ type: "text", text: "emailRecipients is required when notify is enabled." }] };
      }
      if (notify && !emailSubject) {
        return { content: [{ type: "text", text: "emailSubject is required when notify is enabled." }] };
      }
      const resp = await createLocalFalconCampaign(apiKey, {
        name,
        measurement,
        gridSize,
        radius,
        frequency,
        placeId,
        keyword,
        startDate,
        startTime,
        aiAnalysis: aiAnalysis ?? undefined,
        notify: notify ?? undefined,
        emailRecipients: handleNullOrUndefined(emailRecipients) || undefined,
        emailSubject: handleNullOrUndefined(emailSubject) || undefined,
        emailBody: handleNullOrUndefined(emailBody) || undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Manually run a Campaign
  server.tool(
    "runLocalFalconCampaign",
    "Manually triggers a campaign to run immediately. The total credits required will be checked against your available credits. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to run.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to run."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await runLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Pause a Campaign
  server.tool(
    "pauseLocalFalconCampaign",
    "Pauses a campaign to stop it from running on its scheduled frequency. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to pause.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to pause."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await pauseLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Resume a Campaign
  server.tool(
    "resumeLocalFalconCampaign",
    "Resumes a campaign from a deactivated or paused status. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to resume.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to resume."),
      startDate: z.string().nullish().describe("Optional date to resume and run the campaign. Format: MM/DD/YYYY."),
      startTime: z.string().nullish().describe("Optional time of day the campaign should next run. Format: friendly time like '9:00 AM'."),
    },
    async ({ campaignKey, startDate, startTime }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await resumeLocalFalconCampaign(apiKey, campaignKey, handleNullOrUndefined(startDate), handleNullOrUndefined(startTime));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Reactivate a Campaign
  server.tool(
    "reactivateLocalFalconCampaign",
    "Reactivates a campaign that was deactivated due to insufficient credits. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to reactivate.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to reactivate."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await reactivateLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // List all Reviews Analysis Reports
  server.tool(
    "listLocalFalconReviewsAnalysisReports",
    `Lists Reviews Analysis reports in the account. These are premium AI-powered review analyses ($19/location) that evaluate up to 1M Google reviews for a target business plus up to 3 competitors. Separate from ranking scan reports. Filter by placeId, frequency, or reviewsKey. Use fieldmask to control returned fields. Recommended fieldmask: "reviews_key,name,date,locations,frequency,statistics.metrics.primaryBusiness". Use getLocalFalconReviewsAnalysisReport with a report key to see full results.`,
    {
      reviewsKey: z.string().nullish().describe("Filter by parent Reviews Analysis record key to retrieve only reports from that specific configuration."),
      placeId: z.string().nullish().describe("Filter by platform Place ID(s). Supports multiple IDs separated by commas."),
      frequency: z.enum(['one_time', 'daily', 'weekly', 'two_weeks', 'three_weeks', 'four_weeks', 'monthly']).nullish().describe("Filter by analysis frequency."),
      limit: z.number().min(1).max(100).nullish().describe("Number of results to retrieve (1-100). Defaults to 10."),
      nextToken: z.string().nullish().describe("Pagination token for retrieving the next page of results."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reviewsKey, placeId, frequency, limit, nextToken, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReviewsAnalysisReports(
        apiKey,
        handleNullOrUndefined(reviewsKey),
        handleNullOrUndefined(placeId),
        handleNullOrUndefined(frequency),
        limit ?? undefined,
        handleNullOrUndefined(nextToken),
        handleNullOrUndefined(fieldmask)
      );
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get specific Reviews Analysis Report
  server.tool(
    "getLocalFalconReviewsAnalysisReport",
    "Retrieves a specific Reviews Analysis report with full metrics: Review Volume Score (RVS), Review Quality Score (RQS), review velocity, freshness, total reviews, rating analysis, response rates, Local Guide reviews, photo reviews, and sentiment/topic analysis. Includes competitor comparison data if competitors were configured. Use fieldmask to control response size — review reports can be very large. Get the report key from listLocalFalconReviewsAnalysisReports.",
    {
      reportKey: z.string().describe("The key of the Reviews Analysis report you wish to retrieve."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReviewsAnalysisReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Falcon Guard Reports
  server.tool(
    "listLocalFalconGuardReports",
    `Lists locations monitored by Falcon Guard. Guard monitors Google Business Profiles for unwanted changes, checking twice daily. $1/month for up to 10 locations. OAuth-connected locations include enhanced metrics: calls, website clicks, directions, impressions (up to 18 months historical). Non-OAuth locations only show GBP change history. Use fieldmask to control returned fields. Recommended fieldmask: "report_key,place_id,location.name,location.address,location.rating,location.reviews,status,date_added,date_last". Filter by date range or status (protected/paused).`,
    {
      startDate: z.string().date().nullish().describe("A lower limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      status: z.enum(['protected', 'paused']).nullish().describe("Filter results by status: protected or paused."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ startDate, endDate, status, nextToken, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconGuardReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(status), handleNullOrUndefined(nextToken), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Falcon Guard Report
  server.tool(
    "getLocalFalconGuardReport",
    "Retrieves a Falcon Guard report IF it exists for the location given a place_id. Shows Google Business Profile monitoring data. OAuth-connected locations include full metrics (calls, clicks, directions) plus historical changes. Manually added locations only show historical GBP changes. Returns an error if Guard is not enabled for this location.",
    {
      placeId: z.string().describe("The place_id of the Falcon Guard Report you wish to retrieve."),
      startDate: z.string().nullish().describe("A lower limit date for changes and metrics. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date for changes and metrics. Expects date formatted as MM/DD/YYYY."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ placeId, startDate, endDate, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGuardReport(apiKey, placeId, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Add location(s) to Falcon Guard
  server.tool(
    "addLocationsToFalconGuard",
    "Adds one or multiple locations to be protected by Falcon Guard. Each business location must already be added to your Saved Locations in your Local Falcon dashboard before it can be protected. Use listAllLocalFalconLocations to verify locations exist first.",
    {
      placeId: z.string().describe("Platform Place ID(s) to protect. Supports multiple Place IDs separated by commas."),
    },
    async ({ placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await addLocationsToFalconGuard(apiKey, placeId);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Pause Falcon Guard protection for location(s)
  server.tool(
    "pauseFalconGuardProtection",
    "Pauses protection for one or multiple locations in Falcon Guard. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values for protected locations.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to pause. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to pause protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await pauseFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Resume Falcon Guard protection for location(s)
  server.tool(
    "resumeFalconGuardProtection",
    "Resumes protection for one or multiple locations in Falcon Guard that were previously paused. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values for paused locations.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to resume. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to resume protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await resumeFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Remove Falcon Guard protection for location(s)
  server.tool(
    "removeFalconGuardProtection",
    "Removes protection for one or multiple locations from Falcon Guard entirely. This deletes the Guard monitoring for the specified locations. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to remove. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to remove protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await removeFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Trend Reports
  server.tool(
    "listLocalFalconTrendReports",
    `Lists trend reports showing ranking changes over time. These are AUTO-GENERATED when 2+ scans are run with IDENTICAL settings (same Place ID, keyword, coordinates, grid size, radius, platform). Each trend report tracks one location + one keyword combination. Requires at least 2 matching scans to exist. NOT generated for campaign scans — that historical data is in the campaign report. Use fieldmask to control returned fields. Recommended fieldmask: "report_key,last_date,keyword,location.name,location.address,scan_count,arp,arp_move,atrp,atrp_move,solv,solv_move". Filter by placeId, keyword, platform, or date range.`,
    {
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("Filter only results for a specific platform."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ nextToken, placeId, keyword, startDate, endDate, platform, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = DEFAULT_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(platform), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Trend Report
  server.tool(
    "getLocalFalconTrendReport",
    `Retrieves a specific trend report showing historical ARP, ATRP, and SoLV changes across multiple scan dates for one location + one keyword. Includes individual scan data points with dates, metrics, and grid images. Also includes competitor location data from the scans. Use fieldmask to control response size — trend reports with many scans can be large. Recommended fieldmask: "report_key,last_date,keyword,location.name,scan_count,scans.*.report_key,scans.*.date,scans.*.arp,scans.*.atrp,scans.*.solv". Add "scans.*.image,scans.*.heatmap" if grid visualizations are needed. Get the report_key from listLocalFalconTrendReports.`,
    {
      reportKey: z.string().describe("The report key of the trend report."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );


  // Get list of Autoscans
  server.tool(
    "listLocalFalconAutoScans",
    "Lists ONLY individually scheduled automatic scans. NOTE: This does NOT include campaign-scheduled scans, which are the more common way to schedule recurring scans. To see campaign schedules, use listLocalFalconCampaignReports instead. Most users schedule scans through campaigns for better organization and reporting.",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      placeId: z.string().nullish().describe("The Place ID of the location."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '21']).nullish().describe("The grid size of the scan."),
      frequency: z.enum(["one-time", "daily", "weekly", "biweekly", "monthly"]).nullish().describe("The frequency of the scan."),
      status: z.string().nullish().describe("The status of the scan."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("The platform of the scan."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ nextToken, placeId, keyword, gridSize, frequency, status, platform, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconAutoScans(apiKey, handleNullOrUndefined(nextToken), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(frequency), handleNullOrUndefined(status), handleNullOrUndefined(platform), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Location Reports
  server.tool(
    "listLocalFalconLocationReports",
    "Lists location reports that aggregate scan data across multiple keywords for a specific business location. AUTO-GENERATED after a location has been scanned for 2+ different keywords outside of campaigns. NOT generated for campaign scans. Useful for seeing how a location performs across its keyword portfolio. Use fieldmask to control returned fields.",
    {
      placeId: z.string().nullish().describe("The Place ID of the location."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ placeId, keyword, startDate, endDate, nextToken, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconLocationReports(apiKey, limit, handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(nextToken), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Location Report
  server.tool(
    "getLocalFalconLocationReport",
    "Retrieves a specific location report aggregating scan data across multiple keywords for one business location. Shows which keywords perform best/worst for that location. Use fieldmask to control response size. Get the report_key from listLocalFalconLocationReports.",
    {
      reportKey: z.string().describe("The report key of the location report."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconLocationReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Keyword Reports
  server.tool(
    "listLocalFalconKeywordReports",
    "Lists keyword reports that aggregate scan data across multiple locations for a specific keyword. AUTO-GENERATED after a keyword has been scanned for 2+ different locations outside of campaigns. NOT generated for campaign scans. Useful for comparing how different locations perform for the same keyword. Use fieldmask to control returned fields.",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ nextToken, keyword, startDate, endDate, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconKeywordReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get specific Keyword Report
  server.tool(
    "getLocalFalconKeywordReport",
    "Retrieves a specific keyword report aggregating scan data across multiple locations for one keyword. Shows which locations perform best/worst for that keyword. Use fieldmask to control response size. Get the report_key from listLocalFalconKeywordReports.",
    {
      reportKey: z.string(),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Competitor Reports
  server.tool(
    "getLocalFalconCompetitorReports",
    `Lists competitor analysis reports. One is AUTO-GENERATED with every scan, showing top-ranking businesses in the scanned area. Filter by placeId, keyword, date range, or grid size. Use fieldmask to control returned fields. Recommended fieldmask: "report_key,date,keyword,location.name,grid_size,platform".`,
    {
      startDate: z.string().date().nullish().describe("A lower limit (oldest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit (newest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).nullish().describe("Filter only for specific grid sizes. Expects 3, 5, 7, 9, 11, 13, or 15."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ startDate, endDate, placeId, keyword, gridSize, nextToken, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconCompetitorReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(nextToken), handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get specific Competitor Report
  server.tool(
    "getLocalFalconCompetitorReport",
    `Retrieves a specific competitor report showing the competitive landscape from a scan. Includes top-ranking businesses with their ARP, ATRP, SoLV (or SAIV for AI scans), review counts, ratings, and geographic coordinates. Use fieldmask to control which competitor fields are returned. Recommended fieldmask: "date,keyword,grid_size,radius,businesses.*.name,businesses.*.place_id,businesses.*.arp,businesses.*.atrp,businesses.*.solv,businesses.*.reviews,businesses.*.rating,businesses.*.lat,businesses.*.lng". Available for all platform types including AI scans. Get the report_key from getLocalFalconCompetitorReports.`,
    {
      reportKey: z.string().describe("The report_key of the Competitor Report you wish to retrieve."),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ reportKey, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCompetitorReport(apiKey, reportKey, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // On-Demand Endpoints for Single-Point Checks
  server.tool(
    "getLocalFalconGrid",
    "Helper tool that generates grid coordinates for use with getLocalFalconRankingAtCoordinate or getLocalFalconKeywordAtCoordinate. Creates an array of lat/lng points based on your specified grid size and radius. NOTE: This is only useful if you're doing manual single-point checks. For comprehensive ranking analysis, skip this and use runLocalFalconScan instead, which handles grid creation automatically and provides full reports.",
    {
      lat: z.string().describe("The latitude of the center of the grid."),
      lng: z.string().describe("The longitude of the center of the grid."),
      gridSize: z.string().describe("Expects 3, 5, 7, 9, 11, 13, or 15."),
      radius: z.string().describe("The radius of the grid in meters. From 0.1 to 100."),
      measurement: z.enum(['mi', 'km']).nullish().describe("Expects 'mi' or 'km'."),
    },
    async ({ lat, lng, gridSize, radius, measurement }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGrid(apiKey, lat, lng, gridSize, radius, handleNullOrUndefined(measurement));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // On-Demand Endpoint - Single Point Ranking Check
  server.tool(
    "getLocalFalconRankingAtCoordinate",
    "SINGLE-POINT CHECK ONLY - LIMITED USE TOOL. Checks ranking at exactly ONE coordinate. NOT for comprehensive analysis. WARNING: This is like checking the weather by looking out one window - you miss the full picture. Only use for: debugging specific locations, verifying edge cases, or quick spot checks. For ANY serious ranking analysis, reporting, or visibility assessment, use runLocalFalconScan instead which provides complete geographic coverage. Never use this for client reports or strategic decisions.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The keyword to search for."),
      zoom: z.string().nullish().describe("The zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconRankingAtCoordinate(apiKey, lat, lng, keyword, zoom ? zoom : "13");
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );


  // On-Demand Endpoint - Single Point Keyword Search
  server.tool(
    "getLocalFalconKeywordAtCoordinate",
    "LIMITED TOOL - Shows raw search results at ONE SINGLE point without ranking analysis. Does not provide ranking positions or competitive insights. Only use for debugging or checking raw SERP data. For actual ranking analysis, use runLocalFalconScan.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The desired search term or keyword."),
      zoom: z.string().describe("The desired zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordAtCoordinate(apiKey, lat, lng, keyword, zoom ? zoom : "13");
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Search for Business Location on Google or Apple
  server.tool(
    "searchForLocalFalconBusinessLocation",
    "Searches for business locations on the specified platform. Returns a list of locations that match the search term.",
    {
      term: z.string().describe("The business location name to search for"),
      platform: z.enum(['google', 'apple']).default('google').describe("The platform to search against"),
      proximity: z.string().nullish().describe("Optional proximity filter (e.g., city, state, country)").default(""),
    },
    async ({ term, platform, proximity }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await searchForLocalFalconBusinessLocation(apiKey, term, platform, proximity ? proximity : undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  )

  // Save Business Location to Local Falcon Account
  server.tool(
    "saveLocalFalconBusinessLocationToAccount",
    "Saves a business location to your Local Falcon account. This is required to run a scan if it doesn't exist in your account.",
    {
      platform: z.enum(['google', 'apple']).default('google').describe("The platform to add the location from (google or apple)"),
      placeId: z.string().describe("The Business Location ID to add"),
      name: z.string().describe("Business name (required for Apple)").nullish(),
      lat: z.string().describe("Latitude (required for Apple)").nullish(),
      lng: z.string().describe("Longitude (required for Apple)").nullish(),
    },
    async ({ platform, placeId, name, lat, lng }, ctx) => {
      const apiKey = getApiKey(ctx);

      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers",
            },
          ],
        };
      }

      try {
        const resp = await saveLocalFalconBusinessLocationToAccount(apiKey, platform, placeId, handleNullOrUndefined(name), handleNullOrUndefined(lat), handleNullOrUndefined(lng));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resp, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to save business location: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // View Local Falcon Account Information
  server.tool(
    "viewLocalFalconAccountInformation",
    "Retrieves Local Falcon account information. Returns user, credit package, subscription, and credits.",
    {
      returnField: z.enum(['user', 'credit package', 'subscription', 'credits']).nullish().describe("Optional specific return information"),
      fieldmask: z.string().nullish().describe("Comma-separated list of fields to return. Use dot notation for nested fields (e.g., 'location.name'). Use wildcards for arrays (e.g., 'scans.*.arp'). Omit to return all fields."),
    },
    async ({ returnField, fieldmask }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }

      // The API's "credits" returnField looks for an active credit *package*, which
      // may return empty even when the account has usable credits. When the user asks
      // for "credits", fetch the full account response and extract the credits summary
      // so they always see their actual balance.
      if (returnField === 'credits') {
        const fullResp = await fetchLocalFalconAccountInfo(apiKey, undefined, handleNullOrUndefined(fieldmask));
        const data = fullResp?.data ?? fullResp;
        // Extract credits info from wherever it lives in the full response
        const credits = data?.credits ?? data?.user?.credits ?? null;
        if (credits) {
          return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { credits } }, null, 2) }] };
        }
        // Fallback: return the full response if we can't find a credits block
        return { content: [{ type: "text", text: JSON.stringify(fullResp, null, 2) }] };
      }

      const resp = await fetchLocalFalconAccountInfo(apiKey, handleNullOrUndefined(returnField) as any, handleNullOrUndefined(fieldmask));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  )

  // Search Knowledge Base
  server.tool(
    "searchLocalFalconKnowledgeBase",
    "Searches the Local Falcon Knowledge Base for help articles, how-to guides, and platform documentation. USE THIS TOOL when a user asks how to do something in Local Falcon, needs help understanding a feature, wants setup or configuration instructions, or is looking for best practices and tips. This is the go-to tool for any 'how do I...', 'what is...', 'how does... work', or 'help me with...' questions about the Local Falcon platform. Returns a list of matching articles with titles and summaries. Use getLocalFalconKnowledgeBaseArticle after this to retrieve the full step-by-step content of a specific article.",
    {
      q: z.string().nullish().describe("Search query to find relevant articles. Use natural language keywords like 'how to run a scan', 'campaign setup', 'grid size', 'credits', etc."),
      categoryId: z.string().nullish().describe("Optional category ID to narrow results to a specific topic area."),
      limit: z.string().nullish().describe("Maximum number of articles to return."),
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
    },
    async ({ q, categoryId, limit, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await searchLocalFalconKnowledgeBase(apiKey, handleNullOrUndefined(q), handleNullOrUndefined(categoryId), handleNullOrUndefined(limit), handleNullOrUndefined(nextToken));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get Knowledge Base Article
  server.tool(
    "getLocalFalconKnowledgeBaseArticle",
    "Retrieves the complete content of a specific Local Falcon Knowledge Base article, including full step-by-step instructions in markdown format. Use this AFTER searchLocalFalconKnowledgeBase to get the full guide for a specific article. If the user references an article by number (e.g. 'KB70', 'article 70', '#70'), strip any prefix and pass just the numeric ID. This is the tool that gives you the actual detailed instructions, walkthroughs, and explanations — the search tool only returns summaries.",
    {
      articleId: z.string().describe("The numeric ID of the Knowledge Base article to retrieve (e.g. '70'). If the user says 'KB70' or 'article 70', just pass '70'."),
    },
    async ({ articleId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      // Strip any non-numeric prefix (e.g. "KB70" -> "70")
      const cleanId = articleId.replace(/^[^0-9]+/, '');
      const resp = await getLocalFalconKnowledgeBaseArticle(apiKey, cleanId);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  return server;
};

