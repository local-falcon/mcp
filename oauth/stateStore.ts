/**
 * In-memory store for OAuth state parameters (CSRF protection)
 * States automatically expire after the configured TTL
 */

import { OAUTH_CONFIG } from "./config.js";
import type { OAuthState } from "./types.js";

class StateStore {
  private states = new Map<string, OAuthState>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every minute to remove expired states
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Store a new OAuth state
   */
  set(state: string, data: Omit<OAuthState, "state">): void {
    this.states.set(state, {
      state,
      ...data,
    });
  }

  /**
   * Retrieve and validate an OAuth state
   * Returns the state data if valid, null if not found or expired
   */
  get(state: string): OAuthState | null {
    const stored = this.states.get(state);

    if (!stored) {
      return null;
    }

    // Check if state has expired
    const now = Date.now();
    if (now - stored.createdAt > OAUTH_CONFIG.stateExpirationMs) {
      this.states.delete(state);
      return null;
    }

    return stored;
  }

  /**
   * Validate and consume a state (one-time use)
   * Returns the state data if valid, null otherwise
   */
  validate(state: string): OAuthState | null {
    const stored = this.get(state);

    if (stored) {
      this.states.delete(state);
    }

    return stored;
  }

  /**
   * Delete a specific state
   */
  delete(state: string): boolean {
    return this.states.delete(state);
  }

  /**
   * Remove all expired states
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [state, data] of this.states) {
      if (now - data.createdAt > OAUTH_CONFIG.stateExpirationMs) {
        this.states.delete(state);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[OAuth] Cleaned up ${expiredCount} expired state(s)`);
    }
  }

  /**
   * Get the number of active states
   */
  size(): number {
    return this.states.size;
  }

  /**
   * Stop the cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.states.clear();
  }
}

// Singleton instance
export const stateStore = new StateStore();
