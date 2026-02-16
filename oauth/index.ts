/**
 * OAuth 2.1 Module for LocalFalcon MCP Server
 *
 * This module provides OAuth 2.1 authorization code flow support for
 * authenticating users via LocalFalcon and retrieving their API keys.
 *
 * OAuth 2.1 compliance:
 * - PKCE mandatory with S256
 * - Bearer-only token transport
 * - Resource indicators (RFC 8707)
 * - Token revocation (RFC 7009)
 */

// Configuration
export { OAUTH_CONFIG } from "./config.js";

// Types
export type {
  OAuthTokenResponse,
  OAuthErrorResponse,
  OAuthState,
  AuthorizationParams,
  TokenExchangeParams,
} from "./types.js";

// State management
export { stateStore } from "./stateStore.js";

// OAuth client functions
export {
  generateSecureState,
  generateAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  revokeToken,
  OAuthError,
} from "./oauthClient.js";

// Token verifier for SDK's requireBearerAuth middleware
export { createTokenVerifier, clearAuthCache } from "./provider.js";

// Client registration store (redirect URI validation)
export { registerRedirectUris, isRedirectUriRegistered } from "./clientStore.js";

// Express routes
export { setupOAuthRoutes } from "./routes.js";
