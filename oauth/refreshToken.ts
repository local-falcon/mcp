/**
 * Stateless, sealed OAuth refresh tokens.
 *
 * A refresh token is the API key it renews, plus an issue time and a unique id,
 * encrypted with AES-256-GCM under a server secret. Nothing needs to be stored to
 * redeem one, so tokens survive deploys, restarts and OOM cycles, and every client
 * holds its own token independent of the account's other connections.
 *
 * Previously tokens lived in an in-memory Map, and issuing one deleted every other
 * token for the same API key. A restart, or another client logging in on the same
 * account, therefore invalidated a client's refresh token, and clients that honour
 * `expires_in` (Grok) were sent back to the login screen roughly daily.
 *
 * What stays in memory is best-effort only: which token ids have been redeemed
 * (replay detection) and which API keys were revoked. The durable guard is the
 * liveness check the refresh grant makes against the Local Falcon API.
 */

import crypto from "crypto";

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * A redeemed token may be presented again for this long. A client whose refresh
 * response was lost (timeout, dropped connection) retries with the token it
 * still holds; rejecting that retry would force a re-login, the very failure
 * this module exists to prevent.
 */
export const REUSE_GRACE_MS = 2 * 60 * 1000;

const PREFIX = "lfr1.";
const AAD = Buffer.from("lfr1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TRACKED_IDS = 50_000;

interface Payload {
  k: string; // API key
  iat: number; // issued at, ms
  jti: string; // unique token id
}

export interface OpenedRefreshToken {
  apiKey: string;
  issuedAt: number;
  id: string;
}

// ── Key ──────────────────────────────────────────────────────────────────────

let cachedKey: Buffer | null = null;
let ephemeral = false;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.OAUTH_REFRESH_TOKEN_SECRET?.trim();
  if (secret) {
    cachedKey = Buffer.from(
      crypto.hkdfSync("sha256", secret, "lf-mcp", "refresh-token v1", 32)
    );
    ephemeral = false;
  } else {
    cachedKey = crypto.randomBytes(32);
    ephemeral = true;
  }
  return cachedKey;
}

/**
 * Log the secret's state once, when the OAuth routes are mounted. Without a
 * stable secret the key is random per process, so every restart invalidates
 * every refresh token: the old behaviour, preserved so nothing breaks, but loud.
 */
export function reportRefreshTokenSecret(): void {
  getKey();
  const secret = process.env.OAUTH_REFRESH_TOKEN_SECRET?.trim() ?? "";
  if (ephemeral) {
    console.warn(
      "[OAuth] WARNING: OAUTH_REFRESH_TOKEN_SECRET is not set. Refresh tokens are sealed " +
        "with a per-process random key, so every restart or deploy invalidates them and " +
        "clients that refresh (e.g. Grok) must log in again. Set it to a stable value " +
        "shared by all instances (openssl rand -hex 32)."
    );
  } else if (secret.length < 32) {
    console.warn("[OAuth] WARNING: OAUTH_REFRESH_TOKEN_SECRET is shorter than 32 characters.");
  } else {
    console.log("[OAuth] Refresh tokens: stateless, sealed with OAUTH_REFRESH_TOKEN_SECRET.");
  }
}

/** Test hook: re-read the secret and forget all in-memory state. */
export function resetRefreshTokenState(): void {
  cachedKey = null;
  ephemeral = false;
  redeemed.clear();
  revokedKeys.clear();
}

// ── Seal / open ──────────────────────────────────────────────────────────────

export function sealRefreshToken(apiKey: string, now = Date.now()): string {
  const payload: Payload = { k: apiKey, iat: now, jti: crypto.randomBytes(16).toString("hex") };
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64url");
}

/**
 * Decrypt and validate a refresh token. Returns null for anything forged,
 * tampered with, sealed under another secret, expired, or revoked. Does not
 * check reuse; see redeemRefreshToken.
 */
export function openRefreshToken(token: unknown, now = Date.now()): OpenedRefreshToken | null {
  if (typeof token !== "string" || !token.startsWith(PREFIX)) return null;
  const raw = Buffer.from(token.slice(PREFIX.length), "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;

  let payload: Payload;
  try {
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.k !== "string" || !payload.k || typeof payload.iat !== "number" ||
      typeof payload.jti !== "string") {
    return null;
  }
  if (payload.iat > now + 60_000 || now - payload.iat > REFRESH_TOKEN_TTL_MS) return null;

  const revokedAt = revokedKeys.get(hashKey(payload.k));
  if (revokedAt !== undefined && payload.iat <= revokedAt) return null;

  return { apiKey: payload.k, issuedAt: payload.iat, id: payload.jti };
}

// ── Rotation / replay ────────────────────────────────────────────────────────

// jti -> first redemption time. Bounded; insertion order is redemption order.
const redeemed = new Map<string, number>();

/**
 * Mark a token as redeemed. Returns false if it was already redeemed outside
 * the grace window, i.e. a replay of a rotated-out token.
 */
export function redeemRefreshToken(opened: OpenedRefreshToken, now = Date.now()): boolean {
  const first = redeemed.get(opened.id);
  if (first !== undefined) return now - first <= REUSE_GRACE_MS;
  redeemed.set(opened.id, now);
  while (redeemed.size > MAX_TRACKED_IDS) redeemed.delete(redeemed.keys().next().value!);
  return true;
}

// ── Revocation ───────────────────────────────────────────────────────────────

// sha256(apiKey) -> revocation time. Tokens issued at or before it are rejected.
const revokedKeys = new Map<string, number>();

function hashKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function revokeRefreshTokensForApiKey(apiKey: string, now = Date.now()): void {
  revokedKeys.set(hashKey(apiKey), now);
  while (revokedKeys.size > MAX_TRACKED_IDS) revokedKeys.delete(revokedKeys.keys().next().value!);
}

// Entries older than the TTL can no longer match a live token.
setInterval(() => {
  const cutoff = Date.now() - REFRESH_TOKEN_TTL_MS;
  for (const [id, at] of redeemed) if (at < cutoff) redeemed.delete(id); else break;
  for (const [k, at] of revokedKeys) if (at < cutoff) revokedKeys.delete(k);
}, 60 * 60 * 1000).unref();
