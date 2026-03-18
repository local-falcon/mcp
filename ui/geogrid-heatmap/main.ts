import { App } from "@modelcontextprotocol/ext-apps";
import { marked } from "marked";

// Google Maps API key — injected at build time by Vite, never in source
declare const __GOOGLE_MAPS_API_KEY__: string;
const MAPS_API_KEY = __GOOGLE_MAPS_API_KEY__;

// ── Types ────────────────────────────────────────────────────────────────────

interface ScanReport {
  report_key: string;
  date?: string;
  keyword?: string;
  place_id?: string;
  ai_place_id?: string; // AI scans: the AI platform's identifier for the target business
  platform?: string;
  lat?: number;
  lng?: number;
  grid_size?: number | string;
  radius?: number | string;
  measurement?: string;
  arp?: number;
  atrp?: number;
  solv?: number;
  saiv?: number;
  found_in?: number;
  total_competitors?: number;
  competition_solv?: number;
  max_solv?: number;
  opportunity_solv?: number;
  location?: { name?: string; address?: string };
  image?: string;
  heatmap?: string;
}

interface DataPoint {
  lat: number | string;   // API returns strings
  lng: number | string;   // API returns strings
  rank?: number | false;  // Target business rank at this point (false = not found)
  found?: boolean;        // Whether target business was found at this point
  has_ai?: boolean;       // AI scans: whether AI overview was triggered at this point
  has_results?: boolean;  // Whether any results exist at this point
  count?: number;         // Number of results at this point
  results?: Array<{
    rank: number;
    place_id: string;
    name?: string;
    address?: string;
    lat?: number | string;
    lng?: number | string;
    rating?: number;
    reviews?: number;
    store_code?: string;
    categories?: string[] | Record<string, string>;
    phone?: string;
    url?: string;
    display_url?: string;
    claimed?: boolean;
    distance_from_center?: string;
    distance_from_point?: string;
  }>;
  scrape?: string | false; // v1 API flattens scrape to text string, or false
  sources?: Array<{ title?: string | false; subtitle?: string | false; link?: string | false }>;
}

interface PlaceInfo {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  rating_pct?: number | string;
  reviews?: number;
  phone?: string;
  url?: string;
  categories?: string[] | Record<string, string>;
}

interface GridData {
  data_points?: DataPoint[];
  places?: Record<string, PlaceInfo>;
  sources?: Array<{ href?: string; title?: string; source?: string; index?: number }>;
  version?: number;
  place_id?: string;     // Google Maps place ID of target business
  ai_place_id?: string;  // AI platform hash ID of target business (matches results[].place_id for AI scans)
}

// ── Production Rank Colors (LF scan-reports.css exact values) ────────────────
// 9-color gradient: dark green (rank 1) → yellow (rank 5) → dark red (rank 9)

const RANK_COLORS: Record<number, string> = {
  1: "#1A6600",
  2: "#59810A",
  3: "#969C15",
  4: "#CBB21D",
  5: "#FFC826",
  6: "#EF9E1E",
  7: "#DD7015",
  8: "#CC430D",
  9: "#BA1604",
};

const NOT_FOUND_COLOR = "#9ca3af";

function getRankColor(rank: number | undefined): string {
  if (!rank || rank <= 0) return NOT_FOUND_COLOR;
  if (rank <= 9) return RANK_COLORS[rank];
  // Ranks 10+ use rank 9 color (darkest red) — matches production
  return RANK_COLORS[9];
}

// ── Scrape Rendering (cascading fallback matching ScanExplorer_v2) ───────────

function renderScrape(scrape: any): string {
  if (!scrape || scrape === false) {
    return '<div class="ai-no-response">No AI response at this coordinate</div>';
  }

  let content = "";

  // v1 API returns scrape as a plain text string (flattened from the raw scrape object)
  // May contain HTML with images (maps, screenshots from AI platforms) — allow img tags through
  if (typeof scrape === "string") {
    if (scrape.includes("<img") || scrape.includes("<div") || scrape.includes("<p")) {
      // HTML from API — sanitize against allowlist before rendering
      content = sanitizeHtml(scrape);
    } else if (scrape.includes("#") || scrape.includes("- ") || scrape.includes("[")) {
      content = sanitizeHtml(marked.parse(scrape) as string);
    } else {
      content = `<p>${escapeHtml(scrape)}</p>`;
    }
  }
  // v2/raw format — object with structured fields
  else if (typeof scrape === "object") {
    if (scrape.raw_texts) {
      content = sanitizeHtml(scrape.raw_texts);
    } else if (scrape.original?.answer_text_markdown || scrape.answer_text_markdown) {
      const md = scrape.original?.answer_text_markdown || scrape.answer_text_markdown;
      content = sanitizeHtml(marked.parse(md) as string);
    } else if (typeof scrape.texts === "object" && Array.isArray(scrape.texts)) {
      content = renderStructuredTexts(scrape.texts);
    } else if (typeof scrape.text_blocks === "object" && Array.isArray(scrape.text_blocks)) {
      content = renderStructuredTexts(scrape.text_blocks);
    } else {
      content = '<div class="ai-no-response">AI response format not recognized</div>';
    }

    if (scrape.references && Array.isArray(scrape.references) && scrape.references.length > 0) {
      content += renderReferences(scrape.references);
    }
  } else {
    content = '<div class="ai-no-response">AI response format not recognized</div>';
  }

  return `<div class="ai-response">${content}</div>`;
}

