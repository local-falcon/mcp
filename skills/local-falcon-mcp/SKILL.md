---
name: local-falcon-mcp
description: |
  Expert guide for using the Local Falcon MCP — an AI-powered local search intelligence platform — to monitor AI visibility (ChatGPT, Gemini, Grok, Google AI Overviews, AI Mode), analyze geo-grid map rankings, evaluate AI sentiment analysis, assess competitor landscapes, and manage Google Business Profile performance. Use this skill whenever the user works with Local Falcon data including: AI search monitoring, scan reports, trend analysis, campaign management, Falcon Guard monitoring, reviews analysis, competitor research, or keyword tracking. Covers metric interpretation (SoLV, SAIV, ARP, ATRP, RVS, RQS), multi-platform analysis across 8 platforms, workflow patterns, credit-conscious scanning strategies, and actionable local SEO and AI search optimization recommendations. Also use when the user asks about AI-powered search presence, local search visibility, map pack rankings, or GBP optimization for any business.
---

# Local Falcon MCP Skill

## Overview

Local Falcon is an AI-powered local search intelligence platform that monitors business visibility across AI search engines (ChatGPT, Gemini, Grok, Google AI Overviews, AI Mode) and traditional map platforms (Google Maps, Apple Maps), provides AI sentiment analysis via AI-powered scan reports, and delivers deep research review reports. The Local Falcon MCP provides 37 tools for AI visibility monitoring, geo-grid ranking analysis, competitive intelligence, campaign management, GBP monitoring, review analysis, and knowledge base access.

The individual tool descriptions explain what each tool does and its parameters. This skill teaches you how to think strategically about Local Falcon data: which tools to combine for common tasks, how to interpret metrics in context, and how to translate raw data into actionable recommendations.

Always use the term "Google Business Profile" or "GBP." Never say "Google My Business" or "GMB" — it was rebranded in 2021.

## Core Metrics — Quick Reference

### Ranking Metrics

**ARP (Average Rank Position):** Average ranking across grid points where the business appears. Measures ranking quality when visible. Lower is better. Does not account for grid points where the business is absent — a business with ARP 2.0 that only appears on 10% of the grid has excellent quality but terrible coverage.

**ATRP (Average Total Rank Position):** Average ranking across ALL grid points, counting non-appearances as position 21. The primary overall visibility metric because it captures both ranking quality and geographic coverage. When ARP and ATRP diverge significantly (e.g., ARP 4.0 vs. ATRP 16.0), the business ranks well where it shows up but is invisible across most of the scan area.

**SoLV (Share of Local Voice):** Percentage of grid points where the business ranks in the top 3 (the map pack). Maps-only metric — Google Maps and Apple Maps. This is the single most important metric for map-based visibility because the top 3 positions capture the vast majority of clicks. Do not use for AI platform scans.

**SAIV (Share of AI Visibility):** Percentage of AI-generated results that mention the business. AI platforms only — ChatGPT, Gemini, Grok, AI Overviews, AI Mode, Immersive AI Overviews. Never confuse SAIV with SoLV — they measure fundamentally different things on different platforms. If a user references SoLV when discussing AI scans, correct the terminology before analyzing.

### Competitive Metrics

**Competition SoLV:** Count of unique competitors with any top-3 placements in the scan area. High values indicate a crowded market with many businesses jockeying for map pack positions.

**Max SoLV:** Highest SoLV achieved by any single business in the scan. Establishes the visibility ceiling for that keyword and market. The top performer may have structural advantages (proximity, keyword-in-name) that cannot be easily replicated.

**Opportunity SoLV:** Max SoLV minus your SoLV. Quantifies realistic growth potential. Large gap = room to grow. Small gap = near the market ceiling. Some Opportunity SoLV may be constrained by unchangeable factors like location.

**Found In:** Number of grid points where the business appears at all. Measures geographic coverage. Caution: high Found In with high ATRP means appearing widely at poor positions — breadth without quality.

### Review Metrics

