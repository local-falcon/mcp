/**
 * OAuth 2.0 Express Route Handlers for LocalFalcon MCP Server
 */

import type { Application, Request, Response } from "express";
import { OAUTH_CONFIG } from "./config.js";
import { stateStore } from "./stateStore.js";
import {
  generateSecureState,
  exchangeCodeForToken,
  OAuthError,
} from "./oauthClient.js";

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
 * GET /oauth/authorize
 * Initiates the OAuth flow by redirecting to LocalFalcon's authorization endpoint
 * Forwards MCP client's OAuth parameters (state, PKCE) to upstream provider
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

    // Use client's state or generate our own
    const state = clientState || generateSecureState();

    // Store state for CSRF validation, including client's redirect URI if provided
    stateStore.set(state, {
      createdAt: Date.now(),
      redirectUri,
      clientRedirectUri,
    });

    // Build authorization URL with all parameters
    const url = new URL(OAUTH_CONFIG.authorizationUrl);
    url.searchParams.set("client_id", OAUTH_CONFIG.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    // Forward PKCE parameters if provided
    if (codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", codeChallengeMethod || "S256");
    }

    // Forward scope if provided, otherwise use default
    if (scope) {
      url.searchParams.set("scope", scope);
    } else if (OAUTH_CONFIG.scopes.length > 0) {
      url.searchParams.set("scope", OAUTH_CONFIG.scopes.join(" "));
    }

    console.log(`[OAuth] Redirecting to authorization URL: ${url.toString()}`);
    console.log(`[OAuth] Client params - state: ${clientState ? "provided" : "generated"}, PKCE: ${codeChallenge ? "yes" : "no"}`);
    res.redirect(url.toString());
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
 * Handles the OAuth callback - returns authorization code to MCP client
 * The MCP client will exchange the code via POST /oauth/token with its PKCE verifier
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

  // If client provided a redirect URI, show success page that redirects
  // This is the standard OAuth 2.0 flow for MCP clients
  if (storedState.clientRedirectUri) {
    const redirectUrl = new URL(storedState.clientRedirectUri);
    redirectUrl.searchParams.set("code", code as string);
    redirectUrl.searchParams.set("state", state as string);
    console.log(`[OAuth] Redirecting to client redirect_uri: ${redirectUrl.toString()}`);
    res.status(200).send(generateSuccessRedirectPage(redirectUrl.toString()));
    return;
  }

  // Fallback: Return the authorization code via postMessage for browser-based clients
  // This only works if the window was opened via window.open() from a parent page
  console.log("[OAuth] No client redirect_uri, using postMessage fallback");
  res.status(200).send(generateCallbackPage(code as string, null, null));
}

/**
 * Generate success page that redirects to client's callback URL
 * Shows a success message while completing the OAuth flow
 */
function generateSuccessRedirectPage(redirectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Successful - LocalFalcon MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: #22c55e; margin-bottom: 20px; }
    .icon { font-size: 64px; color: #22c55e; margin-bottom: 10px; }
    .instructions { color: #666; line-height: 1.6; }
    .spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #ccc; border-top-color: #22c55e; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#10003;</div>
    <h1>Authorization Successful</h1>
    <p class="instructions"><span class="spinner"></span>Completing authentication...</p>
    <p class="instructions" id="status">You can close this window once authentication completes.</p>
  </div>
  <script>
    // Redirect to complete the OAuth flow
    setTimeout(function() {
      window.location.href = ${JSON.stringify(redirectUrl)};
    }, 500);

    // Update status after redirect attempt
    setTimeout(function() {
      document.getElementById('status').innerHTML = 'If you are not redirected automatically, <a href="${escapeHtml(redirectUrl)}">click here</a>.';
    }, 3000);

    // Show close message after 30 seconds
    setTimeout(function() {
      document.getElementById('status').innerHTML = 'Authentication complete. You may close this window.';
    }, 30000);
  </script>
</body>
</html>`;
}

/**
 * Generate HTML error page
 */
function generateErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - LocalFalcon MCP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #ef4444;
      margin-bottom: 20px;
    }
    .error-message {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      padding: 15px;
      color: #991b1b;
      margin: 20px 0;
    }
    .retry-btn {
      background: #0ea5e9;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
    }
    .retry-btn:hover {
      background: #0284c7;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(title)}</h1>
    <div class="error-message">${escapeHtml(message)}</div>
    <a href="/oauth/authorize" class="retry-btn">Try Again</a>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string | undefined | null): string {
  if (text == null) {
    return "";
  }
  const str = String(text);
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Handle token exchange request from MCP client
 * POST /oauth/token - exchanges authorization code for access token
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

  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = req.body;

  console.log("[OAuth] Token exchange request received:", {
    contentType: req.headers['content-type'],
    grant_type,
    code: code ? "[PRESENT]" : "[MISSING]",
    redirect_uri,
    client_id,
    client_secret: client_secret ? "[PRESENT]" : "[MISSING]",
    code_verifier: code_verifier ? "[PRESENT]" : "[MISSING]",
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

  try {
    // Exchange code for token with LocalFalcon (forwarding PKCE verifier if provided)
    const tokenResponse = await exchangeCodeForToken(
      code as string,
      redirect_uri || getRedirectUri(req),
      code_verifier
    );

    console.log("[OAuth] Token response from LocalFalcon:", Object.keys(tokenResponse));

    // Extract API key from response
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

    // Return standard OAuth token response
    res.status(200).json({
      access_token: apiKey,
      token_type: "Bearer",
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
 * Set up OAuth routes on the Express application
 */
export function setupOAuthRoutes(app: Application): void {
  // Authorization endpoint - initiates OAuth flow
  app.get("/oauth/authorize", (req, res) => {
    handleAuthorize(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in authorize:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  });

  // Token endpoint - exchanges code for access token (for MCP clients)
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

  console.log("[OAuth] Routes registered: GET /oauth/authorize, GET /oauth/callback");
}
