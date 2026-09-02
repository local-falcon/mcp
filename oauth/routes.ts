/**
 * OAuth 2.1 Express Route Handlers for LocalFalcon MCP Server
 *
 * Enforces OAuth 2.1 requirements:
 * - PKCE mandatory with S256 (reject requests without code_challenge/code_verifier)
 * - Resource indicators (RFC 8707)
 * - Exact redirect URI matching
 * - Refresh token support for seamless token renewal
 */

import crypto from "crypto";
import type { Application, Request, Response } from "express";
import { OAUTH_CONFIG } from "./config.js";
import { stateStore } from "./stateStore.js";
import {
  generateSecureState,
  generateAuthorizationUrl,
  exchangeCodeForToken,
  revokeToken,
  OAuthError,
} from "./oauthClient.js";
import { clearAuthCache } from "./provider.js";
import { checkRedirectUri } from "./clientStore.js";
import { fetchLocalFalconAccountInfo } from "../localfalcon.js";

// ── Refresh Token Store ──────────────────────────────────────────────
// Maps refresh_token -> { apiKey, createdAt }
// Refresh tokens are long-lived (30 days) so a client can renew its
// access token without requiring user re-authentication.

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredRefreshToken {
  apiKey: string;
  createdAt: number;
}

const refreshTokenStore = new Map<string, StoredRefreshToken>();

// Periodically clean expired refresh tokens
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of refreshTokenStore) {
    if (now - data.createdAt > REFRESH_TOKEN_TTL_MS) {
      refreshTokenStore.delete(token);
    }
  }
}, 60 * 60 * 1000); // every hour

function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

/**
 * Issue a refresh token for an API key. If one already exists, revoke the old one.
 */
function issueRefreshToken(apiKey: string): string {
  // Revoke any existing refresh token for this API key to prevent accumulation
  for (const [token, data] of refreshTokenStore) {
    if (data.apiKey === apiKey) {
      refreshTokenStore.delete(token);
    }
  }
  const token = generateRefreshToken();
  refreshTokenStore.set(token, { apiKey, createdAt: Date.now() });
  return token;
}

/**
 * Revoke all refresh tokens for a given API key (used during token revocation)
 */
export function revokeRefreshTokensForApiKey(apiKey: string): void {
  for (const [token, data] of refreshTokenStore) {
    if (data.apiKey === apiKey) {
      refreshTokenStore.delete(token);
    }
  }
}

/**
 * Whether an authorization code (or error) may still be delivered to a redirect
 * URI taken out of the state store.
 *
 * Re-validating at delivery time — not just at /oauth/authorize — keeps the
 * policy anchored to the moment the code leaves our control, so a state entry
 * that was poisoned, or stored before a policy tightening, cannot be used to
 * forward a code to a destination the current policy forbids.
 */
function isDeliverableRedirect(uri: string): boolean {
  const decision = checkRedirectUri(uri);
  if (!decision.allowed) {
    console.error(`[OAuth] Refusing to deliver to redirect_uri (${decision.reason}): "${uri}"`);
  }
  return decision.allowed;
}

/**
 * Build the full redirect URI based on the incoming request
 */
function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}${OAUTH_CONFIG.callbackPath}`;
}

// ── HTML rendering helpers ───────────────────────────────────────────────
//
// The callback pages embed values that come straight off the query string
// (error, error_description, code), so every interpolation site must be
// escaped for the context it lands in. Getting this wrong here is directly
// exploitable: /oauth/callback renders the error branch WITHOUT requiring a
// valid state, so anyone can drive those values with a crafted link.

/** Escape for HTML text and quoted-attribute contexts. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize a value for embedding inside an inline <script> block.
 *
 * JSON.stringify alone is NOT sufficient: it happily emits a literal
 * "</script>" inside a string, which terminates the script element early and
 * turns the rest of the payload into markup. Escaping < > & to \uXXXX keeps
 * the output a valid JS literal that cannot close the element or start a
 * comment. U+2028/U+2029 are escaped too — they are valid in JSON but are
 * literal line terminators in JS string context.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Send one of the OAuth HTML pages with a per-response CSP nonce.
 *
 * Defence in depth for the escaping above: with `script-src 'nonce-…'` the only
 * script the browser will run is the one we emitted carrying this exact nonce,
 * so an injected <script> — or an onerror= handler, which no nonce can carry —
 * is inert even if an escaping bug slips back in. `Referrer-Policy: no-referrer`
 * keeps the authorization code in the URL from leaking to third parties via the
 * Referer header once the page navigates onward.
 */
function sendAuthPage(res: Response, status: number, build: (nonce: string) => string): void {
  const nonce = crypto.randomBytes(16).toString("base64");
  res
    .status(status)
    .set(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`
    )
    .set("X-Content-Type-Options", "nosniff")
    .set("Referrer-Policy", "no-referrer")
    .type("html")
    .send(build(nonce));
}

