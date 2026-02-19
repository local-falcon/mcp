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
 * Check whether a redirect URI is allowed.
 *
 * - Loopback URIs are always allowed (RFC 8252 Section 7.3).
 * - Non-loopback URIs must have been registered via POST /register
 *   and the registration must not have expired.
 */
export function isRedirectUriAllowed(uri: string): boolean {
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
