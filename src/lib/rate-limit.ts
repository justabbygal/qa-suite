/**
 * Sliding window rate limiter using in-memory storage.
 *
 * NOTE: In a serverless environment (Vercel), each function instance has its
 * own memory. For distributed rate limiting across instances, replace the
 * in-memory store with a Redis/Upstash-backed solution.
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp in ms
  retryAfter?: number; // Seconds until the window resets
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** Invite creation: 10 per hour per user */
export const INVITE_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
};

/** IP-level guard applied in middleware: 50 per hour per IP */
export const IP_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 50,
  windowMs: 60 * 60 * 1000,
};

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

/**
 * Check whether the given identifier is within its rate limit.
 * Increments the counter when the request is allowed.
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = INVITE_RATE_LIMIT
): RateLimitResult {
  purgeExpired();

  const now = Date.now();
  const existing = store.get(identifier);

  // No entry or window has expired — start a fresh window
  if (!existing || now > existing.resetAt) {
    const resetAt = now + config.windowMs;
    store.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  // Window is active and limit is hit
  if (existing.count >= config.maxRequests) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter,
    };
  }

  // Window is active, increment and allow
  existing.count += 1;
  store.set(identifier, existing);
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Build standard rate-limit response headers from a RateLimitResult.
 */
export function getRateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig = INVITE_RATE_LIMIT
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
  };

  if (!result.allowed && result.retryAfter !== undefined) {
    headers["Retry-After"] = result.retryAfter.toString();
  }

  return headers;
}
