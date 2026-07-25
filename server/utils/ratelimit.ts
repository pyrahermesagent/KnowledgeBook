// Rate limiting for MCP server write operations
// Implements token bucket algorithm for AI operations

import type { H3Event } from 'h3';

interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize: number;
  windowMs: number;
}

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

const defaultConfig: RateLimitConfig = {
  requestsPerMinute: 60, // 1 request per second average
  burstSize: 10, // Allow 10 requests at once
  windowMs: 60 * 1000, // 1 minute window
};

const perUserLimits = new Map<string, RateLimitState>();

/**
 * Check if a request is allowed under rate limits
 * Returns { allowed: true } or { allowed: false, retryAfter: number }
 */
export function checkRateLimit(
  userId: string,
  config: RateLimitConfig = defaultConfig
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let state = perUserLimits.get(userId);

  if (!state) {
    state = {
      tokens: config.burstSize,
      lastRefill: now,
    };
    perUserLimits.set(userId, state);
  }

  // Refill tokens based on time elapsed
  const elapsed = now - state.lastRefill;
  const tokensToAdd = (elapsed / 1000) * (config.requestsPerMinute / 60);

  if (tokensToAdd > 0) {
    state.tokens = Math.min(config.burstSize, state.tokens + tokensToAdd);
    state.lastRefill = now;
  }

  if (state.tokens >= 1) {
    state.tokens -= 1;
    return { allowed: true };
  }

  // Calculate retry after
  const retryAfter = Math.ceil((1 - state.tokens) * (1000 / (config.requestsPerMinute / 60)));
  return { allowed: false, retryAfter };
}

/**
 * Reset rate limit for a user (for testing or admin override)
 */
export function resetRateLimit(userId: string): void {
  perUserLimits.delete(userId);
}

/**
 * Get current rate limit stats for a user
 */
export function getRateLimitStats(userId: string): {
  currentTokens: number;
  maxTokens: number;
} | null {
  const state = perUserLimits.get(userId);
  if (!state) return null;
  return {
    currentTokens: state.tokens,
    maxTokens: defaultConfig.burstSize,
  };
}

/**
 * Rate limit check middleware for H3 events
 */
export function withRateLimit(
  userId: string,
  config: RateLimitConfig = defaultConfig
): { allowed: boolean; retryAfter?: number } {
  return checkRateLimit(userId, config);
}

/**
 * Stricter budget for unauthenticated auth endpoints.
 *
 * Signature verification is the expensive, brute-forceable part of wallet
 * login, so these are limited far below the general API budget.
 */
const authConfig: RateLimitConfig = {
  requestsPerMinute: 10,
  burstSize: 5,
  windowMs: 60 * 1000,
};

/**
 * Enforce a per-IP rate limit on an auth endpoint, throwing 429 when exceeded.
 *
 * Auth endpoints run before a session identity exists, so these bucket on the
 * client IP rather than a user ID. `scope` keeps each endpoint's budget
 * separate, so exhausting nonce requests does not also lock out login.
 */
export function requireAuthRateLimit(event: H3Event, scope: string): void {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  const { allowed, retryAfter } = checkRateLimit(`auth:${scope}:${ip}`, authConfig);

  if (!allowed) {
    throw createError({
      statusCode: 429,
      message: 'Too many requests, please slow down',
      data: { retryAfter },
    });
  }
}
