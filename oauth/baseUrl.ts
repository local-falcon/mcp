/**
 * Trusted resolution of this server's own public base URL.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * OAuth discovery metadata tells a client where to send its credentials. The
 * issuer, token endpoint, registration endpoint and the `resource_metadata`
 * pointer in `WWW-Authenticate` were all built by string-concatenating
 * `X-Forwarded-Host` / `X-Forwarded-Proto` straight off the request:
 *
 *   curl -H 'X-Forwarded-Host: evil.example' \
 *        -H 'X-Forwarded-Proto: https' /.well-known/oauth-authorization-server
 *   → { "issuer": "https://evil.example",
 *       "token_endpoint": "https://evil.example/oauth/token", ... }
 *
 * A client that follows that metadata performs its OAuth flow against the
 * attacker's host and hands over the authorization code. Reading the raw header
 * also bypasses Express's own `trust proxy` handling, so the app's proxy
 * configuration had no say in it.
 *
 * The responses were additionally served with an ETag but no `Cache-Control`
 * and no `Vary`, so a shared cache in front of the app could retain a poisoned
 * copy and serve it to other clients — which is what escalates this from a
 * self-inflicted response into a cross-user attack. Callers therefore send
 * these responses with `Cache-Control: no-store`.
 *
 * ── The policy ───────────────────────────────────────────────────────────
 *
 * RFC 8414 treats the issuer as a stable identifier, so the correct source of
 * truth is configuration, not a request header:
 *
 *   1. A request on our own canonical host returns PUBLIC_BASE_URL verbatim,
 *      scheme included — never rebuilt from headers, so a valid host cannot be
 *      paired with a downgraded X-Forwarded-Proto to advertise http://
 *      endpoints under an otherwise-legitimate issuer.
 *   2. A request on an ALLOWED_HOSTS entry is reflected as https://<host>,
 *      which keeps multi-domain deployments working. The scheme is forced
 *      rather than taken from a header; OAuth 2.1 requires https for
 *      non-loopback.
 *   3. Loopback is reflected only when PUBLIC_BASE_URL is unset, i.e. local
 *      development. A configured deployment must never advertise loopback as
 *      its issuer, so there it falls through to the canonical origin.
 *   4. Anything else, with PUBLIC_BASE_URL set, returns the canonical origin
 *      and logs the rejected host once.
 *   5. Anything else, with PUBLIC_BASE_URL unset, falls back to the
 *      request-derived host, because an unconfigured deployment has no other
 *      ground truth. This preserves the previous behaviour rather than
 *      breaking a running server, and warns once so the gap is visible.
 *      **Set PUBLIC_BASE_URL in production.**
 *
 * Host values are shape-validated in every branch, so header *injection* — CRLF,
 * comma-smuggled second values, absolute-URL forms — is rejected even when
 * unconfigured. Only host *substitution* needs the configuration above.
 *
 * Subdomains are never implied: a host must match a configured entry exactly,
 * since every match is somewhere we will advertise as our own issuer.
 */

import type { Request } from "express";

/** hostname with optional port, e.g. "mcp.example.com" or "example.com:8443". */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;
/** bracketed IPv6 literal with optional port, e.g. "[::1]:8000". */
const IPV6_HOST_RE = /^\[[0-9a-f:.]+\](:\d{1,5})?$/;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

interface BaseUrlConfig {
  publicBaseUrl: string | null;
  /** host and hostname of PUBLIC_BASE_URL — these resolve to it verbatim. */
  canonicalHosts: Set<string>;
  /** ALLOWED_HOSTS entries only — alternate hosts we reflect back. */
  allowedHosts: Set<string>;
}

let cached: BaseUrlConfig | null = null;

/**
 * Parse configuration lazily.
 *
 * This module is imported before dotenv.config() runs in index.ts, so reading
 * process.env at module scope would miss values from .env.local.
 */
function config(): BaseUrlConfig {
  if (cached) return cached;

  const allowedHosts = new Set<string>();
  const canonicalHosts = new Set<string>();
  let publicBaseUrl: string | null = null;

  const raw = (process.env.PUBLIC_BASE_URL ?? "").trim();
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`unsupported scheme ${parsed.protocol}`);
      }
      // Normalise to an origin — no trailing slash, no path.
      publicBaseUrl = parsed.origin;
      canonicalHosts.add(parsed.host.toLowerCase());
      canonicalHosts.add(parsed.hostname.toLowerCase());
    } catch (error) {
      console.error(
        `[BaseUrl] Ignoring invalid PUBLIC_BASE_URL "${raw}" ` +
          `(expected an absolute origin such as "https://mcp.example.com"): ${String(error)}`
      );
    }
  }

  for (const entry of (process.env.ALLOWED_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    if (!HOST_RE.test(host) && !IPV6_HOST_RE.test(host)) {
      console.warn(
        `[BaseUrl] Ignoring invalid ALLOWED_HOSTS entry "${entry.trim()}" ` +
          `(expected a bare host such as "mcp.example.com" or "mcp.example.com:8443")`
      );
      continue;
    }
    allowedHosts.add(host);
  }

  cached = { publicBaseUrl, canonicalHosts, allowedHosts };
  return cached;
}

