/**
 * OAuth 2.0 Client for LocalFalcon authentication
 * Handles authorization URL generation and token exchange
 */

import crypto from "crypto";
import { OAUTH_CONFIG } from "./config.js";
import type { OAuthTokenResponse, OAuthErrorResponse } from "./types.js";

/**
 * Generate a cryptographically secure random state string
 */
export function generateSecureState(): string {
  return crypto.randomBytes(OAUTH_CONFIG.stateLength).toString("hex");
}

/**
 * Build the authorization URL for redirecting users to LocalFalcon OAuth
 */
export function generateAuthorizationUrl(
  redirectUri: string,
  state: string
): string {
  const url = new URL(OAUTH_CONFIG.authorizationUrl);

  url.searchParams.set("client_id", OAUTH_CONFIG.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", OAUTH_CONFIG.responseType);
  url.searchParams.set("state", state);

  if (OAUTH_CONFIG.scopes.length > 0) {
    url.searchParams.set("scope", OAUTH_CONFIG.scopes.join(" "));
  }

  return url.toString();
}

/**
 * Exchange an authorization code for an access token and API key
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: OAUTH_CONFIG.grantType,
    code: code,
    redirect_uri: redirectUri,
    client_id: OAUTH_CONFIG.clientId,
    client_secret: OAUTH_CONFIG.clientSecret,
  });

  // Add PKCE code_verifier if provided
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  // Create Basic auth header for client credentials
  const basicAuth = Buffer.from(
    `${OAUTH_CONFIG.clientId}:${OAUTH_CONFIG.clientSecret}`
  ).toString("base64");

  console.log("[OAuth] Token exchange request:", {
    url: OAUTH_CONFIG.tokenUrl,
    redirect_uri: redirectUri,
    grant_type: OAUTH_CONFIG.grantType,
    client_id: OAUTH_CONFIG.clientId,
    client_secret: OAUTH_CONFIG.clientSecret ? "[SET]" : "[MISSING]",
    body: body.toString(),
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  // Get the raw response text first
  const responseText = await response.text();

  console.log("[OAuth] Token endpoint response:", {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    body: responseText.substring(0, 500), // Log first 500 chars
  });

  // Try to parse as JSON
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error("[OAuth] Failed to parse token response as JSON:", responseText);
    throw new OAuthError(
      `Token endpoint returned invalid JSON. Status: ${response.status}. Response: ${responseText.substring(0, 200)}`,
      "invalid_response",
      response.status
    );
  }

  if (!response.ok) {
    const errorData = data as OAuthErrorResponse;
    const errorMessage =
      errorData.error_description ||
      errorData.error ||
      "Token exchange failed";
    throw new OAuthError(errorMessage, errorData.error, response.status);
  }

  return data as OAuthTokenResponse;
}

/**
 * Revoke an access token (RFC 7009)
 * Called when a client disconnects to invalidate their token
 */
export async function revokeToken(token: string): Promise<void> {
  const body = new URLSearchParams({
    token: token,
    token_type_hint: "access_token",
    client_id: OAUTH_CONFIG.clientId,
    client_secret: OAUTH_CONFIG.clientSecret,
  });

  // Create Basic auth header for client credentials
  const basicAuth = Buffer.from(
    `${OAUTH_CONFIG.clientId}:${OAUTH_CONFIG.clientSecret}`
  ).toString("base64");

  console.log("[OAuth] Revoking token:", {
    url: OAUTH_CONFIG.revocationUrl,
    tokenPrefix: token ? token.substring(0, 8) + '...' : 'none',
    clientId: OAUTH_CONFIG.clientId,
  });

  try {
    console.log("[OAuth] Sending revocation request to:", OAUTH_CONFIG.revocationUrl);
    const response = await fetch(OAUTH_CONFIG.revocationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    const responseText = await response.text();

    // RFC 7009: Revocation endpoint returns 200 even if token was already invalid
    if (response.ok) {
      console.log("[OAuth] Token revoked successfully:", {
        status: response.status,
        body: responseText.substring(0, 200),
      });
    } else {
      console.error("[OAuth] Token revocation failed:", {
        status: response.status,
        statusText: response.statusText,
        body: responseText.substring(0, 200),
      });
    }
  } catch (error) {
    // Don't throw on revocation errors - it's a best-effort cleanup
    console.error("[OAuth] Token revocation network error:", error);
  }
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: OAUTH_CONFIG.clientId,
    client_secret: OAUTH_CONFIG.clientSecret,
  });

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    const errorData = data as OAuthErrorResponse;
    const errorMessage =
      errorData.error_description ||
      errorData.error ||
      "Token refresh failed";
    throw new OAuthError(errorMessage, errorData.error, response.status);
  }

  return data as OAuthTokenResponse;
}

/**
 * Custom error class for OAuth-specific errors
 */
export class OAuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = "oauth_error", statusCode: number = 400) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
