/**
 * OAuth 2.1 Token Verifier for LocalFalcon MCP Server
 *
 * Implements OAuthTokenVerifier from the MCP SDK to verify Bearer tokens
 * by calling the LocalFalcon account API.
 * Results are cached to avoid excessive API calls.
 *
 * Key behaviors:
 * - Verification results are cached for 1 hour to reduce API calls
 * - Transient failures (network, timeout, 5xx) are retried with exponential backoff
 * - Transient failures are distinguished from genuine auth failures (401/403)
 *   so that intermittent API issues don't force unnecessary re-authentication
 */

import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { fetchLocalFalconAccountInfo } from "../localfalcon.js";

// Cache verification results for 1 hour. The access token itself is valid for 24h,
// so re-verifying every 5 minutes (the old value) was unnecessarily aggressive and
// exposed us to transient API failures that got misreported as expired tokens.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Retry configuration for token verification API calls
const VERIFY_MAX_RETRIES = 2;
const VERIFY_INITIAL_DELAY_MS = 500;

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
 * Determines if a verification error is transient (network/timeout/server)
 * vs. a genuine auth rejection (invalid API key, 401, 403).
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();

  // Network-level failures
  if (error.name === "AbortError") return true;
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("econnrefused")
      || msg.includes("econnreset") || msg.includes("enotfound") || msg.includes("fetch failed")) {
    return true;
  }

  // Server errors (5xx) are transient
  if (msg.includes("api error: 5")) return true;

  // Rate limiting is transient
  if (msg.includes("api error: 429") || msg.includes("rate limit")) return true;

  return false;
}

/**
 * Verify the token against the LocalFalcon API with retry for transient errors.
 * Throws a typed error so the caller can distinguish transient vs auth failures.
 */
async function verifyTokenWithRetry(token: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= VERIFY_MAX_RETRIES; attempt++) {
    try {
      await fetchLocalFalconAccountInfo(token, "subscription");
      return; // Success
    } catch (error) {
      lastError = error;

      if (attempt < VERIFY_MAX_RETRIES && isTransientError(error)) {
        const delayMs = VERIFY_INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[OAuth] Token verification transient failure (attempt ${attempt + 1}/${VERIFY_MAX_RETRIES + 1}), retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : error
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Not retryable or out of retries — rethrow
      break;
    }
  }

  throw lastError;
}

/**
 * Verify an access token by calling LocalFalcon's account endpoint.
 * Caches the result to avoid redundant API calls.
 *
 * Error handling strategy:
 * - Transient errors (network, timeout, 5xx): Returns a 503 with "temporarily_unavailable"
 *   so the client knows to retry rather than re-authenticate.
 * - Auth errors (401, 403, invalid key): Returns the standard "invalid_token" error
 *   so the client knows to re-authenticate.
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

  // Verify token by calling account endpoint (with retry for transient errors)
  try {
    await verifyTokenWithRetry(token);

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
    // Distinguish transient failures from genuine auth rejections
    if (isTransientError(error)) {
      console.error("[OAuth] Token verification failed due to transient error (after retries):", error);
      // Throw a structured error the middleware can map to 503 instead of 401
      const transientErr = new Error("Token verification temporarily unavailable");
      (transientErr as any).code = "temporarily_unavailable";
      (transientErr as any).status = 503;
      throw transientErr;
    }

    // Genuine auth failure — token is invalid or revoked
    console.error("[OAuth] Token verification failed — invalid or expired token:", error);
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
