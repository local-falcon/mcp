/**
 * OAuth 2.0 Module for LocalFalcon MCP Server
 *
 * This module provides OAuth 2.0 authorization code flow support for
 * authenticating users via LocalFalcon and retrieving their API keys.
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
  OAuthError,
} from "./oauthClient.js";

// Express routes
export { setupOAuthRoutes } from "./routes.js";
