/**
 * OAuth 2.0 Configuration for LocalFalcon MCP Server
 *
 * Client credentials are hardcoded as per requirements.
 * Update clientId and clientSecret with actual values before deployment.
 */

export const OAUTH_CONFIG = {
  // Client credentials (hardcoded)
  clientId: "74e0d6e848652234efed.localfalconapps.com",
  clientSecret: "71fdc6383c274334095fec457fb2085d73451a79fd030e460c69a6f3db00af0b",

  // OAuth endpoints
  authorizationUrl: "https://staging.localfalcon.com/oauth-v2/authorize",
  tokenUrl: "https://staging.localfalcon.com/oauth-v2/token",
  revocationUrl: "https://staging.localfalcon.com/oauth-v2/revoke",

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
