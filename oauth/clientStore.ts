/**
 * In-memory store for registered OAuth client redirect URIs.
 *
 * This server is an OAuth *proxy*: at /oauth/authorize it redirects the
 * browser to LocalFalcon using its OWN fixed redirect_uri
 * (https://<host>/oauth/callback). The client's redirect_uri is only
 * stashed in state and reflected back to the client at the end of the
 * flow. Combined with mandatory PKCE (S256) and CSRF state validation,
 * the open-redirect risk is limited to "where do we hand the final code
 * back to" — so redirect_uri validation only needs to confirm the URI
 * belongs to a trusted MCP client platform, not match an exact string.
 *
 * Accordingly, a redirect_uri is allowed when:
 * - It is a loopback URI (localhost/127.0.0.1/[::1]) per RFC 8252 §7.3,
 *   since locally-installed MCP clients spin up an ephemeral callback
 *   server, OR
 * - It is an https: URI whose host is (or is a subdomain of) a trusted
 *   MCP client platform domain (ChatGPT, OpenAI, Anthropic/Claude, our
 *   own domain), OR
 * - It was registered via Dynamic Client Registration (POST /register)
 *   and the registration has not expired (fallback for clients on hosts
 *   we don't explicitly trust).
 *
 * Host-suffix matching replaces the previous exact-URL allowlist, which
 * broke whenever OpenAI's review pipeline used a new path/query/host
 * variant, and which depended on the in-memory DCR map below — a map
 * that is wiped on redeploy and is NOT shared across instances, so a
 * POST /register on one replica would not satisfy a GET /authorize on
 * another. Trusted-host matching needs no shared state.
 */

const REGISTRATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Trusted MCP client platform domains. A redirect_uri served over https
// whose hostname equals one of these or is a subdomain of one is allowed
// without prior Dynamic Client Registration. This covers OpenAI's app
// review/scanner pipeline (which does not perform DCR first) and ChatGPT's
// connector callback, regardless of the exact path/query they use.
const TRUSTED_REDIRECT_DOMAINS = [
  // ChatGPT / OpenAI
  "chatgpt.com",
  "openai.com",
  // Anthropic / Claude
  "anthropic.com",
  "claude.ai",
  "claude.com",
  // VS Code — routes OAuth callbacks through https://vscode.dev/redirect
  // (and insiders.vscode.dev, a subdomain, is covered by suffix matching)
  "vscode.dev",
  // Cursor
  "cursor.com",
  // Mistral Le Chat (chat.mistral.ai, covered by suffix matching)
  "mistral.ai",
  // Microsoft Copilot / Copilot Studio
  "microsoft.com",
  // Perplexity (web app remote MCP connectors)
  "perplexity.ai",
  // Google Gemini consumer web app (narrowed to the Gemini host rather than
  // all of google.com; does not cover the Gemini Enterprise Cloud console)
  "gemini.google.com",
  "google.com",
  // Our own domain
  "localfalcon.com",
];

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
 * Whether a hostname is, or is a subdomain of, a trusted redirect domain.
 * "chatgpt.com" and "auth.chatgpt.com" match "chatgpt.com"; "evilchatgpt.com"
 * does not (the boundary check requires a literal "." before the domain).
 */
function isTrustedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return TRUSTED_REDIRECT_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

/**
 * Check whether a redirect URI is allowed.
 *
 * - Loopback URIs are always allowed (RFC 8252 §7.3).
 * - https: URIs on a trusted MCP client platform host are allowed.
 * - Otherwise, the URI must have been registered via POST /register and
 *   the registration must not have expired.
 */
export function isRedirectUriAllowed(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (LOOPBACK_HOSTS.has(parsed.hostname)) {
      return true;
    }
    if (parsed.protocol === "https:" && isTrustedHost(parsed.hostname)) {
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