**RVS (Review Volume Score):** Composite of review velocity (monthly flow rate over last 90 days) and total review count. Both components are required for a strong score — high velocity without accumulated volume, or high volume with no recent reviews, both produce weak RVS.

**RQS (Review Quality Score):** Composite of rating distribution, owner response engagement, and review recency. A 5.0 rating from 3 reviews with no responses scores lower than a 4.7 from 200 reviews with active owner responses and recent activity.

### The Golden Rule

Never use hardcoded thresholds to judge metrics. All scores must be interpreted relative to:

- **Keyword competitiveness** — "personal injury lawyer" is far more competitive than "antique clock repair"
- **Market density** — urban downtown vs. suburban vs. rural
- **Scan configuration** — a 1-mile radius in Manhattan vs. a 15-mile radius in rural Texas
- **Business category** — restaurants, law firms, and plumbers have different competitive dynamics
- **Business type** — storefronts vs. Service Area Businesses (SABs) have different expected patterns
- **Platform** — Google Maps, Apple Maps, and AI platforms each have different visibility ceilings

When presenting metrics, always explain what the scores mean for this specific business in this specific context.

For the full metric interpretation guide, see: `references/metrics-interpretation.md`

## Workflow Patterns

These are the recommended tool sequences for common user requests.

### 1. "How am I ranking?" / "Check my visibility"

1. `listLocalFalconScanReports` — filter by placeId and recent dates to find existing scans. Always check before running new ones.
2. If a recent scan exists: `getLocalFalconReport` with fieldmask `report_key,date,keyword,location,arp,atrp,solv,found_in,total_competitors,competition_solv,max_solv,opportunity_solv,grid_size,radius,measurement,ai_analysis,image,heatmap`
3. Present results: show the grid image from the `image` or `heatmap` URL, summarize key metrics, highlight geographic strengths and weaknesses, and include the `ai_analysis` if available.
4. Provide the Local Falcon report URL for interactive exploration.
5. If no recent scan exists: offer to run one. Confirm keyword, grid size, radius, and platform first — scans cost credits.

### 2. "Who are my competitors?"

1. `getLocalFalconCompetitorReports` — find competitor reports for the location. Filter by placeId and keyword.
2. `getLocalFalconCompetitorReport` — retrieve with fieldmask `date,keyword,grid_size,radius,businesses.*.name,businesses.*.place_id,businesses.*.arp,businesses.*.atrp,businesses.*.solv,businesses.*.reviews,businesses.*.rating,businesses.*.lat,businesses.*.lng`
3. Analyze the landscape: identify who dominates (highest SoLV), where the user ranks relative to top competitors, and what differentiates them (reviews, rating, proximity).
4. Identify opportunity zones where competition is weak.

### 3. "How have my rankings changed over time?"

1. `listLocalFalconTrendReports` — find trend data for the location and keyword. Requires 2+ identical scans to exist.
2. `getLocalFalconTrendReport` — retrieve with fieldmask `report_key,keyword,location.name,scan_count,scans.*.date,scans.*.arp,scans.*.atrp,scans.*.solv,scans.*.image`
3. Narrate the trajectory: improving, declining, or stable? Highlight significant movements. If declining SoLV with stable ARP, competitors are improving — check the competitor report for new entrants.

### 4. "Run a scan for [keyword]"

1. Always confirm with the user — scans cost credits.
2. `viewLocalFalconAccountInformation` — verify sufficient credits.
3. `listAllLocalFalconLocations` — confirm the business is saved. If not found, use `searchForLocalFalconBusinessLocation` to find it, then `saveLocalFalconBusinessLocationToAccount` to add it.
4. Determine scan parameters: coordinates from the saved location or a previous scan, grid size and radius based on business type and service area.
5. `runLocalFalconScan` — submit with confirmed parameters.
6. Poll `listLocalFalconScanReports` (filter by placeId) for the completed report. Never retry the scan. If not found after 4-5 polls, direct the user to https://www.localfalcon.com/reports.

### 5. "Set up recurring monitoring"