function renderStructuredTexts(items: any[]): string {
  let html = "";
  for (const item of items) {
    if (item.type === "paragraph" && item.snippet) {
      html += `<p>${item.snippet}</p>`;
    } else if (item.type === "list" && Array.isArray(item.list)) {
      html += renderNestedList(item.list);
    }
  }
  return html;
}

function renderNestedList(items: any[]): string {
  let html = "<ul>";
  for (const item of items) {
    if (typeof item === "string") {
      html += `<li>${item}</li>`;
    } else if (typeof item === "object" && item.snippet) {
      html += `<li>${item.snippet}`;
      if (Array.isArray(item.list)) {
        html += renderNestedList(item.list);
      }
      html += "</li>";
    }
  }
  html += "</ul>";
  return html;
}

function renderReferences(refs: any[]): string {
  let html = '<div class="sources-section"><h4>Sources</h4>';
  for (const ref of refs) {
    if (ref.href) {
      const title = ref.title || ref.source || ref.href;
      const domain = ref.source || "";
      html += `<a class="source-link" href="${escapeHtml(ref.href)}" target="_blank" rel="noopener">`;
      html += escapeHtml(title);
      if (domain) html += ` <span class="source-domain">${escapeHtml(domain)}</span>`;
      html += "</a>";
    }
  }
  html += "</div>";
  return html;
}

// Source Information list for AI scans (matches production layout)
function renderSourceList(sources: any[]): string {
  let html = '<div class="source-list">';
  for (const ref of sources) {
    const href = ref.href || ref.link;
    if (!href) continue;
    const title = ref.title || ref.source || href;
    const domain = ref.source || "";
    html += `<div class="source-item">`;
    html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(title))}</a>`;
    if (domain) html += `<div class="source-domain">${escapeHtml(String(domain))}</div>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── HTML Sanitizer (allowlist-based, DOM-native) ─────────────────────────────
// Strips all tags/attributes not explicitly allowed. Enforces image domain allowlist.
// Built from S3 audit of 7,345 scrape payloads across 5 AI platforms.

const ALLOWED_TAGS = new Set([
  "a", "blockquote", "br", "code", "del", "em",
  "h1", "h2", "h3", "h4", "hr", "img", "li", "ol",
  "p", "pre", "strong", "table", "tbody", "td", "th",
  "thead", "tr", "ul",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["src", "alt"]),
  ol: new Set(["start"]),
  code: new Set(["class"]),
  td: new Set(["style"]),
  th: new Set(["style"]),
};

// Domains allowed in <img src>. Wildcards match any subdomain.
const IMG_DOMAIN_WILDCARDS = [
  ".gstatic.com",
  ".googleapis.com",
  ".googleusercontent.com",
  ".google.com",
  ".amazonaws.com",
];
const IMG_DOMAIN_EXACT = new Set([
  "images.openai.com",
  "fastly.4sqi.net",
]);

function isAllowedImgDomain(src: string): boolean {
  try {
    const hostname = new URL(src).hostname.toLowerCase();
    if (IMG_DOMAIN_EXACT.has(hostname)) return true;
    for (const suffix of IMG_DOMAIN_WILDCARDS) {
      if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) return true;
    }
    return false;
  } catch {
    return false; // malformed URL — strip it
  }
}

const STYLE_TEXT_ALIGN_RE = /^text-align:\s*(left|center|right|justify);?$/i;

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeNode(doc.body);
  return doc.body.innerHTML;
}

function sanitizeNode(node: Node): void {
  // Walk children in reverse so removals don't shift indices
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Replace disallowed tag with its text content
        const text = document.createTextNode(el.textContent || "");
        node.replaceChild(text, el);
        continue;
      }

      // Strip disallowed attributes
      const allowedSet = ALLOWED_ATTRS[tag];
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (!allowedSet || !allowedSet.has(name)) {
          el.removeAttribute(attr.name);
          continue;
        }
        // style: only allow text-align values
        if (name === "style" && !STYLE_TEXT_ALIGN_RE.test(attr.value.trim())) {
          el.removeAttribute(attr.name);
          continue;
        }
      }

      // <img>: enforce domain allowlist
      if (tag === "img") {
        const src = el.getAttribute("src") || "";
        if (!src || !isAllowedImgDomain(src)) {
          node.removeChild(el);
          continue;
        }
      }

      // <a>: force safe link behavior
      if (tag === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }

      // Recurse into allowed element's children
      sanitizeNode(el);
    }
    // Text nodes and comment nodes are fine as-is (comments are harmless in innerHTML)
  }
}

