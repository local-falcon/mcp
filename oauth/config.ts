/**
 * OAuth 2.0 Configuration for LocalFalcon MCP Server
 *
 * Client credentials are hardcoded as per requirements.
 * Update clientId and clientSecret with actual values before deployment.
 */

export const OAUTH_CONFIG = {
  // Client credentials (hardcoded)
  clientId: "74e0d6e848652234efed.localfalconapps.com",
  clientSecret: process.env.OAUTH_CLIENT_SECRET || '',

  // OAuth endpoints
  authorizationUrl: "https://www.localfalcon.com/oauth-v2/authorize",
  tokenUrl: "https://www.localfalcon.com/oauth-v2/token",
  revocationUrl: "https://www.localfalcon.com/oauth-v2/revoke",

  // OAuth settings
  scopes: ["api"],
  responseType: "code",
  grantType: "authorization_code",

  // Callback configuration
  callbackPath: "/oauth/callback",

  // Security settings
  stateExpirationMs: 10 * 60 * 1000, // 10 minutes
  stateLength: 32, // bytes for random state
};
