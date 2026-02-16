/**
 * OAuth 2.1 Express Route Handlers for LocalFalcon MCP Server
 *
 * Enforces OAuth 2.1 requirements:
 * - PKCE mandatory with S256 (reject requests without code_challenge/code_verifier)
 * - Resource indicators (RFC 8707)
 * - Exact redirect URI matching
 */

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
import { isRedirectUriRegistered } from "./clientStore.js";

/**
 * Build the full redirect URI based on the incoming request
 */
function getRedirectUri(req: Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}${OAUTH_CONFIG.callbackPath}`;
}

/**
 * Generate callback page that sends auth code/error to MCP client via postMessage
 */
function generateCallbackPage(code: string | null, error: string | null, errorDescription: string | null): string {
  const message = code
    ? JSON.stringify({ code })
    : JSON.stringify({ error: error || "unknown_error", error_description: errorDescription || "Unknown error" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${code ? "Authorization Successful" : "Authorization Failed"} - LocalFalcon MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: ${code ? "#22c55e" : "#ef4444"}; margin-bottom: 20px; }
    .icon { font-size: 64px; color: ${code ? "#22c55e" : "#ef4444"}; margin-bottom: 10px; }
    .instructions { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${code ? "&#10003;" : "&#10007;"}</div>
    <h1>${code ? "Authorization Successful" : "Authorization Failed"}</h1>
    <p class="instructions">${code ? "Completing authentication..." : (errorDescription || "An error occurred")}</p>
    <p class="instructions" id="status">This window will close automatically.</p>
  </div>
  <script>
    (function() {
      var message = ${message};
      // Send to opener via postMessage
      if (window.opener) {
        window.opener.postMessage(message, '*');
        setTimeout(function() { window.close(); }, 1000);
      } else {
        document.getElementById('status').textContent = ${code ? "'Authorization code received. You may close this window.'" : "'Please close this window and try again.'"};
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
function generateSuccessPage(redirectUrl: string): string {
  // Escape for safe embedding in HTML attribute and JS string contexts
  const safeUrl = redirectUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const jsUrl = redirectUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

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
  <script>
    setTimeout(function() { window.location.href = '${jsUrl}'; }, 1000);
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

    // OAuth 2.1: Exact redirect URI matching against registered values
    if (clientRedirectUri && !isRedirectUriRegistered(clientRedirectUri)) {
      console.error(`[OAuth] Unregistered redirect_uri: ${clientRedirectUri}`);
      res.status(400).json({
        error: "invalid_request",
        error_description: "The redirect_uri is not registered. Register the client via POST /register first.",
      });
      return;
    }

    // Use client's state or generate our own
    const state = clientState || generateSecureState();

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
      if (storedState?.clientRedirectUri) {
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

    res.status(400).send(generateCallbackPage(
      null,
      error?.toString() || "authorization_error",
      error_description?.toString() || "Authorization failed"
    ));
    return;
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[OAuth] Missing code or state parameter");
    res.status(400).send(generateCallbackPage(
      null,
      "invalid_request",
      "Missing required parameters"
    ));
    return;
  }

  // Validate state for CSRF protection
  const storedState = stateStore.validate(state as string);
  if (!storedState) {
    console.error("[OAuth] Invalid or expired state parameter");
    res.status(400).send(generateCallbackPage(
      null,
      "invalid_state",
      "The authorization request has expired or is invalid. Please try again."
    ));
    return;
  }

  console.log("[OAuth] Authorization code received, returning to MCP client");

  // If client provided a redirect URI, show a brief success page then redirect
  // to the client with the authorization code and state.
  if (storedState.clientRedirectUri) {
    const redirectUrl = new URL(storedState.clientRedirectUri);
    redirectUrl.searchParams.set("code", code as string);
    redirectUrl.searchParams.set("state", state as string);
    console.log(`[OAuth] Showing success page, will redirect to: ${redirectUrl.toString()}`);
    res.status(200).send(generateSuccessPage(redirectUrl.toString()));
    return;
  }

  // Fallback: Return the authorization code via postMessage for browser-based clients
  console.log("[OAuth] No client redirect_uri, using postMessage fallback");
  res.status(200).send(generateCallbackPage(code as string, null, null));
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

  if (grant_type !== "authorization_code") {
    res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code grant type is supported",
    });
    return;
  }

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

    // Return standard OAuth 2.1 token response
    res.status(200).json({
      access_token: apiKey,
      token_type: "Bearer",
      expires_in: 86400, // 24 hours
      scope: "api",
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
    // Also clear the auth cache for this token
    clearAuthCache(token);
    // RFC 7009: Return 200 OK regardless of whether token was valid
    res.status(200).json({ revoked: true });
  } catch (error) {
    console.error("[OAuth] Revocation failed:", error);
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
