/**
 * OAuth 2.0 Express Route Handlers for LocalFalcon MCP Server
 */

import type { Application, Request, Response } from "express";
import { OAUTH_CONFIG } from "./config.js";
import { stateStore } from "./stateStore.js";
import {
  generateSecureState,
  generateAuthorizationUrl,
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
 * GET /oauth/authorize
 * Initiates the OAuth flow by redirecting to LocalFalcon's authorization endpoint
 */
async function handleAuthorize(req: Request, res: Response): Promise<void> {
  try {
    const state = generateSecureState();
    const redirectUri = getRedirectUri(req);

    // Store state for CSRF validation
    stateStore.set(state, {
      createdAt: Date.now(),
      redirectUri,
    });

    // Generate authorization URL and redirect
    const authUrl = generateAuthorizationUrl(redirectUri, state);

    console.log(`[OAuth] Redirecting to authorization URL: ${authUrl}`);
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
 * Handles the OAuth callback, exchanges code for token, and returns API key
 */
async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error, error_description } = req.query;

  // Handle errors from OAuth provider
  if (error) {
    console.error(`[OAuth] Authorization error: ${error} - ${error_description}`);
    res.status(400).send(generateErrorPage(
      "Authorization Failed",
      error_description?.toString() || error?.toString() || "Unknown error"
    ));
    return;
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("[OAuth] Missing code or state parameter");
    res.status(400).send(generateErrorPage(
      "Invalid Request",
      "Missing required parameters"
    ));
    return;
  }

  // Validate state for CSRF protection
  const storedState = stateStore.validate(state as string);
  if (!storedState) {
    console.error("[OAuth] Invalid or expired state parameter");
    res.status(400).send(generateErrorPage(
      "Invalid State",
      "The authorization request has expired or is invalid. Please try again."
    ));
    return;
  }

  try {
    // Exchange code for token
    console.log("[OAuth] Exchanging authorization code for token...");
    const tokenResponse = await exchangeCodeForToken(
      code as string,
      storedState.redirectUri
    );

    // Log full response to debug field names
    console.log("[OAuth] Token response fields:", Object.keys(tokenResponse));
    console.log("[OAuth] Full token response:", JSON.stringify(tokenResponse, null, 2));

    // Try multiple possible field names for API key
    const apiKey =
      (tokenResponse as any).data.api_key ||
      (tokenResponse as any).api_key ||
      (tokenResponse as any).apiKey ||
      (tokenResponse as any).access_token ||
      (tokenResponse as any).token ||
      (tokenResponse as any).key;

    if (!apiKey) {
      console.error("[OAuth] No API key found in response. Available fields:", Object.keys(tokenResponse));
      res.status(500).send(generateErrorPage(
        "Authentication Failed",
        "No API key was returned from the server. Please contact support."
      ));
      return;
    }

    console.log("[OAuth] Token exchange successful, API key received");

    // Store API key in secure HTTP-only cookie for automatic MCP authentication
    res.cookie("local_falcon_api_key", apiKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/",
    });

    console.log("[OAuth] API key stored in cookie for automatic MCP authentication");

    // Return success page with API key
    res.status(200).send(generateSuccessPage(apiKey));
  } catch (error) {
    console.error("[OAuth] Token exchange failed:", error);

    if (error instanceof OAuthError) {
      res.status(error.statusCode).send(generateErrorPage(
        "Authentication Failed",
        error.message
      ));
    } else {
      res.status(500).send(generateErrorPage(
        "Authentication Failed",
        "An unexpected error occurred during authentication. Please try again."
      ));
    }
  }
}

/**
 * Generate HTML success page with API key
 */
function generateSuccessPage(apiKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful - LocalFalcon MCP</title>
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
      text-align: center;
    }
    h1 {
      color: #22c55e;
      margin-bottom: 20px;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 20px;
    }
    .status {
      color: #666;
      line-height: 1.6;
      margin: 20px 0;
    }
    .closing {
      color: #0ea5e9;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">&#10004;</div>
    <h1>Authentication Successful</h1>
    <p class="status">Your API key has been saved.</p>
    <p class="status closing" id="statusMsg">Connecting to MCP server...</p>
  </div>
  <script>
    const apiKey = "${apiKey.replace(/"/g, '\\"')}";

    // Notify opener window to connect to MCP
    if (window.opener) {
      try {
        window.opener.postMessage({
          type: 'LOCAL_FALCON_OAUTH_SUCCESS',
          apiKey: apiKey
        }, '*');
      } catch (e) {
        console.log('Could not notify opener:', e);
      }
    }

    // Close window after brief delay
    setTimeout(() => {
      document.getElementById('statusMsg').textContent = 'Closing window...';
      setTimeout(() => {
        window.close();
        // If window.close() fails (not opened by script), show message
        document.getElementById('statusMsg').textContent = 'You can close this window now.';
      }, 500);
    }, 1500);
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

  // Callback endpoint - handles OAuth response
  app.get("/oauth/callback", (req, res) => {
    handleCallback(req, res).catch((err) => {
      console.error("[OAuth] Unhandled error in callback:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  });

  console.log("[OAuth] Routes registered: GET /oauth/authorize, GET /oauth/callback");
}
