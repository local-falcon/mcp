# Metrics Interpretation — Deep Guide

This reference provides detailed interpretation guidance for all Local Falcon metrics. Use this when you need to go beyond the quick-reference summaries in SKILL.md.

## ARP (Average Rank Position)

ARP measures ranking quality only where the business appears in search results. It excludes grid points where the business is absent entirely.

**Interpretation by range:**
- Below 3.0: Strong map pack presence. The business consistently appears in top-3 positions where it shows up. Focus shifts from ranking improvement to geographic expansion.
- 3.0–5.0: Solid competitive position. Regularly in or near the map pack. Small optimizations (reviews, category refinement) can push into dominant range.
- 5.0–7.0: Bubble position. The business ranks just outside the map pack (positions 4-7). This is the highest-leverage zone — small improvements in reviews, GBP completeness, or local citations can shift visibility into the top 3.
- 7.0–10.0: Visible but not dominant. Appearing in results but far from the map pack. Systematic optimization needed across multiple factors.
- 10.0–15.0: Weak visibility. Rarely near the map pack. Investigate GBP fundamentals: verification status, primary category accuracy, content completeness.
- 15.0+: Near invisible. The business barely appears, and when it does, at very low positions. Check for GBP issues (suspended, incorrect category, duplicate listings) before attempting optimization.

**When ARP matters most:** ARP is most useful when the business has good geographic coverage (high Found In) but poor positioning. It isolates the ranking quality question from the coverage question.

**When ARP is misleading:** A business with ARP 2.0 but Found In of 3 out of 49 grid points has excellent ranking quality in a tiny area — this is not a good result. Always pair ARP with Found In or ATRP.

## ATRP (Average Total Rank Position)

ATRP averages across ALL grid points, assigning position 21 to any grid point where the business does not appear. This makes it the most comprehensive single metric for overall visibility health.

**How ATRP relates to ARP:**
- ARP 4.0, ATRP 5.0: Strong and consistent — good rankings with broad coverage.
- ARP 3.0, ATRP 15.0: Great quality, terrible coverage — ranks well in a small zone but invisible elsewhere. Likely a proximity-limited storefront or a scan radius that extends beyond the business's competitive reach.
- ARP 12.0, ATRP 14.0: Weak but consistent — appears broadly at poor positions. May indicate category or relevance issues rather than proximity issues.

**When ATRP matters most:** ATRP is the best single metric for answering "how visible is this business overall?" Use it as the primary health indicator. Use ARP to drill into quality when ATRP reveals a problem.

## SoLV (Share of Local Voice)

SoLV measures the percentage of grid points where the business appears in the top 3 positions (the map pack). Maps only — Google Maps and Apple Maps.

**Why top 3 matters:** On Google Maps, the default local pack shows 3 results. Position 4+ requires the user to click "More places." The drop-off in visibility and clicks between position 3 and position 4 is dramatic.

**Interpretation context — SoLV depends heavily on the keyword:**
- Hypercompetitive keywords (e.g., "personal injury lawyer" in a major city): SoLV of 15-25% can represent strong performance. The market ceiling (Max SoLV) may be 30-40% because no single business dominates.
- Moderately competitive keywords (e.g., "dentist" in a suburb): SoLV of 40-60% is achievable and represents solid dominance.
- Low-competition keywords (e.g., "antique clock repair"): SoLV of 80%+ is expected for a well-optimized business. Below 50% suggests problems.

**Using SoLV with Opportunity SoLV:**
- If your SoLV is 20% and Max SoLV is 35%, the Opportunity SoLV is 15%. This means the market itself is fragmented — no one dominates. Strategy: incremental improvements across reviews, GBP content, and local citations.
- If your SoLV is 10% and Max SoLV is 70%, the Opportunity SoLV is 60%. A competitor dominates. Strategy: analyze what that competitor has (reviews, proximity, keyword-in-name) and determine which advantages are replicable.

**SoLV movement in trend reports:**
- Declining SoLV with stable ARP: Competitors are improving, not necessarily your business declining. Check competitor reports for new entrants or existing competitors gaining reviews.
- Improving SoLV with stable ARP: Geographic reach is expanding — the business is breaking into top-3 in grid areas where it previously ranked 4-7.
- Declining SoLV with declining ARP: Genuine ranking deterioration. Investigate GBP changes, review velocity drops, or algorithm updates.

## SAIV (Share of AI Visibility)

SAIV measures the percentage of AI-generated results that mention the business. AI platforms only.

**Key differences from SoLV:**
- SoLV measures positional ranking on a map grid. SAIV measures whether the business is mentioned at all in an AI response.
- SoLV is proximity-dominant. SAIV is authority-dominant — AI platforms cite businesses based on their presence on authoritative sources, not geographic proximity.
- SoLV is relatively stable scan-to-scan. SAIV can be volatile — the same query can produce different AI responses.