// ── Google Maps Loading ──────────────────────────────────────────────────────

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps API"));
    document.head.appendChild(script);
  });
}

// ── Pin SVG Creation (matches LF production pin style) ──────────────────────
// Production uses pre-made SVG/PNG icons per rank (colored circles).
// The rank number is rendered by Google Maps marker label, NOT baked into the icon.
// We create equivalent inline SVGs — circle with border + subtle shadow.

function createPinSvg(color: string): string {
  // Simple colored circle with subtle dark border — matches production grid-result icons
  // No SVG filters (can cause rendering issues in data URI markers)
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<circle cx="20" cy="20" r="18" fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="1.5"/>` +
    `</svg>`
  )}`;
}

// "No AI Results" prohibited pin — light pink circle with 🚫 symbol
// Used for AI scans where no AI overview was triggered at this coordinate
const NO_RESULTS_PIN_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
  `<circle cx="20" cy="20" r="18" fill="#f0c0c0" stroke="rgba(180,60,60,0.35)" stroke-width="1.5"/>` +
  `<circle cx="20" cy="20" r="12" fill="none" stroke="rgba(180,60,60,0.5)" stroke-width="2"/>` +
  `<line x1="11.5" y1="11.5" x2="28.5" y2="28.5" stroke="rgba(180,60,60,0.5)" stroke-width="2"/>` +
  `</svg>`
)}`;

// ── Star Rating HTML (matches LF production CSS-overlay approach) ────────────

function renderStarRating(rating: number | string | undefined, reviews: number | string | undefined): string {
  const r = Number(rating);
  if (!r || isNaN(r)) return "";
  const ratingPct = ((r / 5) * 100).toFixed(0) + "%";
  const stars = "★★★★★";
  const rev = Number(reviews);
  const reviewsStr = rev ? `(${numberFormat(rev)})` : "";
  return `<div class="rating">
    <span class="score">${r.toFixed(1)}</span>
    <span class="stars">${stars}<span class="stars-inner" style="width:${ratingPct}">${stars}</span></span>
    <span class="reviews">${reviewsStr}</span>
  </div>`;
}

function numberFormat(n: number): string {
  return n.toLocaleString();
}

// ── Categories rendering ─────────────────────────────────────────────────────

function renderCategories(categories: string[] | Record<string, string> | undefined): string {
  if (!categories) return "";
  let cats: string[];
  if (Array.isArray(categories)) {
    cats = categories;
  } else if (typeof categories === "object") {
    cats = Object.values(categories);
  } else {
    return "";
  }
  if (cats.length === 0) return "";

  const first = escapeHtml(cats[0]);
  const moreCount = cats.length - 1;
  const allCats = cats.map(c => escapeHtml(c)).join(", ");
  // unique id per listing to toggle
  const id = "cats-" + Math.random().toString(36).slice(2, 8);
  let html = `<div class="categories"><span class="cat-icon">&#9901;</span> `;
  html += `<span class="cat-first" id="${id}-first">${first}`;
  if (moreCount > 0) {
    html += ` <span class="more-cats" onclick="document.getElementById('${id}-first').style.display='none';document.getElementById('${id}-all').style.display='inline';">+${moreCount} more</span>`;
  }
  html += `</span>`;
  if (moreCount > 0) {
    html += `<span class="cat-all" id="${id}-all" style="display:none">${allCats}</span>`;
  }
  html += `</div>`;
  return html;
}

// ── Business Listing HTML (matches LF production google_listing()) ───────────

function renderBusinessListing(
  place: PlaceInfo & { place_id?: string },
  rank: number | undefined,
  isHighlighted: boolean,
  categories?: string[] | Record<string, string>,
  useRankColors?: boolean // AI scans use gradient colors on rank badges, traditional uses blue
): string {
  const classes = ["google_location"];
  if (rank) classes.push("ranked");
  if (isHighlighted) classes.push("highlighted");

  let html = `<div class="${classes.join(" ")}">`;

  if (rank) {
    // AI scans: rank badge uses the same gradient color as map pins
    // Traditional scans: rank badge is always blue (#4B88FF)
    const badgeStyle = useRankColors ? ` style="background-color:${getRankColor(rank)}"` : "";
    html += `<div class="rank_container"><div class="rank"${badgeStyle}>${rank}</div></div>`;
  }

  html += `<div class="details">`;
  html += `<div class="name">${escapeHtml(place.name || "Unknown")}</div>`;
  if (place.address) {
    html += `<div class="address">${escapeHtml(place.address)}</div>`;
  }
  html += renderStarRating(place.rating, place.reviews);
  // Use place-level categories, fall back to result-level
  const cats = place.categories || categories;
  html += renderCategories(cats);
  html += `</div></div>`;
  return html;
}

