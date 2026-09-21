# Local Falcon MCP Workflows

Complete ChatGPT-profile tool inventory and common workflows for Local Falcon analysis. Apply the existing-account and Knowledge Base boundaries in SKILL.md throughout.

---

## MCP Server Overview

**Package:** `@local-falcon/mcp`
**Installation:** `npm install @local-falcon/mcp`
**Documentation:** [docs.localfalcon.com](https://docs.localfalcon.com)

The MCP server wraps Local Falcon's API endpoints with developer-friendly tool names, enabling AI agents to pull real data and perform analysis.

---

## API Fundamentals

**Base URL:** `https://api.localfalcon.com`

**Authentication:** ChatGPT uses the existing-account sign-in flow. Credentials are supplied by the server, never by a tool argument or pasted into chat. Do not call API endpoints directly to bypass the ChatGPT profile.

**Platform Options:** `google`, `apple`, `chatgpt`, `gemini`, `aimode`, `gaio` (Google AI Overviews)

---

## Complete ChatGPT Tool Reference

The ChatGPT profile exposes 57 tools. The normal MCP profile additionally supports separately metered On-Demand lookups; those are unavailable here. This inventory includes connected GBP reads and public GBP writes. Follow the current tool input schema for exact parameter names, required fields, and supported values; examples below describe workflow intent rather than literal API payloads.

| Tool | Purpose |
|------|---------|
| `listLocalFalconScanReports` | List Scan Reports |
| `getLocalFalconReport` | Get Scan Report |
| `listAllLocalFalconLocations` | List Saved Locations |
| `listLocalFalconLocationGroups` | List Location Groups |
| `runLocalFalconScan` | Run Ranking Scan |
| `listLocalFalconCampaignReports` | List Campaign Reports |
| `getLocalFalconCampaignReport` | Get Campaign Report |
| `createLocalFalconCampaign` | Create Campaign |
| `updateLocalFalconCampaign` | Update Campaign |
| `runLocalFalconCampaign` | Run Campaign |
| `pauseLocalFalconCampaign` | Pause Campaign |
| `resumeLocalFalconCampaign` | Resume Campaign |
| `reactivateLocalFalconCampaign` | Reactivate Campaign |
| `listLocalFalconReviewsAnalysisReports` | List Reviews Analysis Reports |
| `getLocalFalconReviewsAnalysisReport` | Get Reviews Analysis Report |
| `listLocalFalconGuardReports` | List Falcon Guard Reports |
| `getLocalFalconGuardReport` | Get Falcon Guard Report |
| `addLocationsToFalconGuard` | Add Locations to Falcon Guard |
| `pauseFalconGuardProtection` | Pause Falcon Guard Protection |
| `resumeFalconGuardProtection` | Resume Falcon Guard Protection |
| `removeFalconGuardProtection` | Remove Falcon Guard Protection |
| `listLocalFalconTrendReports` | List Trend Reports |
| `getLocalFalconTrendReport` | Get Trend Report |
| `listLocalFalconAutoScans` | List Scheduled Auto-Scans |
| `listLocalFalconLocationReports` | List Location Reports |
| `getLocalFalconLocationReport` | Get Location Report |
| `listLocalFalconKeywordReports` | List Keyword Reports |
| `getLocalFalconKeywordReport` | Get Keyword Report |
| `getLocalFalconCompetitorReports` | List Competitor Reports |
| `getLocalFalconCompetitorReport` | Get Competitor Report |
| `getLocalFalconGrid` | Generate Grid Coordinates |
| `searchForLocalFalconBusinessLocation` | Search public businesses; costs exactly 2 existing Local Falcon credits per successful search |
| `saveLocalFalconBusinessLocationToAccount` | Save Business Location |
| `viewLocalFalconAccountInformation` | View Account Information |
| `searchLocalFalconKnowledgeBase` | Search Knowledge Base |
| `getLocalFalconKnowledgeBaseArticle` | Get Knowledge Base Article |
| `getLocalFalconGbpProfile` | Get GBP Profile |
| `getLocalFalconGbpGoogleUpdates` | Get GBP Google Updates |
| `getLocalFalconGbpVerificationStatus` | Get GBP Verification Status |
| `getLocalFalconGbpAttributes` | Get GBP Attributes |
| `listLocalFalconGbpServices` | List GBP Services |
| `getLocalFalconGbpPerformanceMetrics` | Get GBP Performance Metrics |
| `listLocalFalconGbpPosts` | List GBP Posts |
| `listLocalFalconGbpMedia` | List GBP Media |
| `listLocalFalconGbpCustomerMedia` | List GBP Customer Media |
| `listLocalFalconGbpReviews` | List GBP Reviews |
| `listLocalFalconGbpActionLinks` | List GBP Action Links |
| `searchLocalFalconGbpCategories` | Search GBP Categories |
| `searchLocalFalconGbpChains` | Search GBP Chains |
| `getLocalFalconGbpAvailableAttributes` | Get GBP Available Attributes |
| `getLocalFalconGbpAvailableActionTypes` | Get GBP Available Action Types |
| `manageLocalFalconGbpPosts` | Manage GBP Posts |
| `manageLocalFalconGbpMedia` | Manage GBP Media |
| `manageLocalFalconGbpReviewReplies` | Manage GBP Review Replies |
| `manageLocalFalconGbpActionLinks` | Manage GBP Action Links |
| `manageLocalFalconGbpServices` | Manage GBP Services |
| `updateLocalFalconGbpProfile` | Update GBP Profile |

---

## Optional AI Analysis Report

AI Analysis is optional for `runLocalFalconScan` and may consume additional existing credits. Explain this and use the user's confirmed choice.

### What It Provides
- Automated pattern detection
- Competitive diagnosis
- Prioritized recommendations
- Expert-level interpretation of raw metrics

### Implementation

Read the current tool schema for the AI Analysis option. Explain its additional existing-credit use and apply the user's confirmed choice; do not automatically add it.

### User Communication

If the user has not already specified their AI Analysis choice:
> "Optional AI Analysis adds automated interpretation and may use additional existing credits. Would you like it included?"

---

## Intelligent Scan Setup (Conversational Approach)

The most common user request is "help me set up a scan." Here's how to do it RIGHT - by gathering context first, not asking generic questions.

### Why This Matters

**DON'T do this:**
```
Agent: "What keywords do you want to track?"
Agent: "What grid size?"
Agent: "What radius?"
```

Users often don't know the answers. These questions without context aren't helpful.

**DO this instead:**
```
Agent: [Uses MCP to pull their business info]
Agent: "I see you're a plumber in Dallas. For plumbers, most customers search
        'plumber near me' or 'emergency plumber'. Want to start with one of those?"
Agent: "Since you're a service area business, we should scan a wider area -
        maybe 10 miles. What's the farthest you'd drive for a job?"
```

### The Right Flow

**Step 1: Pull Context First**
```
listAllLocalFalconLocations → See what they have saved
  ↓
IF saved: Get GBP data (category, address, service areas)
IF not: disclose the 2-existing-credit cost, then searchForLocalFalconBusinessLocation → Get Place ID and GBP data
```

**Step 2: Suggest Keywords Based on GBP Category**

| GBP Category | Suggested Keywords |
|--------------|-------------------|
| Plumber | `plumber near me`, `emergency plumber`, `plumbing services` |
| Italian Restaurant | `italian restaurant`, `best pasta near me`, `italian food` |
| HVAC Contractor | `ac repair near me`, `hvac service`, `heating and cooling` |
| Personal Injury Attorney | `personal injury lawyer`, `car accident attorney`, `injury attorney near me` |
| Hair Salon | `hair salon near me`, `haircut`, `best salon` |

**Agent says:** "Your GBP shows you're a [category]. Most customers search for '[primary keyword]' - want to start there, or is there a specific service you want to track?"

**Step 3: Determine Grid Based on Business Type**

| Type | How to Detect | Grid Recommendation |
|------|---------------|---------------------|
| **Storefront** | Has physical address, no service areas | 7x7 or 9x9, 0.5-1mi radius |
| **SAB (Service Area Business)** | Has service areas defined | 13x13+, 3-10mi radius |
| **Hybrid** | Has both address and service areas | Depends - ask about customer behavior |

**Agent says:** "Do customers come to your location, or do you go to them?"

**Step 4: Center Point Logic**

- **Storefronts:** Use business address (automatic)
- **SABs:** Choose a center based on customer concentrations and service coverage; do not assume the office is always right or wrong

**Agent says:** "For service businesses, we center the scan where your customers are. Where do you get most of your jobs - any particular neighborhood or part of town?"

**Step 5: Execute the confirmed scan**

```
runLocalFalconScan:
  placeId: [from discovery]
  keyword: [suggested and confirmed]
  platform: google (default) or user's choice
  gridSize: [appropriate supported size]
  radius: [appropriate for service radius]
  measurement: mi or km
  lat/lng: [confirmed center coordinates]
  aiAnalysis: [confirmed choice; Google Maps only]
```

**Before execution:** Make scan settings, optional AI Analysis, and existing-credit use clear. Obtain confirmation only for an operation or settings the user has not already explicitly approved.

### Campaign vs Single Scan

**Ask about campaigns when:**
- User has 3+ locations saved
- User mentions "track over time" or "monitor"
- User asks about multiple locations

**Agent says:** "Since you have multiple locations, would you like to set this up as a Campaign? That way it runs automatically on a schedule and you can compare locations."

---

## Standard Workflows

### Workflow 1: Account Health Check

**Purpose:** Quick overview of account status and recent activity

```
1. viewLocalFalconAccountInformation
   → Check credits available, subscription status

2. listAllLocalFalconLocations
   → See all saved locations

3. listLocalFalconCampaignReports
   → Check for active campaigns

4. getLocalFalconCampaignReport (for most recent)
   → Pull latest data for analysis
```

**Output:** Account status summary, location count, campaign health

---

### Workflow 2: New Location Setup & Analysis

**Purpose:** Add new location and run initial visibility scan

```
1. searchForLocalFalconBusinessLocation
   → Search by business name to get Place ID
   → Parameters: query="Business Name City", platform="google"; costs 2 existing credits

2. saveLocalFalconBusinessLocationToAccount
   → Save location for ongoing tracking
   → Parameters: placeId from step 1

3. listLocalFalconScanReports
   → Check if any existing scan data
   → Parameters: placeId; use nextToken for more results

4. runLocalFalconScan (if no recent scans)
   → Execute initial scan
   → Parameters: placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis=[confirmed choice]
   → Make optional AI Analysis and existing-credit use clear; ask only for approval not already given

5. getLocalFalconReport
   → Retrieve and analyze results
   → Parameters: reportKey from the completed report listing
```

**Output:** Complete initial visibility assessment with recommendations

---

### Workflow 3: AI Visibility Audit

**Purpose:** Assess visibility across all AI platforms

```
1. listLocalFalconScanReports
   → Find existing AI platform scans
   → Parameters: placeId, platform (cycle through: chatgpt, gemini, aimode, gaio)

2. FOR EACH platform with recent data:
   getLocalFalconReport
   → Pull scan details
   → Extract SAIV score

3. COMPARE across platforms:
   - Which platforms mention the business most?
   - Where are the gaps?
   - Platform-specific patterns?

4. APPLY platform knowledge:
   - ChatGPT weak? → Inspect actual report citations and compare relevant listings and third-party mentions
   - AI Overviews weak? → Inspect actual cited publishers, business websites, and competitor mentions
```

**Output:** Cross-platform SAIV comparison with platform-specific recommendations

---

### Workflow 4: Competitive Analysis

**Purpose:** Understand competitive landscape and identify opportunities

```
1. listAllLocalFalconLocations
   → Get target location details

2. getLocalFalconCompetitorReports
   → List available competitor analyses
   → Parameters: placeId

3. getLocalFalconCompetitorReport
   → Pull detailed competitor data
   → Parameters: reportKey

4. ANALYZE:
   - Competitor SoLV scores
   - Review counts and ratings
   - Geographic coverage patterns
   - Where competitors are weak

5. IDENTIFY:
   - Opportunity corridors (low competition areas)
   - Review gaps to close
   - Keywords where you can win
```

**Output:** Gap analysis with prioritized actions to improve competitive position

---

### Workflow 5: Trend Analysis

**Purpose:** Track performance changes over time

```
1. listLocalFalconTrendReports
   → Find available trend data
   → Parameters: placeId, keyword

2. getLocalFalconTrendReport
   → Pull historical data
   → Parameters: trendKey

3. ANALYZE:
   - Direction: Improving, declining, or stable?
   - Inflection points: When did changes occur?
   - Correlation: What events match ranking shifts?
   - Seasonality: Predictable patterns?

4. COMPARE:
   - Your trajectory vs. competitors
   - Current position vs. 30/60/90 days ago
```

**Output:** Performance trajectory with forecasting insights

---

### Workflow 6: GBP Health Monitoring

**Purpose:** Check for GBP changes and performance trends

```
1. listLocalFalconGuardReports
   → Check monitored locations

2. getLocalFalconGuardReport
   → Pull specific monitoring data
   → Parameters: placeId

3. CHECK:
   - Any recent GBP edits detected?
   - Performance trends (impressions, calls, directions)
   - Alerts or warnings?

4. IF issues found:
   - Identify what changed
   - Assess impact on visibility
   - Recommend remediation
```

**Output:** GBP health status with alerts and recommended actions

---

### Workflow 7: Multi-Location Brand Analysis

**Purpose:** Enterprise view across all locations

```
1. listAllLocalFalconLocations
   → Get all brand locations

2. listLocalFalconLocationReports
   → See aggregated performance by location

3. listLocalFalconKeywordReports
   → See aggregated performance by keyword

4. ANALYZE:
   - Top performing locations
   - Underperforming locations
   - Consistent issues across locations
   - Keyword opportunities

5. PRIORITIZE:
   - Which locations need immediate attention?
   - Which keywords to focus on?
   - Resource allocation recommendations
```

**Output:** Portfolio overview with location-by-location priorities

---

## Common Parameters

### Pagination
- Result limits are tool-specific; use only fields supported by the current tool schema.
- `nextToken` - Token from previous response for next page

### Filtering
- `placeId` - Filter by Google/Apple Place ID
- `keyword` - Filter by keyword (loose match)
- `gridSize` - Filter by supported scan grid size; allowed sizes vary by tool
- `platform` - Filter by platform(s)
- `startDate` / `endDate` - Date range; follow the specific tool's date format
- `campaignKey` - Filter scans from specific campaign

### Field Masks (Performance Optimization)
Use `fieldmask` to return only needed fields:
```
fieldmask=report_key,arp,atrp,solv
fieldmask=reports.*.report_key,reports.*.date
```

---

## Error Handling

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| Authentication failed | Connection missing or expired | Reconnect the existing account through the integration sign-in flow |
| Insufficient credits | Account out of credits | Explain that the action was not run because existing credits are insufficient; optionally link neutrally to https://www.localfalcon.com/pricing |
| Place ID not found | Invalid or unsaved location | Use `searchForLocalFalconBusinessLocation` first |
| Rate limit exceeded | Too many requests | Wait before retrying reads; do not retry a submitted scan |

### Best Practices
1. Before a requested credit-consuming action, check `viewLocalFalconAccountInformation` for existing balance when needed. General strategy questions need no account calls.
2. Use `fieldmask` to reduce response size when possible
3. Cache results when appropriate
4. Handle pagination for large result sets

---

## Integration Tips

### For Connected MCP Clients
- MCP tools appear in your tool list automatically once configured
- Use natural language: "Check my Local Falcon account" → triggers appropriate tools
- Chain workflows together for comprehensive analysis

### For Custom Integrations
- API documentation: [docs.localfalcon.com](https://docs.localfalcon.com)
- Rate limits apply - implement appropriate backoff
- Webhook support available for campaign completions

---

*For questions about MCP integration, contact Local Falcon support or visit [docs.localfalcon.com](https://docs.localfalcon.com).*
