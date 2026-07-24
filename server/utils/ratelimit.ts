// Rate limiting for MCP server write operations
// Implements token bucket algorithm for AI operations

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
