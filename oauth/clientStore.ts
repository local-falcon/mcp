/**
 * In-memory store for registered OAuth client redirect URIs.
 *
 * Validates redirect_uri in authorization requests against values
 * registered via Dynamic Client Registration (RFC 7591), enforcing
 * OAuth 2.1's exact redirect URI matching requirement.
 *
 * Entries expire after 30 minutes to prevent unbounded growth.
 */

const REGISTRATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
 * Check whether a redirect URI was previously registered and is still valid.
 * Performs exact string matching per OAuth 2.1.
 */
export function isRedirectUriRegistered(uri: string): boolean {
  const entry = registeredRedirectUris.get(uri);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    registeredRedirectUris.delete(uri);
    return false;
  }
  return true;
}