/** Test seam: forget the cached env parse. */
export function resetBaseUrlCache(): void {
  cached = null;
}

/** Whether PUBLIC_BASE_URL is configured, for the startup warning. */
export function hasCanonicalBaseUrl(): boolean {
  return config().publicBaseUrl !== null;
}

/**
 * First value of a possibly comma-joined header, trimmed and lowercased.
 * Express joins repeated headers with ", ", and a proxy chain appends to
 * X-Forwarded-* the same way, so only the first hop is meaningful here.
 */
function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  const joined = Array.isArray(value) ? value[0] : value;
  if (typeof joined !== "string") return null;
  const first = joined.split(",")[0]?.trim().toLowerCase();
  return first ? first : null;
}

function isValidHost(host: string): boolean {
  return HOST_RE.test(host) || IPV6_HOST_RE.test(host);
}

function hostnameOf(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(":");
  return colon === -1 ? host : host.slice(0, colon);
}

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostnameOf(host));
}

/**
 * Whether `host` is an operator-listed alternate host.
 *
 * Matches the full host:port or the bare hostname, so an operator does not have
 * to enumerate ports. Subdomains are deliberately NOT implied — each host must
 * be listed, since every entry is somewhere we will advertise as our issuer.
 */
function isAllowedAlternateHost(host: string): boolean {
  const { allowedHosts } = config();
  const hostname = hostnameOf(host);
  return allowedHosts.has(host) || allowedHosts.has(hostname);
}

/** The host the client addressed, if it is well-formed. */
function requestedHost(req: Request): string | null {
  const forwarded = firstHeaderValue(req.headers["x-forwarded-host"]);
  const direct = firstHeaderValue(req.headers.host);
  for (const candidate of [forwarded, direct]) {
    if (candidate && isValidHost(candidate)) return candidate;
  }
  return null;
}

function requestedScheme(req: Request): "http" | "https" {
  const forwarded = firstHeaderValue(req.headers["x-forwarded-proto"]);
  if (forwarded === "https" || forwarded === "http") return forwarded;
  return req.protocol === "https" ? "https" : "http";
}

let warnedUnconfigured = false;
const warnedRejectedHosts = new Set<string>();

/**
 * This server's public origin, e.g. "https://mcp.localfalcon.com" — never with
 * a trailing slash.
 *
 * Safe to interpolate into discovery metadata and `WWW-Authenticate`: the
 * result is either operator-configured or an explicitly trusted host.
 */
export function resolveBaseUrl(req: Request): string {
  const { publicBaseUrl, canonicalHosts } = config();
  const host = requestedHost(req);

  // 1. Our own canonical host resolves to the configured origin verbatim,
  //    scheme included. Rebuilding it from headers would let a request pair our
  //    real host with a downgraded X-Forwarded-Proto and advertise http://
  //    endpoints under an otherwise-valid issuer.
  if (publicBaseUrl && host && (canonicalHosts.has(host) || canonicalHosts.has(hostnameOf(host)))) {
    return publicBaseUrl;
  }

  // 2. An operator-listed alternate host. Forced to https: OAuth 2.1 requires
  //    it for non-loopback, and the scheme must not be header-controlled.
  if (host && isAllowedAlternateHost(host)) {
    return `https://${host}`;
  }

  // 3. Loopback, only when no canonical origin is configured — i.e. local
  //    development. A configured deployment must never advertise loopback as
  //    its issuer, so in that case this falls through to the canonical origin.
  if (host && isLoopback(host) && !publicBaseUrl) {
    return `${requestedScheme(req)}://${host}`;
  }

  // 4. Configured canonical origin wins over any untrusted or malformed host.
  if (publicBaseUrl) {
    if (host && !warnedRejectedHosts.has(host)) {
      warnedRejectedHosts.add(host);
      console.warn(
        `[BaseUrl] Ignoring untrusted host "${host}" and using PUBLIC_BASE_URL ` +
          `"${publicBaseUrl}". Add it to ALLOWED_HOSTS if this host is legitimate.`
      );
    }
    return publicBaseUrl;
  }

  // 5. Unconfigured: no ground truth available. Preserve the previous
  //    behaviour rather than break a running deployment, but warn once.
  if (!warnedUnconfigured) {
    warnedUnconfigured = true;
    console.warn(
      "[BaseUrl] PUBLIC_BASE_URL is not set, so OAuth metadata is derived from " +
        "request headers and can be influenced by a client-supplied " +
        "X-Forwarded-Host. Set PUBLIC_BASE_URL to this server's public origin."
    );
  }

  if (host) return `${requestedScheme(req)}://${host}`;

  // No usable Host header at all (malformed or absent).
  return `${requestedScheme(req)}://localhost`;
}
