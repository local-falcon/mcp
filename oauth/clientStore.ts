/**
 * Redirect URI trust policy for the LocalFalcon MCP OAuth proxy.
 *
 * ── Why registration is NOT a trust grant ─────────────────────────────────
 *
 * This server is an OAuth *proxy*: at /oauth/authorize it redirects the browser
 * to LocalFalcon using its OWN fixed redirect_uri (https://<host>/oauth/callback)
 * and its OWN fixed upstream client_id. The MCP client's redirect_uri is stashed
 * in state and the authorization code is handed to it at the end of the flow.
 *
 * That architecture makes the redirect_uri check the *only* thing standing
 * between an attacker and a victim's authorization code, because:
 *
 *   1. The consent screen the user sees is rendered by LocalFalcon against our
 *      single fixed upstream client_id. It therefore always reads
 *      "LocalFalcon MCP" no matter which MCP client initiated the flow — the
 *      user cannot tell a legitimate client from an attacker's.
 *   2. PKCE provides no protection here. The attacker supplies the
 *      code_challenge on the crafted /authorize link, so they hold the matching
 *      verifier and can redeem any code they receive.
 *   3. The access token we return IS the user's raw LocalFalcon API key, so a
 *      single stolen code is a full account compromise.
 *
 * Consequently, redirect URI trust MUST NOT be grantable by an unauthenticated
 * HTTP caller. A previous version of this file let anything registered via
 * POST /register (open Dynamic Client Registration, no auth) become a valid
 * redirect target for 30 minutes. That allowed:
 *
 *   POST /register {"redirect_uris":["https://attacker.example/steal"]}
 *   → phish victim to /oauth/authorize?redirect_uri=https://attacker.example/steal
 *   → victim's code delivered to attacker → attacker redeems it → API key stolen
 *
 * Note that per-client redirect_uri binding does NOT fix this: with open
 * registration the attacker simply registers their own client_id alongside
 * their own redirect_uri, and because of (1) the victim still sees an
 * indistinguishable consent screen. The only effective control is to restrict
 * *which destinations can ever receive a code*.
 *
 * ── The policy ────────────────────────────────────────────────────────────
 *
 * A redirect URI is allowed only when all of the following hold:
 *   - It parses as a URL, carries no fragment (RFC 6749 §3.1.2) and no
 *     userinfo component.
 *   - Its scheme is https:, or http: with a loopback host (RFC 8252 §7.3).
 *     Every other scheme — javascript:, data:, file:, private-use app schemes —
 *     is rejected.
 *   - Its host is a loopback address, OR is (or is a subdomain of) a trusted
 *     MCP client platform domain.
 *
 * Both branches are stateless, so the policy survives redeploys and works
 * identically across replicas — unlike the in-memory registration map it
 * replaces, which was wiped on restart and never shared between instances.
 *
 * Operators can extend the trusted set two ways, both deliberate server-side
 * configuration steps that are NOT reachable over HTTP:
 *
 *   - ADDITIONAL_TRUSTED_REDIRECT_URIS — comma-separated absolute URIs, matched
 *     exactly. Grants trust to one endpoint and nothing else. Prefer this.
 *   - ADDITIONAL_TRUSTED_REDIRECT_DOMAINS — comma-separated bare domains,
 *     which trusts the domain and every subdomain of it. Broader; use only when
 *     the exact callback is not known ahead of time.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Trusted MCP client platform domains. A redirect_uri served over https whose
 * hostname equals one of these, or is a subdomain of one, may receive an
 * authorization code.
 *
 * Keep these as narrow as the platform allows. Every entry is a standing
 * delegation of "may receive our users' authorization codes" to that domain's
 * entire subdomain tree, so a subdomain takeover or an open redirect anywhere
 * beneath it becomes a code-exfiltration path. Mega-domains that host large
 * amounts of unrelated user content (google.com, microsoft.com) are
 * deliberately NOT listed as bare domains — only the specific product hosts.
 */
