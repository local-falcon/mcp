/**
 * OAuth 2.1 Token Verifier for LocalFalcon MCP Server
 *
 * Implements OAuthTokenVerifier from the MCP SDK to verify Bearer tokens
 * by calling the LocalFalcon account API.
 * Results are cached to avoid excessive API calls.
 */

import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { fetchLocalFalconAccountInfo } from "../localfalcon.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedAuthInfo {
  expiresAt: number;
}

const authCache = new Map<string, CachedAuthInfo>();

// Periodically clean expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authCache) {
    if (now > value.expiresAt) {
      authCache.delete(key);
    }
  }
}, 60 * 1000); // every minute

/**
 * Verify an access token by calling LocalFalcon's account endpoint.
 * Caches the result to avoid redundant API calls.
 */
async function verifyAccessToken(token: string): Promise<AuthInfo> {
  if (!token || token.trim() === "") {
    throw new Error("Missing or empty access token");
  }

  // Check cache first
  const cached = authCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return {
      token,
      clientId: "localfalcon-mcp",
      scopes: ["api"],
      expiresAt: cached.expiresAt / 1000, // SDK expects Unix seconds
    };
  }

  // Verify token by calling account endpoint
  try {
    await fetchLocalFalconAccountInfo(token, "subscription");

    // Cache the result
    const cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    authCache.set(token, {
      expiresAt: cacheExpiresAt,
    });

    return {
      token,
      clientId: "localfalcon-mcp",
      scopes: ["api"],
      expiresAt: cacheExpiresAt / 1000, // SDK expects Unix seconds
    };
  } catch (error) {
    // If account lookup fails, the token is likely invalid
    console.error("[OAuth] Token verification failed:", error);
    throw new Error("Invalid or expired access token");
  }
}

/**
 * Create an OAuthTokenVerifier instance for use with requireBearerAuth middleware
 */
export function createTokenVerifier(): OAuthTokenVerifier {
  return { verifyAccessToken };
}

/**
 * Clear the auth cache (useful for testing or token revocation)
 */
export function clearAuthCache(token?: string): void {
  if (token) {
    authCache.delete(token);
  } else {
    authCache.clear();
  }
}