**Improving SAIV:**
SAIV responds to different optimization levers than SoLV:
- Get the business mentioned on authoritative review sites, directories, and publications
- Build structured data (schema markup) on the business website
- Generate mentions in local press and industry publications
- Ensure consistent NAP (name, address, phone) across the web
- GBP optimization helps but is less directly impactful than for maps

## Competition SoLV, Max SoLV, Opportunity SoLV

**Competition SoLV** counts unique competitors with ANY top-3 placement in the scan area. This measures market fragmentation:
- Competition SoLV of 3-5: A few businesses dominate. Hard to break in, but once established, position is defensible.
- Competition SoLV of 10-15: Moderately fragmented. Multiple businesses compete, with no single dominant player.
- Competition SoLV of 20+: Highly fragmented. Many businesses share top-3 positions, often driven by proximity (different businesses rank near their own locations).

**Max SoLV** is the ceiling. It represents what the best-performing business achieves. If Max SoLV is 35%, it means even the dominant player only holds top-3 in 35% of the grid — this is a fragmented market. If Max SoLV is 85%, one business dominates and the barrier to entry is high.

**Opportunity SoLV** = Max SoLV minus your SoLV. It quantifies realistic growth potential. But interpret with caution: some of that gap may be due to the competitor's proximity advantage or keyword-in-name advantage that cannot be replicated.

## SoLV Distance and Average SoLV Distance

**SoLV Distance** is the geographic distance from the business to individual grid points where it ranks top-3.

**Average SoLV Distance** averages all those distances. It measures how far the business's top-3 rankings extend geographically.

**Interpretation:**
- High Average SoLV Distance with high SoLV: The business dominates a large area. Strong overall position.
- High Average SoLV Distance with low SoLV: The business has isolated pockets of top-3 rankings far from its location, but doesn't dominate nearby. Common for SABs or businesses with strong reviews that overcome proximity disadvantage in specific zones.
- Low Average SoLV Distance with high SoLV: The business dominates its immediate area but doesn't extend far. Expected for storefronts with strong proximity signals.
- Central businesses tend to have uniform distance distributions. Peripheral businesses have uneven patterns. This is expected, not a problem.

## Found In

**Found In** counts the grid points where the business appears in results at any position (not just top 3).

**Pairing Found In with ATRP:**
- High Found In + low ATRP: Broad coverage at good positions. Healthy.
- High Found In + high ATRP: Appears everywhere at poor positions (e.g., position 15-20). The business is indexed but not competitive. Focus on ranking quality, not coverage.
- Low Found In + low ATRP: Limited coverage but ranks well where it appears. Proximity-limited. Expected for small-radius scans around storefronts.
- Low Found In + high ATRP: Barely appears, and poorly when it does. Fundamental issues — check GBP verification, categories, and potential listing problems.

## Total Competitors

**Total Competitors** counts unique businesses appearing anywhere in results across all grid points. This is NOT the same as Competition SoLV, which only counts top-3 businesses.

A market might have 50 total competitors but only 5-8 with meaningful SoLV. The other 42 appear in results but never crack the map pack. High total competitors without high Competition SoLV does not mean a difficult market — many may be poorly optimized.

## RVS (Review Volume Score)

RVS is a composite of review velocity and total review count. Both components must be strong for a high score.

**Review velocity** is the average reviews per month over the last 90 days. It measures recent review momentum.

**Common RVS patterns:**
- High velocity + high total: Strong review health. Maintain momentum.
- High velocity + low total: New or recently revived business. Velocity is good but the accumulated base is thin. Keep generating — the total will build.
- Low velocity + high total: Historical authority but stale momentum. This signals declining engagement. Urgent need to restart review generation.
- Low velocity + low total: Weak review profile. Requires a dedicated review generation campaign.

**Benchmarking RVS:** Always compare against direct competitors in the same market, not against abstract standards. A plumber with 45 reviews in a small town may have excellent RVS compared to local competitors, even though a chain restaurant in the same town has 500.

## RQS (Review Quality Score)

RQS combines rating distribution, owner response rate, and review recency into a quality composite.

**Key factors that drive RQS:**
- **Rating:** 4.5+ with substantial volume is ideal. A 5.0 from 3 reviews is less credible than 4.8 from 200 reviews. A single negative review on a 5.0 rating is more damaging to perception than one on a 4.8.
- **Response rate:** Responding to all reviews signals active engagement. Target 100% response rate on recent reviews. Personalized responses outperform generic templates.
- **Recency:** A review profile with no activity in the last 6 months signals decline regardless of total volume or rating. Recent reviews carry disproportionate weight.
- **Local Guide reviews:** Reviews from Google Local Guides may carry additional algorithmic weight.
- **Photo reviews:** Reviews with photos are perceived as more authentic by both algorithms and consumers.

## Guard Engagement Metrics

These metrics are available only for OAuth-connected Guard locations.

**Directions:** Count of customer requests for driving directions via GBP. Strongest indicator of in-person visit intent. Baseline varies by business type and location — city-center businesses naturally get fewer direction requests because customers already know where they are.

