/**
 * In-memory store for registered OAuth client redirect URIs.
 *
 * Validates redirect_uri in authorization requests against values
 * registered via Dynamic Client Registration (RFC 7591), enforcing
 * OAuth 2.1's exact redirect URI matching requirement.
 *
 * Loopback redirect URIs (localhost, 127.0.0.1, [::1]) are always
 * allowed per RFC 8252 Section 7.3 (OAuth for Native Apps), since
 * MCP clients typically start a local HTTP server to receive callbacks.
 *
 * Non-loopback URIs must be registered via POST /register first.
 * Entries expire after 30 minutes to prevent unbounded growth.
 */

const REGISTRATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// OpenAI's platform scanner uses this redirect URI during app review and tool
// scanning without going through Dynamic Client Registration first.
const ALLOWLISTED_REDIRECT_URIS = new Set([
  "https://platform.openai.com/apps-manage/oauth",
  "https://chatgpt.com/connector_platform_oauth_redirect",
]);

interface RegisteredEntry {
  expiresAt: number;
}

const registeredRedirectUris = new Map<string, RegisteredEntry>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [uri, entry] of registeredRedirectUris) {
    if (now > entry.expiresAt) {
      registeredRedirectUris.delete(uri);
    }
  }
}, 60 * 1000);

/**
 * Store redirect URIs from a client registration request.
 */
export function registerRedirectUris(uris: string[]): void {
  const expiresAt = Date.now() + REGISTRATION_TTL_MS;
  for (const uri of uris) {
    registeredRedirectUris.set(uri, { expiresAt });
  }
}

/**
 * Strip a single trailing slash from a URI (unless the path is just "/").
 * Used to normalize allowlist comparisons so both
 * "https://example.com/path" and "https://example.com/path/" match.
 */
function normalizeTrailingSlash(uri: string): string {
  if (uri.length > 1 && uri.endsWith("/")) {
    return uri.slice(0, -1);
  }
  return uri;
}

const normalizedAllowlist = new Set(
  [...ALLOWLISTED_REDIRECT_URIS].map(normalizeTrailingSlash)
);

/**
 * Check whether a redirect URI is allowed.
 *
 * - Allowlisted URIs are matched after stripping a trailing slash from
 *   both sides, since OAuth clients inconsistently include one.
 * - Loopback URIs are always allowed (RFC 8252 Section 7.3).
 * - Non-loopback URIs must have been registered via POST /register
 *   and the registration must not have expired.
 */
export function isRedirectUriAllowed(uri: string): boolean {
  const normalized = normalizeTrailingSlash(uri);
  if (normalizedAllowlist.has(normalized)) {
    return true;
  }

  try {
    const parsed = new URL(uri);
    if (LOOPBACK_HOSTS.has(parsed.hostname)) {
      return true;
    }
  } catch {
    // Malformed URI — fall through to registration check
  }

  const entry = registeredRedirectUris.get(uri);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    registeredRedirectUris.delete(uri);
    return false;
  }
  return true;
}