const TRUSTED_REDIRECT_DOMAINS = [
  // ChatGPT / OpenAI — connector callback + app review pipeline
  "chatgpt.com",
  "openai.com",
  // Anthropic / Claude
  "anthropic.com",
  "claude.ai",
  "claude.com",
  // VS Code — routes OAuth callbacks through https://vscode.dev/redirect
  // (insiders.vscode.dev is covered by suffix matching)
  "vscode.dev",
  // Cursor
  "cursor.com",
  // Mistral Le Chat (chat.mistral.ai, covered by suffix matching)
  "mistral.ai",
  // Perplexity (web app remote MCP connectors)
  "perplexity.ai",
  // Google Gemini consumer web app. Scoped to the Gemini host specifically:
  // bare "google.com" would delegate to every Google property, including hosts
  // with well-known open redirects.
  "gemini.google.com",
  // Microsoft Copilot. Scoped to the Copilot product hosts rather than bare
  // "microsoft.com" for the same reason.
  "copilot.microsoft.com",
  "copilotstudio.microsoft.com",
  // Our own domain
  "localfalcon.com",
];

/** Shape of a bare domain: labels of [a-z0-9-] joined by dots, at least one dot. */
const BARE_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

let extraDomainsCache: string[] | null = null;

/**
 * Operator-supplied additional trusted domains.
 *
 * Read lazily rather than at module load: this module is imported before
 * dotenv.config() runs in index.ts, so a module-scope read would miss values
 * coming from .env.local.
 */
function extraTrustedDomains(): string[] {
  if (extraDomainsCache !== null) return extraDomainsCache;

  const raw = process.env.ADDITIONAL_TRUSTED_REDIRECT_DOMAINS ?? "";
  const accepted: string[] = [];

  for (const entry of raw.split(",")) {
    const domain = entry.trim().toLowerCase();
    if (!domain) continue;
    // Reject anything that isn't a bare domain — a stray scheme, wildcard,
    // port or path in this list would silently widen the policy.
    if (!BARE_DOMAIN_RE.test(domain)) {
      console.warn(
        `[OAuth] Ignoring invalid ADDITIONAL_TRUSTED_REDIRECT_DOMAINS entry: "${entry.trim()}" ` +
          `(expected a bare domain such as "mcp.example.com")`
      );
      continue;
    }
    accepted.push(domain);
  }

  if (accepted.length > 0) {
    console.log(`[OAuth] Additional trusted redirect domains: ${accepted.join(", ")}`);
  }

  extraDomainsCache = accepted;
  return accepted;
}

let extraUrisCache: Set<string> | null = null;

/**
 * Normalise a redirect URI for exact comparison.
 *
 * RFC 6749 §3.1.2.3 calls for exact matching, but a raw string compare would
 * treat trivially equivalent forms as different — "https://A.example/cb" vs
 * "https://a.example/cb", or ":443" vs the implied default port. WHATWG URL
 * parsing lowercases the scheme and host and drops the default port while
 * leaving the path case-sensitive (paths ARE case-sensitive), which is exactly
 * the comparison we want. The query is significant and kept; a fragment cannot
 * appear here because checkRedirectUri rejects those outright.
 *
 * Returns null when the value is not a usable absolute URI.
 */
function normaliseUri(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.hash) return null;
  if (parsed.username || parsed.password) return null;

  const loopback = isLoopbackHost(parsed.hostname);
  if (parsed.protocol === "http:") {
    if (!loopback) return null;
  } else if (parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString();
}

/**
 * Operator-supplied additional trusted redirect URIs, matched EXACTLY.
 *
 * Complements ADDITIONAL_TRUSTED_REDIRECT_DOMAINS: that variable delegates
 * trust to a domain and every subdomain of it, which is a blunt instrument when
 * an operator only needs one specific callback to work. Listing the full URI
 * grants trust to that one endpoint and nothing else — no sibling paths, no
 * subdomains — so prefer it when you know the exact callback.
 *
 * Entries must satisfy the same structural rules the policy enforces at request
 * time (absolute, https or loopback-http, no fragment, no embedded credentials).
 * Anything else is dropped with a warning rather than silently widening or
 * narrowing the policy — in particular a javascript: or data: entry here can
 * never take effect, since checkRedirectUri rejects those on scheme before any
 * allowlist is consulted.
 *
 * Read lazily, for the same dotenv ordering reason as the domains list.
 */