/**
 * Generate callback page that sends auth code/error to MCP client via postMessage
 */
function generateCallbackPage(
  code: string | null,
  error: string | null,
  errorDescription: string | null,
  nonce: string
): string {
  const payload = code
    ? { code }
    : { error: error || "unknown_error", error_description: errorDescription || "Unknown error" };

  const heading = code ? "Authorization Successful" : "Authorization Failed";
  const accent = code ? "#22c55e" : "#ef4444";
  const glyph = code ? "&#10003;" : "&#10007;";
  const detail = code ? "Completing authentication…" : errorDescription || "An error occurred";
  const fallbackStatus = code
    ? "Authorization code received. You may close this window."
    : "Please close this window and try again.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} - LocalFalcon MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: ${accent}; margin-bottom: 20px; }
    .icon { font-size: 64px; color: ${accent}; margin-bottom: 10px; }
    .instructions { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${glyph}</div>
    <h1>${heading}</h1>
    <p class="instructions">${escapeHtml(detail)}</p>
    <p class="instructions" id="status">This window will close automatically.</p>
  </div>
  <script nonce="${nonce}">
    (function() {
      var message = ${jsonForScript(payload)};
      // Send to opener via postMessage
      if (window.opener) {
        window.opener.postMessage(message, '*');
        setTimeout(function() { window.close(); }, 1000);
      } else {
        document.getElementById('status').textContent = ${jsonForScript(fallbackStatus)};
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Generate a success page shown after OAuth authorization completes.
 * Displays a brief confirmation, then redirects the browser to the MCP client's
 * callback URL. Uses <meta http-equiv="refresh"> so it works even without JS,
 * with a JS redirect as a faster path and a clickable link as the final fallback.
 */
function generateSuccessPage(redirectUrl: string, nonce: string): string {
  // Attribute context: full HTML escaping. Script context: a JSON literal via
  // jsonForScript rather than hand-rolled quote escaping, so there is no way to
  // break out of the string. The URL itself is already constrained to https or
  // loopback by checkRedirectUri (see oauth/clientStore.ts), which is what keeps
  // a javascript: URL out of the href below.
  const safeUrl = escapeHtml(redirectUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="2;url=${safeUrl}">
  <title>Authorization Successful - LocalFalcon MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: #22c55e; margin-bottom: 20px; }
    .icon { font-size: 64px; color: #22c55e; margin-bottom: 10px; }
    .instructions { color: #666; line-height: 1.6; }
    a { color: #3b82f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#10003;</div>
    <h1>Authorization Successful</h1>
    <p class="instructions">Completing authentication&hellip;</p>
    <p class="instructions">If you are not redirected automatically, <a href="${safeUrl}">click here</a>.</p>
  </div>
  <script nonce="${nonce}">
    setTimeout(function() { window.location.href = ${jsonForScript(redirectUrl)}; }, 1000);
  </script>
</body>
</html>`;
}

/**
 * GET /oauth/authorize
 * Initiates the OAuth 2.1 flow by redirecting to LocalFalcon's authorization endpoint.
 * Enforces PKCE with S256 as required by OAuth 2.1.
 */
async function handleAuthorize(req: Request, res: Response): Promise<void> {
  try {
    const redirectUri = getRedirectUri(req);

    // Get MCP client's OAuth parameters
    const clientState = req.query.state as string | undefined;
    const codeChallenge = req.query.code_challenge as string | undefined;
    const codeChallengeMethod = req.query.code_challenge_method as string | undefined;
    const clientRedirectUri = req.query.redirect_uri as string | undefined;
    const scope = req.query.scope as string | undefined;
    const resource = req.query.resource as string | undefined;

    // OAuth 2.1: PKCE is mandatory — reject requests without code_challenge
    if (!codeChallenge) {
      console.error("[OAuth] PKCE required: missing code_challenge parameter");
      res.status(400).json({
        error: "invalid_request",
        error_description: "PKCE is required. The code_challenge parameter must be provided (OAuth 2.1).",
      });
      return;
    }

    // OAuth 2.1: Only S256 is supported
    if (codeChallengeMethod && codeChallengeMethod !== "S256") {
      console.error(`[OAuth] Unsupported code_challenge_method: ${codeChallengeMethod}`);
      res.status(400).json({
        error: "invalid_request",
        error_description: "Only S256 code_challenge_method is supported (OAuth 2.1).",
      });
      return;
    }

    // OAuth 2.1: Redirect URI validation. This is the control that decides who
    // may receive a user's authorization code — see oauth/clientStore.ts for why
    // it cannot be delegated to unauthenticated Dynamic Client Registration.
    if (clientRedirectUri) {
      const decision = checkRedirectUri(clientRedirectUri);
      if (!decision.allowed) {
        console.error(
          `[OAuth] Rejected redirect_uri (${decision.reason}): "${clientRedirectUri}"`
        );
        res.status(400).json({
          error: "invalid_request",
          error_description:
            "The redirect_uri is not permitted. It must be a loopback URI or an https URI " +
            "on a supported MCP client platform.",
        });
        return;
      }
    }

    // Use client's state or generate our own
    const state = clientState || generateSecureState();

    // The state key is client-supplied, so an existing entry may belong to a
    // different in-flight authorization. Refusing to repoint a live state at a
    // new destination prevents an attacker who can guess a victim's state value
    // from redirecting that victim's code elsewhere. An identical retry (same
    // destination, e.g. the user reloading the authorize URL) is still fine.
    const existing = stateStore.get(state);
    if (existing && existing.clientRedirectUri !== clientRedirectUri) {
      console.error("[OAuth] Refusing to overwrite in-flight state with a different redirect_uri");
      res.status(400).json({
        error: "invalid_request",
        error_description: "The state parameter is already in use. Please retry with a new state.",
      });
      return;
    }

    // Store state for CSRF validation, including client's redirect URI and resource
    stateStore.set(state, {
      createdAt: Date.now(),
      redirectUri,
      clientRedirectUri,
      resource,
    });

    // Build authorization URL with all parameters using the updated helper
    const authUrl = generateAuthorizationUrl(redirectUri, state, {
      codeChallenge,
      codeChallengeMethod: codeChallengeMethod || "S256",
      scope,
      resource,
    });

    console.log(`[OAuth] Redirecting to authorization URL: ${authUrl}`);
    console.log(`[OAuth] Client params - state: ${clientState ? "provided" : "generated"}, PKCE: yes, resource: ${resource || "none"}`);
    res.redirect(authUrl);
  } catch (error) {
    console.error("[OAuth] Error initiating authorization:", error);
    res.status(500).json({
      error: "oauth_error",
      error_description: "Failed to initiate OAuth flow",
    });
  }
}

/**
 * GET /oauth/callback
 * Handles the OAuth callback - returns authorization code to MCP client.
 * The MCP client will exchange the code via POST /oauth/token with its PKCE verifier.
 */
async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error, error_description } = req.query;

  // Handle errors from OAuth provider
  if (error) {
    console.error(`[OAuth] Authorization error: ${error} - ${error_description}`);

    // Check if we have a stored state with client redirect URI for error redirect
    if (state) {
      const storedState = stateStore.get(state as string);
      if (storedState?.clientRedirectUri && isDeliverableRedirect(storedState.clientRedirectUri)) {
        const errorRedirectUrl = new URL(storedState.clientRedirectUri);
        errorRedirectUrl.searchParams.set("error", error?.toString() || "authorization_error");
        if (error_description) {
          errorRedirectUrl.searchParams.set("error_description", error_description.toString());
        }
        console.log(`[OAuth] Redirecting error to client: ${errorRedirectUrl.toString()}`);
        stateStore.delete(state as string);
        res.redirect(errorRedirectUrl.toString());
        return;
      }
    }

    sendAuthPage(res, 400, (nonce) => generateCallbackPage(
      null,
      error?.toString() || "authorization_error",
      error_description?.toString() || "Authorization failed",
      nonce
    ));
    return;
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[OAuth] Missing code or state parameter");
    sendAuthPage(res, 400, (nonce) => generateCallbackPage(
      null,
      "invalid_request",
      "Missing required parameters",
      nonce
    ));
    return;
  }

  // Validate state for CSRF protection
  const storedState = stateStore.validate(state as string);
  if (!storedState) {
    console.error("[OAuth] Invalid or expired state parameter");
    sendAuthPage(res, 400, (nonce) => generateCallbackPage(
      null,
      "invalid_state",
      "The authorization request has expired or is invalid. Please try again.",
      nonce
    ));
    return;
  }

  console.log("[OAuth] Authorization code received, returning to MCP client");

  // If client provided a redirect URI, show a brief success page then redirect
  // to the client with the authorization code and state.
  //
  // The URI was already validated at /oauth/authorize; it is re-checked here
  // because this is the point where the code actually leaves our control. That
  // makes the policy enforced at the delivery point rather than only at the
  // entry point, so a poisoned or stale state entry still cannot exfiltrate.
  if (storedState.clientRedirectUri) {
    if (!isDeliverableRedirect(storedState.clientRedirectUri)) {
      sendAuthPage(res, 400, (nonce) => generateCallbackPage(
        null,
        "invalid_request",
        "The redirect_uri associated with this authorization request is not permitted.",
        nonce
      ));
      return;
    }
    const redirectUrl = new URL(storedState.clientRedirectUri);
    redirectUrl.searchParams.set("code", code as string);
    redirectUrl.searchParams.set("state", state as string);
    console.log(`[OAuth] Showing success page, will redirect to: ${redirectUrl.toString()}`);
    sendAuthPage(res, 200, (nonce) => generateSuccessPage(redirectUrl.toString(), nonce));
    return;
  }

  // Fallback: Return the authorization code via postMessage for browser-based clients
  console.log("[OAuth] No client redirect_uri, using postMessage fallback");
  sendAuthPage(res, 200, (nonce) => generateCallbackPage(code as string, null, null, nonce));
}


/**
 * Handle token exchange request from MCP client
 * POST /oauth/token - exchanges authorization code for access token
 *
 * OAuth 2.1: Requires code_verifier (PKCE) for authorization_code grant
 */
async function handleTokenExchange(req: Request, res: Response): Promise<void> {
  // Ensure body exists (requires express.urlencoded middleware for OAuth requests)
  if (!req.body || typeof req.body !== 'object') {
    console.error("[OAuth] Token request has no body. Content-Type:", req.headers['content-type']);
    res.status(400).json({
      error: "invalid_request",
      error_description: "Request body is missing or invalid. Ensure Content-Type is application/x-www-form-urlencoded or application/json.",
    });
    return;
  }

  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier, resource } = req.body;

  console.log("[OAuth] Token exchange request received:", {
    contentType: req.headers['content-type'],
    grant_type,
    code: code ? "[PRESENT]" : "[MISSING]",
    redirect_uri,
    client_id,
    client_secret: client_secret ? "[PRESENT]" : "[MISSING]",
    code_verifier: code_verifier ? "[PRESENT]" : "[MISSING]",
    resource: resource ? "[PRESENT]" : "[MISSING]",
  });

  // Route to the appropriate handler based on grant_type
  if (grant_type === "authorization_code") {
    await handleAuthorizationCodeGrant(req, res);
  } else if (grant_type === "refresh_token") {
    await handleRefreshTokenGrant(req, res);
  } else {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Supported grant types: authorization_code, refresh_token",
    });
  }
}

/**
 * Handle authorization_code grant type
 */
async function handleAuthorizationCodeGrant(req: Request, res: Response): Promise<void> {
  const { code, redirect_uri, code_verifier, resource } = req.body;

  if (!code) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing authorization code",
    });
    return;
  }

  // OAuth 2.1: PKCE code_verifier is mandatory for authorization_code grant
  if (!code_verifier) {
    console.error("[OAuth] PKCE required: missing code_verifier parameter");
    res.status(400).json({
      error: "invalid_request",
      error_description: "PKCE is required. The code_verifier parameter must be provided (OAuth 2.1).",
    });
    return;
  }

  try {
    // Always use OUR callback URL when calling LocalFalcon's token endpoint.
    // The client sends its own redirect_uri, but LocalFalcon requires the one
    // used during the authorize step, which is our /oauth/callback.
    const ourRedirectUri = getRedirectUri(req);
    if (redirect_uri && redirect_uri !== ourRedirectUri) {
      console.log("[OAuth] Client redirect_uri:", redirect_uri, "-> using ours:", ourRedirectUri);
    }

    const tokenResponse = await exchangeCodeForToken(
      code as string,
      ourRedirectUri,
      code_verifier,
      resource
    );

    console.log("[OAuth] Token response from LocalFalcon:", Object.keys(tokenResponse));

    // Extract API key from response (LocalFalcon may return it in various fields)
    const apiKey =
      (tokenResponse as any).data?.api_key ||
      (tokenResponse as any).api_key ||
      (tokenResponse as any).apiKey ||
      (tokenResponse as any).access_token ||
      (tokenResponse as any).token ||
      (tokenResponse as any).key;

    if (!apiKey) {
      console.error("[OAuth] No API key in token response");
      res.status(500).json({
        error: "server_error",
        error_description: "No access token returned from authorization server",
      });
      return;
    }

    // Issue a refresh token so the client can renew without re-auth
    const refreshToken = issueRefreshToken(apiKey);

    // Return standard OAuth 2.1 token response with refresh token
    res.status(200).json({
      access_token: apiKey,
      token_type: "Bearer",
      expires_in: 86400, // 24 hours
      refresh_token: refreshToken,
      scope: "api offline_access",
    });
  } catch (error) {
    console.error("[OAuth] Token exchange failed:", error);
    if (error instanceof OAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        error_description: error.message,
      });
    } else {
      res.status(500).json({
        error: "server_error",
        error_description: "Token exchange failed",
      });
    }
  }
}

/**
 * Handle refresh_token grant type.
 * Validates the refresh token, verifies the API key is still active,
 * and issues a new access token + rotated refresh token.
 */
async function handleRefreshTokenGrant(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing refresh_token parameter",
    });
    return;
  }

  // Look up the refresh token
  const stored = refreshTokenStore.get(refresh_token);
  if (!stored) {
    console.error("[OAuth] Invalid or expired refresh token");
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired refresh token",
    });
    return;
  }

  // Check refresh token expiry
  if (Date.now() - stored.createdAt > REFRESH_TOKEN_TTL_MS) {
    refreshTokenStore.delete(refresh_token);
    console.error("[OAuth] Refresh token expired");
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Refresh token has expired, please re-authenticate",
    });
    return;
  }

  try {
    // Verify the API key is still valid by calling the account endpoint
    await fetchLocalFalconAccountInfo(stored.apiKey, "subscription");

    // Rotate: revoke old refresh token and issue a new one
    refreshTokenStore.delete(refresh_token);
    const newRefreshToken = issueRefreshToken(stored.apiKey);

    // Clear the verification cache so it gets a fresh TTL
    clearAuthCache(stored.apiKey);

    console.log("[OAuth] Token refreshed successfully");

    res.status(200).json({
      access_token: stored.apiKey,
      token_type: "Bearer",
      expires_in: 86400, // 24 hours
      refresh_token: newRefreshToken,
      scope: "api offline_access",
    });
  } catch (error) {
    // API key is no longer valid — revoke the refresh token too
    refreshTokenStore.delete(refresh_token);
    console.error("[OAuth] Refresh failed — API key no longer valid:", error);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "The associated access token is no longer valid. Please re-authenticate.",
    });
  }
}

/**
 * Handle token revocation request (RFC 7009)
 * POST /oauth/revoke - revokes an access token
 */
async function handleRevoke(req: Request, res: Response): Promise<void> {
  // Ensure body exists
  if (!req.body || typeof req.body !== 'object') {
    console.error("[OAuth] Revoke request has no body. Content-Type:", req.headers['content-type']);
    res.status(400).json({
      error: "invalid_request",
      error_description: "Request body is missing or invalid.",
    });
    return;
  }

  const { token, token_type_hint } = req.body;

  console.log("[OAuth] Revoke request received:", {
    token: token ? "[PRESENT]" : "[MISSING]",
    token_type_hint,
  });

  if (!token) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Missing token parameter",
    });
    return;
  }

  try {
    await revokeToken(token);
    // Also clear the auth cache and any associated refresh tokens
    clearAuthCache(token);
    revokeRefreshTokensForApiKey(token);
    // RFC 7009: Return 200 OK regardless of whether token was valid
    res.status(200).json({ revoked: true });
  } catch (error) {
    console.error("[OAuth] Revocation failed:", error);
    // Still clean up local state even if remote revocation failed
    clearAuthCache(token);
    revokeRefreshTokensForApiKey(token);
    // Still return 200 per RFC 7009 - revocation is best-effort
    res.status(200).json({ revoked: true });
  }
}

/**
 * Set up OAuth 2.1 routes on the Express application
 */
export function setupOAuthRoutes(app: Application): void {
  // Authorization endpoint - initiates OAuth flow (PKCE required)
  app.get("/oauth/authorize", (req, res) => {
    handleAuthorize(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in authorize:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  });

  // Token endpoint - exchanges code for access token (code_verifier required)
  app.post("/oauth/token", (req, res) => {
    handleTokenExchange(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in token exchange:", err);
      res.status(500).json({ error: "server_error", error_description: "Internal server error" });
    });
  });

  // Callback endpoint - handles OAuth response (browser redirect)
  app.get("/oauth/callback", (req, res) => {
    handleCallback(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in callback:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  });

  // Revocation endpoint - revokes access tokens (RFC 7009)
  app.post("/oauth/revoke", (req, res) => {
    handleRevoke(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in revoke:", err);
      res.status(200).json({ revoked: true }); // Per RFC 7009, always return 200
    });
  });

  console.log("[OAuth 2.1] Routes registered: GET /oauth/authorize, POST /oauth/token, GET /oauth/callback, POST /oauth/revoke");
}
