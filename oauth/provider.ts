/**
 * OAuth 2.1 Token Verifier for LocalFalcon MCP Server
 *
 * Implements OAuthTokenVerifier from the MCP SDK to verify Bearer tokens
 * and determine isPro status by calling the LocalFalcon account API.
 * Results are cached to avoid excessive API calls.
 */

import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { fetchLocalFalconAccountInfo } from "../localfalcon.js";

const IS_PRO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedAuthInfo {
  isPro: boolean;
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
 * Determines isPro status and caches the result.
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
      extra: { isPro: cached.isPro },
    };
  }

  // Verify token by calling account endpoint
  try {
    const accountInfo = await fetchLocalFalconAccountInfo(token, "subscription");

    // Determine isPro from subscription data
    // The exact field depends on LocalFalcon's API response structure
    const isPro =
      accountInfo?.data?.is_pro === true ||
      accountInfo?.data?.plan === "pro" ||
      accountInfo?.data?.subscription_type === "pro" ||
      accountInfo?.is_pro === true ||
      accountInfo?.plan === "pro" ||
      false;

    // Cache the result
    authCache.set(token, {
      isPro,
      expiresAt: Date.now() + IS_PRO_CACHE_TTL_MS,
    });

    return {
      token,
      clientId: "localfalcon-mcp",
      scopes: ["api"],
      extra: { isPro },
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