1. `listAllLocalFalconLocations` — verify all target locations are saved.
2. Discuss campaign parameters: frequency (daily/weekly/biweekly/monthly), keywords, grid size, radius. Monthly is the most credit-efficient for ongoing monitoring. Explain credit implications.
3. `createLocalFalconCampaign` — create with confirmed settings. Note that campaign data consolidates into the campaign report.

### 6. "Help me understand [feature]"

1. `searchLocalFalconKnowledgeBase` — search using natural language keywords related to the user's question.
2. `getLocalFalconKnowledgeBaseArticle` — retrieve the full guide.
3. Walk the user through the content, supplementing with their actual account data when relevant.

### 7. "Check my Google Business Profile"

1. `listLocalFalconGuardReports` — check if Guard monitoring is enabled for the location.
2. `getLocalFalconGuardReport` — retrieve monitoring data. OAuth-connected locations include calls, website clicks, directions, and impressions. Non-OAuth locations only show change history.
3. Flag any detected profile changes and summarize engagement metrics if available.

### 8. "Analyze my reviews"

1. `listLocalFalconReviewsAnalysisReports` — find available review analysis reports.
2. `getLocalFalconReviewsAnalysisReport` — retrieve the full analysis.
3. Summarize RVS, RQS, velocity, freshness, sentiment themes, and competitive comparison. Identify whether the core issue is volume, quality, or freshness.

### 9. "Compare me against a specific competitor"

1. `getLocalFalconCompetitorReports` — find a competitor report covering the target keyword.
2. `getLocalFalconCompetitorReport` — retrieve with the standard competitive fieldmask.
3. Build a side-by-side comparison: ARP, ATRP, SoLV, review count, rating, primary categories.
4. Identify the biggest differentiator and recommend specific actions with measurable targets. Example: "Your competitor has 78 reviews to your 34. Generating 10 reviews/month closes this gap in 4-5 months."

### 10. "Give me a full performance assessment"

Gather all available data — do not run new scans unless explicitly requested:

1. `getLocalFalconReport` — latest scan for current ranking snapshot
2. `getLocalFalconCompetitorReport` — competitive landscape
3. `getLocalFalconTrendReport` — historical trajectory (if available)
4. `getLocalFalconGuardReport` — GBP health and engagement (if Guard enabled)
5. `getLocalFalconReviewsAnalysisReport` — review profile strength (if available)
6. Synthesize using the analysis framework in `references/analysis-frameworks.md`: current position, competitive context, trend direction, then action items structured as immediate / medium-term / long-term.

### 11. "What's my account status?" / "How many credits do I have?"

1. `viewLocalFalconAccountInformation` — retrieve credits, subscription tier, and package info.
2. Summarize: available credits, current plan, and relevant limits. If credits are low and the user wants to run scans, flag this proactively.

## Platform Differences

### Map Platforms (Google Maps, Apple Maps)

- Use **SoLV** as the primary visibility metric
- Ranking is proximity-dominant: distance from search point to business is the strongest signal
- Google Maps provides the richest data: reviews, ratings, AI analysis option, full metric suite
- Apple Maps does not include review/rating data and does not support AI analysis
- Both support the full positional metric set: ARP, ATRP, SoLV, Competition SoLV, Max SoLV, Opportunity SoLV, Found In

### AI Platforms (gaio, chatgpt, gemini, grok, aimode)

- Use **SAIV** instead of SoLV — never apply SoLV to AI scans
- ARP/ATRP on AI scans are pseudo-ranks derived from mention order, not map positions
- Ranking is authority-dominant: citations on authoritative sources, structured data, and real-world prominence matter more than proximity
- AI visibility is volatile — results can shift significantly between scans
- Strategy differs fundamentally: instead of optimizing GBP and proximity, focus on becoming a citable source on authoritative sites, directories, and publications

For platform-by-platform details, see: `references/platform-differences.md`

## Report Type Guide

Understanding report type relationships prevents unnecessary tool calls and sets correct expectations.