function extraTrustedUris(): Set<string> {
  if (extraUrisCache !== null) return extraUrisCache;

  const raw = process.env.ADDITIONAL_TRUSTED_REDIRECT_URIS ?? "";
  const accepted = new Set<string>();

  for (const entry of raw.split(",")) {
    const candidate = entry.trim();
    if (!candidate) continue;

    const normalised = normaliseUri(candidate);
    if (!normalised) {
      console.warn(
        `[OAuth] Ignoring invalid ADDITIONAL_TRUSTED_REDIRECT_URIS entry: "${candidate}" ` +
          `(expected an absolute https URI — or http only for loopback — with no fragment ` +
          `and no embedded credentials, e.g. "https://mcp.example.com/oauth/callback")`
      );
      continue;
    }
    accepted.add(normalised);
  }

  if (accepted.size > 0) {
    console.log(`[OAuth] Additional trusted redirect URIs: ${[...accepted].join(", ")}`);
  }

  extraUrisCache = accepted;
  return accepted;
}

/** Whether `uri` exactly matches an operator-listed redirect URI. */
function isTrustedUri(uri: string): boolean {
  const uris = extraTrustedUris();
  if (uris.size === 0) return false;
  const normalised = normaliseUri(uri);
  return normalised !== null && uris.has(normalised);
}

/** Test seam: forget the cached env parses. */
export function resetTrustedDomainCache(): void {
  extraDomainsCache = null;
  extraUrisCache = null;
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Whether a hostname is, or is a subdomain of, a trusted redirect domain.
 * "chatgpt.com" and "auth.chatgpt.com" match "chatgpt.com"; "evilchatgpt.com"
 * and "chatgpt.com.evil.test" do not (the boundary check requires a literal
 * "." immediately before the trusted domain).
 */
function isTrustedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const domains = [...TRUSTED_REDIRECT_DOMAINS, ...extraTrustedDomains()];
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export interface RedirectUriDecision {
  allowed: boolean;
  /** Machine-readable rationale, for server-side logging only. */
  reason: string;
}

/**
 * Decide whether an authorization code may be delivered to `uri`.
 *
 * The `reason` is for server logs. Do NOT surface it to clients verbatim —
 * callers return a fixed, generic error_description instead.
 */
export function checkRedirectUri(uri: string): RedirectUriDecision {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return { allowed: false, reason: "malformed-uri" };
  }

  // RFC 6749 §3.1.2: the redirect endpoint URI MUST NOT include a fragment.
  if (parsed.hash) {
    return { allowed: false, reason: "fragment-not-allowed" };
  }

  // Credentials in a redirect URI are a classic way to make a hostile host look
  // like a trusted one to a human reader. We resolve on the real host, but
  // reject outright rather than forward a code to such a URI.
  if (parsed.username || parsed.password) {
    return { allowed: false, reason: "userinfo-not-allowed" };
  }

  const loopback = isLoopbackHost(parsed.hostname);

  // Scheme allowlist. http: is permitted only for loopback, per RFC 8252 §7.3.
  // This is what rejects javascript:, data:, file: and private-use app schemes.
  if (parsed.protocol === "http:") {
    if (!loopback) {
      return { allowed: false, reason: "http-requires-loopback-host" };
    }
  } else if (parsed.protocol !== "https:") {
    return { allowed: false, reason: `disallowed-scheme:${parsed.protocol}` };
  }

  // A code delivered to loopback can only reach software on the user's own
  // machine, so it is not remotely exfiltratable (RFC 8252 §7.3).
  if (loopback) {
    return { allowed: true, reason: "loopback" };
  }

  // Exact operator-listed URI. Checked before the domain list purely so the
  // reason reflects the narrower grant when both would allow it.
  if (isTrustedUri(uri)) {
    return { allowed: true, reason: "operator-allowlisted-uri" };
  }

  if (isTrustedHost(parsed.hostname)) {
    return { allowed: true, reason: "trusted-domain" };
  }

  return { allowed: false, reason: "host-not-trusted" };
}
