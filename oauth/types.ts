/**
 * TypeScript interfaces for OAuth 2.0 implementation
 */

/**
 * Response from the OAuth token endpoint
 * LocalFalcon returns the API key directly in the token response
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  api_key: string; // LocalFalcon-specific: API key returned with token
}

/**
 * Stored OAuth state for CSRF protection
 */
export interface OAuthState {
  state: string;
  createdAt: number;
  redirectUri: string;
  clientRedirectUri?: string; // MCP client's redirect URI for forwarding
  resource?: string; // RFC 8707 resource indicator
}

/**
 * OAuth error response from the authorization server
 */
export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Parameters for the authorization request
 */
export interface AuthorizationParams {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string[];
  responseType?: string;
}

/**
 * Parameters for the token exchange request
 */
export interface TokenExchangeParams {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  grantType?: string;
}
