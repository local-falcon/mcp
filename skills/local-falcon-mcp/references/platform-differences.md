# Platform Differences — Detailed Guide

This reference covers behavioral differences between each platform supported by Local Falcon. Use this when analyzing cross-platform performance or advising on platform-specific strategy.

## Google Maps (`google`)

**The primary platform for most businesses.** Google Maps local pack results drive the majority of local discovery traffic.

**Available metrics:** ARP, ATRP, SoLV, Competition SoLV, Max SoLV, Opportunity SoLV, SoLV Distance, Average SoLV Distance, Found In, Total Competitors, Distance from Data Point, Distance from Center Point, Reviews, Rating

**AI Analysis:** Available (opt-in toggle on scan). Provides a natural-language summary of geographic strengths, weaknesses, and competitive patterns. Costs additional credits.

**Ranking factors (in approximate order of influence):**
1. Proximity to the search point — the dominant factor. Businesses closer to each grid point have a structural advantage at that point.
2. GBP category relevance — primary category match to the search keyword is critical.
3. Review signals — volume, velocity, rating, recency, and keyword content in reviews.
4. GBP completeness — business description, services, attributes, photos, posts.
5. Website and citation authority — backlinks, consistent NAP across directories.
6. Behavioral signals — click-through rate, direction requests, calls from the listing.

**Key behavior:** Results change at every grid point because proximity shifts. A business that ranks #1 at grid points near its location may rank #15 at grid points 5 miles away. This is the fundamental insight of geo-grid tracking.

## Apple Maps (`apple`)

**Growing strategic importance** as Apple Maps usage increases through Siri, CarPlay, and default iOS app usage.

**Available metrics:** ARP, ATRP, SoLV, Competition SoLV, Max SoLV, Opportunity SoLV, SoLV Distance, Average SoLV Distance, Found In, Total Competitors, Distance from Data Point, Distance from Center Point

**Not available:** Reviews, Rating (Apple Maps does not surface these in the same way), AI Analysis

**Ranking factors:** Apple Maps uses its own ranking algorithm. Key differences from Google:
- Apple Maps relies on Apple Business Connect profiles (analogous to GBP)
- Yelp reviews have historically influenced Apple Maps rankings more than Google reviews
- Apple Maps data sources include TomTom, Yelp, and proprietary Apple data
- Proximity remains a strong factor, but the weighting differs from Google

**Strategic guidance:** Businesses targeting iOS-heavy demographics (affluent markets, younger users) should monitor Apple Maps. Ensure the Apple Business Connect profile is claimed and complete. Apple Maps optimization is less well-understood than Google Maps — use scan data to identify where the business ranks differently on Apple vs. Google.

## Google AI Overviews (`gaio`)

**AI-generated search results** that appear above or alongside traditional Google search results.

**Available metrics:** ARP, ATRP, SAIV, Found In, Total Competitors

**Not available:** SoLV (use SAIV instead), Competition SoLV, Max SoLV, Reviews, Rating

**Key behavior:** Google AI Overviews synthesize information from web sources to answer search queries. A business appears when Google's AI cites it as relevant. ARP and ATRP are pseudo-ranks derived from the order in which businesses are mentioned in the AI response, not traditional positional rankings.

**Ranking factors:**
- Being cited on authoritative source websites that Google's AI draws from
- Structured data (schema markup) on the business website
- Prominence signals — established businesses with broad web presence are more likely to be mentioned
- Relevance to the specific query intent

**Volatility:** AI Overviews can produce different results for the same query at different times. Expect more scan-to-scan variation than with Google Maps.

## Google AI Mode (`aimode`)

**Google's dedicated AI conversational search experience** — a separate interface from traditional search results.

**Available metrics:** ARP, ATRP, SAIV, Found In, Total Competitors

**Behavior:** Similar to AI Overviews but in a dedicated conversational context. The AI may provide more detailed responses and recommendations. Same pseudo-rank behavior as gaio — mention order, not positional ranking.

**Strategic notes:** AI Mode is newer and evolving rapidly. Monitor for trend data but avoid making major strategic changes based on volatile early results. Track SAIV over multiple scans to identify genuine patterns vs. noise.

## ChatGPT (`chatgpt`)

**OpenAI's conversational AI** — users ask ChatGPT for local recommendations.

**Available metrics:** ARP, ATRP, SAIV, Found In, Total Competitors

**Key behavior:** ChatGPT generates recommendations based on its training data and any real-time search capabilities. Results reflect a combination of the business's web presence at training time and current web data.

**Ranking factors:**
- Mentions on prominent review platforms (Yelp, TripAdvisor, Google, industry-specific sites)
- Coverage in local media, blogs, and publications
- Website authority and content quality
- Consistent NAP data across the web
- Unique differentiators that make the business notable or frequently recommended

**Training data consideration:** ChatGPT's knowledge has a training cutoff. Newer businesses or recent changes may not be reflected. Real-time search integration is evolving — results may combine trained knowledge with live web data.

## Gemini (`gemini`)

**Google's AI assistant** — integrated across Google ecosystem (Search, Android, Workspace).

**Available metrics:** ARP, ATRP, SAIV, Found In, Total Competitors

**Key behavior:** Gemini has native access to Google's data, potentially including Google Maps data, reviews, and business information. This may give Gemini's recommendations a different character from ChatGPT's.

**Strategic notes:** Because Gemini lives in the Google ecosystem, strong GBP optimization may have more influence on Gemini visibility than on other AI platforms. Monitor cross-platform — if a business has strong Google Maps rankings but weak Gemini SAIV, investigate whether GBP content is being effectively surfaced by Gemini.

## Grok (`grok`)

**X (Twitter)-associated AI** — integrated with the X platform ecosystem.

**Available metrics:** ARP, ATRP, SAIV, Found In, Total Competitors

**Key behavior:** Grok draws from X/Twitter data and web sources. Businesses with active social media presence on X may see different visibility patterns compared to other AI platforms.

**Strategic notes:** Grok is the most niche AI platform in the Local Falcon suite. Most relevant for businesses whose customer base overlaps with X's user demographic. Lower priority for most local businesses unless the user's audience is specifically active on X.

## Cross-Platform Strategy

### When to scan which platforms

- **All businesses:** Google Maps should be the primary platform. Scan regularly.
- **iOS-heavy markets:** Add Apple Maps scans to understand the full picture.
- **Forward-looking businesses:** Add 1-2 AI platform scans (gaio + chatgpt or gemini) to establish baselines for AI visibility before it becomes critical.
- **Comprehensive audits:** Scan across all relevant platforms to identify gaps — a business may dominate Google Maps but be invisible to ChatGPT users.

### Maps vs. AI optimization — different strategies

**For Maps (Google, Apple):** Optimize proximity signals (scan center point), GBP completeness, review volume and velocity, local citations, and category accuracy.

**For AI platforms:** Optimize citeability — get mentioned on authoritative sites, build structured data, generate local press coverage, maintain consistent NAP across the web, and create high-quality content that AI models are likely to reference.

**Cross-platform insight:** A business with strong SoLV on Google Maps but weak SAIV on AI platforms has traditional SEO strength but low AI authority. As AI search grows, this gap represents a future vulnerability. Conversely, a business with high SAIV but low SoLV has authority signals but needs GBP and proximity optimization.

### Comparing metrics across platforms

Do not directly compare SoLV values across platforms — the competitive dynamics, ranking algorithms, and result formats differ. Instead, compare relative position: is the business above or below its competitors on each platform? Platform-specific strengths and weaknesses reveal where to focus optimization efforts.