// ── _meta: null Workaround ───────────────────────────────────────────────────
// ChatGPT's MCP bridge returns _meta: null in resources/read responses, but the
// MCP SDK's Zod schema requires _meta to be an object. Patch incoming postMessage
// events to replace null _meta with {} before the SDK validates them.
function patchNullMeta(obj: any, depth = 0): void {
  if (!obj || typeof obj !== "object" || depth > 10) return;
  if (Array.isArray(obj)) { for (const item of obj) patchNullMeta(item, depth + 1); return; }
  for (const key of Object.keys(obj)) {
    if (key === "_meta" && obj[key] === null) { obj[key] = {}; }
    else if (typeof obj[key] === "object" && obj[key] !== null) { patchNullMeta(obj[key], depth + 1); }
  }
}
const _origAddEventListener = window.addEventListener.bind(window);
window.addEventListener = function(type: string, listener: any, options?: any) {
  if (type === "message") {
    const patchedListener = function(event: MessageEvent) {
      if (event.data) patchNullMeta(event.data);
      return listener.call(this, event);
    };
    return _origAddEventListener(type, patchedListener, options);
  }
  return _origAddEventListener(type, listener, options);
} as typeof window.addEventListener;

// ── Main App ─────────────────────────────────────────────────────────────────

const app = new App({ name: "geogrid-heatmap", version: "1.0.0" });

const loadingEl = document.getElementById("loading")!;
const metricsPanelEl = document.getElementById("metrics-panel")!;
const mapContainerEl = document.getElementById("map-container")!;
const detailPanelEl = document.getElementById("detail-panel")!;

let scanReport: ScanReport | null = null;
let gridData: GridData | null = null;
let map: google.maps.Map | null = null;
let isDark = false;

// Track outside-click handler + just-opened flag to prevent stale handlers
let currentOutsideClickHandler: ((e: MouseEvent) => void) | null = null;
let detailJustOpened = false;

// ── Detail Panel Link Handler (one-time init) ────────────────────────────────
// The claude.ai iframe sandbox blocks <a> navigation AND window.open().
// Intercept all anchor clicks: prevent the iframe-blocking navigation, then
// try every available method to get the URL to the user.
function showLinkBox(href: string) {
  document.getElementById("lf-link-box")?.remove();
  const box = document.createElement("div");
  box.id = "lf-link-box";
  box.style.cssText =
    "position:sticky;bottom:0;left:0;right:0;background:#f8f9fa;" +
    "border-top:1px solid #e0e0e0;padding:8px 12px;z-index:100;";
  box.innerHTML =
    `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">` +
    `Right-click link to open · or copy URL below:</div>` +
    `<input id="lf-link-input" type="text" readonly value="${href.replace(/"/g, "&quot;")}" ` +
    `style="width:100%;font-size:11px;border:1px solid #d1d5db;border-radius:3px;` +
    `padding:4px 6px;background:#fff;box-sizing:border-box;cursor:text;">`;
  detailPanelEl.appendChild(box);
  const input = box.querySelector<HTMLInputElement>("#lf-link-input");
  if (input) {
    input.focus();
    input.select();
    // Try execCommand copy (better iframe compat than clipboard API)
    try { document.execCommand("copy"); } catch (_) {}
  }
}

detailPanelEl.addEventListener("click", (e: MouseEvent) => {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;
  // Allow clicks on the link box input itself
  if ((e.target as HTMLElement).id === "lf-link-input") return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;

  e.preventDefault();
  e.stopPropagation();

  // Try window.open() — works if sandbox has allow-popups
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (opened) return;

  // Try navigator.clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(href)
      .then(() => {
        const toast = document.createElement("div");
        toast.textContent = "Link copied to clipboard";
        toast.style.cssText =
          "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
          "background:#333;color:#fff;padding:8px 16px;border-radius:4px;" +
          "font-size:13px;z-index:9999;pointer-events:none;";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
      })
      .catch(() => showLinkBox(href));
    return;
  }

  // Final fallback: show copyable URL box in the panel
  showLinkBox(href);
});

// ── Theme Handling ───────────────────────────────────────────────────────────