**Calls:** Count of customer clicks on the call button. Indicates high purchase intent and immediate need. Industry-dependent — emergency plumbers get more calls than bookstores.

**Website Clicks:** Count of clicks on the website URL. Indicates research-phase intent before conversion. E-commerce-heavy businesses see more website clicks; service providers see more calls.

**Interpreting engagement trends:** Compare against the business's own historical baseline, not cross-industry benchmarks. A 20% drop in calls month-over-month for a plumber during winter is expected; the same drop in summer requires investigation.

## Grid Size and Radius Effects

The scan configuration directly affects metric interpretation:

- **Tight radius (0.5-2 miles) with small grid (3x3, 5x5):** Good for dense urban storefronts. Metrics reflect immediate neighborhood competitiveness. SoLV values tend to be higher because the scan covers the business's natural proximity advantage zone.
- **Wide radius (5-15+ miles) with large grid (9x9+):** Appropriate for SABs and rural businesses. Metrics reflect broader market dynamics. SoLV values tend to be lower because the scan includes grid points far from the business where proximity advantage fades.
- **Comparing scans with different configurations is unreliable.** A SoLV of 60% on a 1-mile, 3x3 scan is not comparable to a SoLV of 20% on a 10-mile, 11x11 scan. Trend analysis requires identical scan settings.

**Grid density and granularity:** Larger grids (11x11, 13x13, 15x15) place more grid points in the scan area, providing finer geographic resolution. This can reveal micro-patterns (e.g., a single competitor dominating a 2-block radius) that smaller grids miss. However, the aggregate metrics (ARP, ATRP, SoLV) become more diluted with larger grids because more distant, low-ranking points pull the averages down. Keep this in mind when comparing reports with different grid sizes.

**Center point matters:** The scan center is not necessarily the market's commercial center. For storefronts, center on the business. For SABs, center on the customer concentration area. A scan centered on a suburban office park will produce different metrics than one centered on the residential neighborhoods 3 miles away, even with the same radius.

## Keyword Competitiveness Effects

The same business will show dramatically different metrics depending on the keyword:

- **Broad, high-intent keywords** ("plumber," "dentist," "restaurant"): Highly competitive. Multiple businesses optimize for these terms. Expect lower SoLV, higher Competition SoLV, and Max SoLV often below 40% due to market fragmentation.
- **Service-specific keywords** ("emergency water heater repair," "pediatric dentist"): Less competitive. Fewer businesses optimize specifically. Expect higher SoLV, lower Competition SoLV, and higher Max SoLV because fewer competitors divide the market.
- **Branded keywords** ("Joe's Plumbing"): The business should dominate its own brand. SoLV below 70% on a branded keyword indicates a serious issue — possible duplicate listings, a competitor with a confusingly similar name, or GBP category misalignment.
- **"Near me" variants:** Behave similarly to broad keywords but with stronger proximity weighting. These tend to produce tighter geographic clustering of good rankings around the business location.
- **Long-tail with modifiers** ("24 hour emergency plumber downtown"): Low competition, high intent. Excellent candidates for quick wins. If the business's GBP description and services match these modifiers, ranking improvements can be rapid.

**Multi-keyword interpretation:** A business that ranks poorly for "lawyer" but strongly for "estate planning attorney" is not underperforming — it is appropriately specialized. Recommend targeting specific keywords where the business has category alignment rather than fighting for ultra-competitive generic terms. Scan across 3-5 related keywords to build a complete picture of where the business is competitively positioned.

## Metric Interaction Patterns

Metrics do not exist in isolation. These common combinations reveal specific strategic situations:

- **High SoLV + low Competition SoLV:** The business dominates an uncontested market. Risk: new competitors can enter easily. Opportunity: expand to adjacent keywords while the market is uncrowded.
- **Low SoLV + high Competition SoLV:** A crowded market with many top-3 competitors. Strategy requires differentiation, not just optimization — find what makes this business unique and amplify those signals.
- **High Found In + high ATRP + low SoLV:** The business appears everywhere but at poor positions. It is indexed and geographically visible but lacks the authority signals (reviews, citations, category precision) to break into the top 3.
- **Low Found In + low ARP:** Excellent quality in a small zone. This is either a very tight scan radius around a strong storefront, or a business that ranks well only in its immediate proximity. Consider expanding the scan radius to see how far the rankings extend.
- **Declining SoLV + improving ARP:** Counterintuitive — the business is losing top-3 positions but ranking better where it still appears. This usually means a strong competitor entered and pushed the business to position 4 in some grid areas, but the business held or improved in its remaining top-3 zones.
- **High Opportunity SoLV + low ATRP:** Significant room to grow AND currently invisible. This is the highest-priority optimization target — there is both headroom and need.
- **High RVS + low RQS:** Getting many reviews but managing them poorly. Focus on response rate and quality of responses before generating more volume.
- **Low RVS + high RQS:** Well-managed but insufficient volume. The foundation is good — invest in review generation campaigns.