```
Scan Report (point-in-time, user-initiated, costs credits)
├── auto-generates → Competitor Report (one per scan)
├── 2+ identical scans → Trend Report (historical tracking)
├── 2+ keywords, same location → Location Report (keyword portfolio)
└── 2+ locations, same keyword → Keyword Report (cross-location view)

Campaign Report (scheduled recurring scans, user-configured)
├── Contains its own historical trend data across runs
├── Contains individual scan results per location + keyword
└── Does NOT generate separate Trend, Location, or Keyword reports

Guard Report (GBP monitoring, separate from ranking scans)
└── Tracks profile changes + engagement metrics (if OAuth connected)

Reviews Analysis Report (premium AI analysis, $19/location)
└── Evaluates reviews for business + up to 3 competitors
```

**Key rules:**
- Trend, Location, and Keyword reports are auto-generated only for standalone scans, never for campaign scans
- Trend reports require 2+ scans with identical settings (same Place ID, keyword, coordinates, grid, radius, platform)
- Competitor reports are auto-generated with every scan on every platform
- If a scan has a `campaign_key`, its data lives in the campaign report

## Guardrails

### Always

- **Treat every scan request as a workflow, not a single tool call.** Before running any scan, execute the full workflow pattern from Section 3.4: check existing reports, verify the location is saved, confirm credits, agree on parameters with the user, then submit. Skipping steps leads to wasted credits or failed scans.
- **Make credit costs visible.** When recommending scans, campaigns, or AI analysis, proactively state that these consume credits and confirm before proceeding. Use `viewLocalFalconAccountInformation` to check the balance when the user's credit situation is unknown.
- **Provide the Local Falcon report URL** so users can explore the interactive grid visualization for richer analysis than text summaries allow.
- **Contextualize every metric.** Never present ARP, SoLV, or SAIV without explaining what the score means for this specific keyword, market, and business category.
- **Structure analysis as:** diagnose current state → identify root causes → prescribe specific actions → recommend validation timing. See `references/analysis-frameworks.md`.

### Never

- **Use hardcoded thresholds** for any metric. A SoLV of 40% might be dominant for "personal injury lawyer" and weak for "gas station." Always interpret in context.
- **Render or recreate grid visualizations.** Scan reports include pre-rendered grid and heatmap images via CDN URLs. Display those images — do not attempt to build ASCII grids or data tables as substitutes.
- **Ignore "closed during scan" flags** in results. These indicate the business was marked closed during the scan, artificially tanking rankings. This is a GBP issue, not a ranking issue — flag it to the user.
- **Present raw data without interpretation.** Users are business owners and marketers. Lead with insights and recommendations, then support with specific data points.

## Response Style

**Audience:** Business owners, marketers, and SEO professionals. Translate metrics into business impact. Avoid developer jargon.

**Scan result presentation order:**
1. Grid/heatmap image (from the CDN URL in the report)
2. Key metrics summary (ARP, ATRP, SoLV or SAIV, Found In)
3. Geographic strengths and weaknesses
4. Competitive context (position vs. top competitors)
5. Specific, prioritized action items
6. Recommended next steps and re-scan timing

**Analysis approach:** Use hypothesis-driven interpretation. Form a theory about why a pattern exists (e.g., "ARP drops significantly in the northeast quadrant"), cross-reference supporting data (competitor density, review gaps), distinguish correlation from causation, and state the likely mechanism before recommending a fix.

**Credit consciousness:** Every recommendation involving scans or campaigns should acknowledge the credit cost. Suggest optimizations: smaller grids for quick checks, campaigns for ongoing monitoring vs. repeated manual scans, appropriate radius for the business type.

**Service Area Businesses (SABs):** SABs serve customers at the customer's location (plumbers, electricians, HVAC). Seeing strong rankings far from the business with weak rankings nearby is normal for SABs. The scan center point should be where customers are concentrated, not the office address. If you see this inverted pattern, explain it as expected SAB behavior — do not diagnose it as a problem.

For the full analysis framework and GBP optimization benchmarks, see: `references/analysis-frameworks.md`