function applyTheme(dark: boolean) {
  isDark = dark;
  document.documentElement.classList.toggle("dark", dark);
  if (map) {
    map.setOptions({
      styles: dark
        ? [
            { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#8b95a5" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3e6b" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a3a" }] },
          ]
        : [
            { elementType: "geometry", stylers: [{ lightness: 50 }] },
            { elementType: "labels", stylers: [{ lightness: 50 }] },
            { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          ],
    });
  }
}

app.onhostcontextchanged = (ctx: any) => {
  if (ctx?.theme === "dark" || ctx?.colorScheme === "dark") {
    applyTheme(true);
  } else {
    applyTheme(false);
  }
};

// ── Metrics Panel ────────────────────────────────────────────────────────────

function renderMetrics(report: ScanReport) {
  const items: Array<[string, string]> = [];
  if (report.keyword) items.push(["Keyword", report.keyword]);
  if (report.location?.name) items.push(["Business", report.location.name]);
  if (report.grid_size) items.push(["Grid", `${report.grid_size} x ${report.grid_size}`]);
  if (report.radius) items.push(["Radius", `${report.radius} ${report.measurement || "mi"}`]);
  if (report.platform) items.push(["Platform", report.platform]);
  if (report.solv != null) items.push(["SoLV", `${report.solv}%`]);
  if (report.arp != null) items.push(["ARP", String(report.arp)]);
  if (report.atrp != null) items.push(["ATRP", String(report.atrp)]);
  if (report.saiv != null) items.push(["SAIV", `${report.saiv}%`]);
  if (report.date) items.push(["Date", report.date]);

  metricsPanelEl.innerHTML = items
    .map(([label, value]) => `<div class="metric"><span class="metric-label">${label}:</span> <span class="metric-value">${escapeHtml(value)}</span></div>`)
    .join("");
}

// ── Detail Panel (matches LF production scan_explorer_results modal) ─────────

function showDetailPanel(point: DataPoint, report: ScanReport) {
  const places = gridData?.places || {};
  const isAI = isAIPlatform(report.platform);
  const targetRank = getTargetRank(point, report);
  const lat = Number(point.lat);
  const lng = Number(point.lng);

  // Header — matches production: "Results for "keyword""
  let html = `
    <div class="detail-header">
      <div class="detail-keyword">Results for "<b>${escapeHtml(report.keyword || "")}</b>"</div>
      <div class="detail-coord">
        <span class="pin-icon">&#x1F4CD;</span>
        ${Number(lat).toFixed(7)}, ${Number(lng).toFixed(7)}
      </div>
      <button class="detail-close" id="close-detail">&times;</button>
    </div>
  `;

  if (isAI) {
    // AI platform detail panel — matches production layout:
    // "What We Found" → AI response content
    // "Brand Rankings" → ranked businesses
    // "Source Information" → reference links
    html += `<div class="ai-detail-section">`;
    html += `<h3 class="ai-section-heading">What We Found</h3>`;
    html += renderScrape(point.scrape);
    html += `<div style="text-align:center;"><button class="ai-response-toggle" id="toggle-scrape">+ See More</button></div>`;
    html += `</div>`;

    if (point.results && point.results.length > 0) {
      html += `<h3 class="ai-section-heading">Brand Positions</h3>`;
      for (const result of point.results.slice(0, 20)) {
        const place = places[result.place_id] || {};
        html += renderBusinessListing(
          { ...place, place_id: result.place_id, name: place.name || result.name || "Unknown" },
          result.rank,
          isTargetBusiness(result, report),
          result.categories
        );
      }
    }

    // Source Information — per-point sources first, global fallback
    const sources = (point.sources && Array.isArray(point.sources) && point.sources.length > 0)
      ? point.sources.map(s => ({
          href: s.link || undefined,
          title: s.title || undefined,
          source: s.subtitle || undefined,
        }))
      : (gridData?.sources && gridData.sources.length > 0)
        ? gridData.sources
        : null;

    if (sources) {
      html += `<div class="ai-detail-section">`;
      html += `<h3 class="ai-section-heading">Source Information</h3>`;
      html += renderSourceList(sources);
      html += `</div>`;
    }
  } else {
    // Traditional (Google/Apple Maps) — business listings directly
    if (point.results && point.results.length > 0) {
      for (const result of point.results.slice(0, 20)) {
        const place = places[result.place_id] || {};
        html += renderBusinessListing(
          { ...place, place_id: result.place_id },
          result.rank,
          isTargetBusiness(result, report),
          result.categories
        );
      }
    }
  }

  // Remove any stale outside-click handler before showing (prevents double-close on re-open)
  if (currentOutsideClickHandler) {
    document.removeEventListener("click", currentOutsideClickHandler);
    currentOutsideClickHandler = null;
  }

  detailPanelEl.innerHTML = html;
  detailPanelEl.classList.remove("hidden");

  // Mark as just-opened — suppresses the triggering click from immediately closing the panel
  detailJustOpened = true;
  setTimeout(() => { detailJustOpened = false; }, 150);

  document.getElementById("close-detail")?.addEventListener("click", (e) => {
    e.stopPropagation();
    detailPanelEl.classList.add("hidden");
    if (currentOutsideClickHandler) {
      document.removeEventListener("click", currentOutsideClickHandler);
      currentOutsideClickHandler = null;
    }
  });

  // Click outside to close — added after the 150ms just-opened window
  currentOutsideClickHandler = (e: MouseEvent) => {
    if (detailJustOpened) return;
    if (!detailPanelEl.contains(e.target as Node)) {
      detailPanelEl.classList.add("hidden");
      document.removeEventListener("click", currentOutsideClickHandler!);
      currentOutsideClickHandler = null;
    }
  };
  setTimeout(() => {
    if (currentOutsideClickHandler) {
      document.addEventListener("click", currentOutsideClickHandler);
    }
  }, 150);

  // "+ See More" toggle for AI response content
  const toggleBtn = document.getElementById("toggle-scrape");
  const aiResponse = detailPanelEl.querySelector(".ai-response") as HTMLElement | null;
  if (toggleBtn && aiResponse) {
    toggleBtn.addEventListener("click", () => {
      const expanded = aiResponse.classList.toggle("expanded");
      toggleBtn.textContent = expanded ? "- See Less" : "+ See More";
    });
  }
}

// Resolve the target business rank at a data point.
// For traditional scans, point.rank is set directly by the API.
// For AI scans, the API rank comparison uses file.place_id (Google Maps ID) against
// results[].place_id (AI platform hash) — they never match, so point.rank is always false.
// The correct identifier for AI scans is report.ai_place_id (= file.ai_place_id = the hash).
// Resolve the canonical target business ID.
// gridData always has place_id/ai_place_id (fetched by resource handler).
// report fields may be missing depending on what fieldmask Claude used.
function getTargetId(report: ScanReport): { googleId?: string; aiId?: string } {
  return {
    googleId: gridData?.place_id || report.place_id,
    aiId: gridData?.ai_place_id || report.ai_place_id,
  };
}

function getTargetRank(point: DataPoint, report: ScanReport): number | undefined {
  if (!point.results) return undefined;

  const fromPoint = Number(point.rank) > 0 ? Number(point.rank) : undefined;
  if (fromPoint) return fromPoint;

  const { googleId, aiId } = getTargetId(report);
  // AI scans: aiId is the hash that matches results[].place_id
  // Traditional scans: aiId is undefined, use googleId
  const targetId = aiId || googleId;
  if (!targetId) return undefined;

  const match = point.results.find(r => r.place_id === targetId);
  return match ? (Number(match.rank) > 0 ? Number(match.rank) : undefined) : undefined;
}

// Check if a result entry is the target business (for detail panel highlighting)
function isTargetBusiness(result: { place_id: string }, report: ScanReport): boolean {
  const { googleId, aiId } = getTargetId(report);
  if (googleId && result.place_id === googleId) return true;
  if (aiId && result.place_id === aiId) return true;
  return false;
}

function isAIPlatform(platform?: string): boolean {
  // Normalize: lowercase + strip underscores/dashes to handle any API casing variation
  const p = (platform || "").toLowerCase().replace(/[_\-]/g, "");
  return ["chatgpt", "gemini", "grok", "gaio", "aimode"].includes(p);
}

// ── Map Rendering ────────────────────────────────────────────────────────────

async function renderMap(report: ScanReport, data: GridData) {
  await loadGoogleMaps();

  const points = data.data_points || [];

  // Resolve center
  let centerLat = Number(report.lat) || Number((report.location as any)?.lat) || 0;
  let centerLng = Number(report.lng) || Number((report.location as any)?.lng) || 0;
  if ((centerLat === 0 && centerLng === 0) && points.length > 0) {
    centerLat = points.reduce((s, p) => s + Number(p.lat), 0) / points.length;
    centerLng = points.reduce((s, p) => s + Number(p.lng), 0) / points.length;
  }

  console.log("[geogrid] center:", centerLat, centerLng, "points:", points.length);

  // Light, washed-out map style (matches LF production styled_map_high)
  const lightStyle: google.maps.MapTypeStyle[] = [
    { elementType: "geometry", stylers: [{ lightness: 50 }] },
    { elementType: "labels", stylers: [{ lightness: 50 }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  ];

  map = new google.maps.Map(mapContainerEl, {
    center: { lat: centerLat, lng: centerLng },
    zoom: 12,
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy", // Scroll to zoom, drag to pan — no ctrl required
    clickableIcons: false, // Don't let POI icons capture clicks
    styles: isDark ? [] : lightStyle,
  });

  if (isDark) {
    applyTheme(true);
  }

  // Pre-generate pin SVGs for each rank color (avoids re-encoding per marker)
  const pinCache: Record<string, string> = {};
  function getPinSvg(color: string): string {
    if (!pinCache[color]) pinCache[color] = createPinSvg(color);
    return pinCache[color];
  }

  const isAI = isAIPlatform(report.platform);
  const bounds = new google.maps.LatLngBounds();

  // Track clickable points for map-level click handling
  // (marker.addListener doesn't work in claude.ai's iframe sandbox)
  interface ClickablePoint {
    lat: number;
    lng: number;
    point: DataPoint;
    clickable: boolean;
  }
  const clickablePoints: ClickablePoint[] = [];

  for (const point of points) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (isNaN(lat) || isNaN(lng)) continue;

    const targetRank = getTargetRank(point, report);

    // AI scans: check has_ai to distinguish "no AI results" from "AI results but not found"
    const hasAI = point.has_ai !== false; // default true if field missing (traditional scans)
    const isNoAIResults = isAI && !hasAI;

    // Determine pin icon, label, and title — matches production build_markers()
    let pinUrl: string;
    let labelText: string;
    let title: string;
    let isClickable: boolean;

    if (isNoAIResults) {
      pinUrl = NO_RESULTS_PIN_SVG;
      labelText = " ";
      title = "Search Returned No AI Results";
      isClickable = false;
    } else if (isAI) {
      if (!targetRank) {
        pinUrl = getPinSvg(RANK_COLORS[9]);
        labelText = " ";
        title = "Your Business Not Found";
        isClickable = true;
      } else {
        pinUrl = getPinSvg(getRankColor(targetRank));
        labelText = String(targetRank);
        title = `Brand Position: ${targetRank}`;
        isClickable = true;
      }
    } else {
      if (!targetRank || targetRank >= 20) {
        pinUrl = getPinSvg(RANK_COLORS[9]);
        labelText = "20+";
        title = targetRank ? `Your Rank: ${targetRank}` : "Your Business Not Found";
        isClickable = true;
      } else {
        pinUrl = getPinSvg(getRankColor(targetRank));
        labelText = String(targetRank);
        title = `Your Rank: ${targetRank}`;
        isClickable = true;
      }
    }

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map,
      icon: {
        url: pinUrl,
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 20),
      },
      label: {
        text: labelText || " ",
        color: labelText.trim() ? "#ffffff" : "transparent",
        fontWeight: "bold",
        fontSize: labelText.length > 2 ? "10px" : "14px",
        fontFamily: "Arial, sans-serif",
      },
      title,
    });

    bounds.extend(new google.maps.LatLng(lat, lng));
    clickablePoints.push({ lat, lng, point, clickable: isClickable });

    // Marker-level click handler (works in most environments)
    if (isClickable) {
      marker.addListener("click", async () => {
        try {
          showDetailPanel(point, report);
        } catch (err: any) {
          console.error("[geogrid] marker click error:", err);
          loadingEl.textContent = `Click error: ${err.message}`;
          loadingEl.classList.remove("hidden");
        }
      });
    }
  }

  // ── Map-level click handler ──────────────────────────────────────────────
  // Google Maps marker.addListener("click") doesn't fire inside claude.ai's
  // iframe sandbox. Instead, we listen for clicks on the map itself and find
  // the nearest data point within a pixel-distance threshold.
  map.addListener("click", (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const clickLat = e.latLng.lat();
    const clickLng = e.latLng.lng();

    // Find the closest data point
    let closest: ClickablePoint | null = null;
    let closestDist = Infinity;
    for (const cp of clickablePoints) {
      const dLat = cp.lat - clickLat;
      const dLng = cp.lng - clickLng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < closestDist) {
        closestDist = dist;
        closest = cp;
      }
    }

    if (!closest || !closest.clickable) return;

    // Check if click is close enough (within ~25px at current zoom)
    const projection = map!.getProjection();
    if (!projection) return;
    const clickPx = projection.fromLatLngToPoint(e.latLng);
    const pointPx = projection.fromLatLngToPoint(new google.maps.LatLng(closest.lat, closest.lng));
    if (!clickPx || !pointPx) return;
    const zoom = map!.getZoom() || 12;
    const scale = Math.pow(2, zoom);
    const pxDist = Math.sqrt(
      Math.pow((clickPx.x - pointPx.x) * scale, 2) +
      Math.pow((clickPx.y - pointPx.y) * scale, 2)
    );
    if (pxDist > 25) return; // Too far from any pin

    try {
      showDetailPanel(closest.point, report);
    } catch (err: any) {
      console.error("[geogrid] map click error:", err);
      loadingEl.textContent = `Click error: ${err.message}`;
      loadingEl.classList.remove("hidden");
    }

    const topBusiness = closest.point.results?.[0]?.place_id
      ? (data.places?.[closest.point.results[0].place_id]?.name || closest.point.results[0].place_id)
      : "none";
    const targetRank = (typeof closest.point.rank === "number" && closest.point.rank > 0) ? closest.point.rank : undefined;
    app.updateModelContext({
      content: [{
        type: "text",
        text: `User clicked geo-grid pin at (${closest.lat}, ${closest.lng}) — Rank ${targetRank || "not found"} for "${report.keyword}" on ${report.platform}. Top result: ${topBusiness}.`,
      }],
    }).catch(() => {});
  });

  // Fit bounds — matches production: plain fitBounds, no padding, no zoom hacks.
  // The square container is the key — Google Maps auto-zoom works perfectly
  // when container shape matches the grid shape.
  if (points.length > 0) {
    map.fitBounds(bounds);
  }

  // "X.XX MILES BETWEEN MAP PINS" banner — matches production bottom bar
  const mapWrapper = document.getElementById("map-wrapper");
  const gridSize = Number(report.grid_size) || 0;
  const radius = Number(report.radius) || 0;
  const measurement = report.measurement || "mi";
  if (gridSize > 1 && radius > 0 && mapWrapper) {
    const distBetween = (2 * radius) / (gridSize - 1);
    const unit = measurement === "km" ? "KILOMETERS" : "MILES";
    const banner = document.createElement("div");
    banner.className = "distance-banner";
    banner.textContent = `${distBetween.toFixed(2)} ${unit} BETWEEN MAP PINS`;
    mapWrapper.appendChild(banner);
  }
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.ontoolresult = async (result: any) => {
  try {
    let reportData: any;

    // STRATEGY: Try structuredContent first (ChatGPT's clean single-encoded path),
    // then content[] array (Claude/ChatGPT double-encoded), then fallbacks.
    // This order avoids the double-encoding problem entirely when structuredContent exists.

    // Tier 0: ChatGPT structuredContent.text — clean single-encoded JSON (preferred)
    if (typeof result?.structuredContent?.text === "string") {
      try {
        reportData = JSON.parse(result.structuredContent.text);
        console.log("[geogrid] Parsed via structuredContent.text");
      } catch { /* fall through */ }
    }

    // Tier 1: MCP content blocks array (Claude's standard path)
    if (!reportData) {
      const content = result?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text" && block.text) {
            try { reportData = JSON.parse(block.text); console.log("[geogrid] Parsed via content[].text"); } catch { reportData = block.text; }
            break;
          }
        }
      }
    }

    // Tier 2: Simple { text: "json string" } wrapper
    if (!reportData && typeof result?.text === "string") {
      try { reportData = JSON.parse(result.text); console.log("[geogrid] Parsed via result.text"); } catch { reportData = result.text; }
    }

    // Tier 3: result.data or raw result
    if (!reportData) {
      if (typeof result?.data === "string") {
        try { reportData = JSON.parse(result.data); } catch { reportData = result.data; }
      } else if (result?.data) {
        reportData = result.data;
      } else {
        reportData = result;
      }
      console.log("[geogrid] Parsed via fallback tier");
    }

    if (Array.isArray(reportData)) {
      reportData = reportData[0];
    }

    // Unwrap double-encoded {text: "json string"} envelope (ChatGPT content[0].text is double-wrapped)
    if (reportData && !reportData.report_key && typeof reportData.text === "string") {
      try {
        const inner = JSON.parse(reportData.text);
        if (inner && typeof inner === "object") { reportData = inner; console.log("[geogrid] Unwrapped double-encoded text envelope"); }
      } catch { /* leave as-is */ }
    }

    console.log("[geogrid] Final reportData keys:", reportData ? Object.keys(reportData).join(", ") : "null");
    console.log("[geogrid] report_key:", reportData?.report_key || "MISSING");

    scanReport = reportData as ScanReport;
    if (!scanReport?.report_key) {
      const keys = reportData ? Object.keys(reportData).slice(0, 15).join(", ") : "null";
      loadingEl.textContent = `No report_key found. Keys: [${keys}]`;
      return;
    }

    loadingEl.textContent = `Loading grid data for ${scanReport.report_key}...`;
    renderMetrics(scanReport);

    const resourceUri = `localfalcon://reports/${scanReport.report_key}/data_points`;
    const resourceResult = await app.readServerResource({ uri: resourceUri });

    let rawData: any;
    if (resourceResult?.contents) {
      for (const content of resourceResult.contents) {
        if (content.text) {
          rawData = typeof content.text === "string" ? JSON.parse(content.text) : content.text;
          break;
        }
      }
    } else if (typeof resourceResult === "string") {
      rawData = JSON.parse(resourceResult);
    } else {
      rawData = resourceResult;
    }

    gridData = rawData as GridData;

    const topKeys = gridData ? Object.keys(gridData).join(", ") : "null";
    const dpCount = gridData?.data_points?.length ?? "missing";
    const placesCount = gridData?.places ? Object.keys(gridData.places).length : "missing";
    console.log(`[geogrid] Resource data — keys: [${topKeys}], data_points: ${dpCount}, places: ${placesCount}`);

    if (!gridData?.data_points || gridData.data_points.length === 0) {
      loadingEl.textContent = `No data_points (keys: [${topKeys}]). Check console.`;
      return;
    }

    loadingEl.textContent = `Rendering ${gridData.data_points.length} points...`;
    await renderMap(scanReport, gridData);
    loadingEl.classList.add("hidden");

    // Tell host our preferred size — square map + metrics bar
    try {
      const w = mapContainerEl.offsetWidth || 500;
      const metricsH = metricsPanelEl.offsetHeight || 40;
      await app.sendSizeChanged({ width: w, height: w + metricsH });
    } catch { /* host may not support size negotiation */ }
  } catch (err: any) {
    loadingEl.classList.remove("hidden");
    loadingEl.textContent = `Error: ${err.message || err}`;
    console.error("Geo-grid app error:", err);
  }
};

await app.connect();
loadingEl.textContent = "Connected. Waiting for scan report...";
