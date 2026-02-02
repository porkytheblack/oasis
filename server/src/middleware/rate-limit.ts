import type { MiddlewareHandler, Context } from "hono";
import type {
  RateLimitConfig,
  RateLimitInfo,
  RateLimitErrorResponse,
} from "../types/index.js";

/**
 * In-memory storage for rate limit tracking.
 *
 * Structure: Map<clientKey, { count: number, windowStart: number }>
 *
 * In production with multiple instances, this should be replaced with
 * a distributed store like Redis.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Cleanup interval for expired rate limit entries (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Maximum age for entries before they are considered stale (2x the longest window)
 */
const MAX_ENTRY_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Periodically clean up expired rate limit entries to prevent memory leaks.
 */
function startCleanupInterval(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > MAX_ENTRY_AGE_MS) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start the cleanup interval
startCleanupInterval();

/**
 * Default rate limit configurations for different endpoint types.
 */
export const defaultRateLimitConfigs = {
  /**
   * Public endpoints (update checks) - relatively permissive
   * 60 requests per minute per IP
   */
  public: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  } satisfies RateLimitConfig,

  /**
   * Admin endpoints - more restrictive
   * 100 requests per minute per API key
   */
  admin: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  } satisfies RateLimitConfig,

  /**
   * CI endpoints - balanced for automation
   * 30 requests per minute per API key
   */
  ci: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  } satisfies RateLimitConfig,
};

/**
 * Extracts a client identifier from the request.
 *
 * For authenticated requests, uses the API key ID.
 * For unauthenticated requests, uses the client IP address.
 *
 * @param c - Hono context
 * @returns Client identifier string
 */
function getClientKey(c: Context): string {
  // Try to get API key ID from context (set by auth middleware)
  const apiKey = c.get("apiKey");
  if (apiKey?.id) {
    return `key:${apiKey.id}`;
  }

  // Fall back to IP address
  const forwardedFor = c.req.header("X-Forwarded-For");
  if (forwardedFor) {
    // Get the first IP in the chain (original client)
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return `ip:${firstIp}`;
    }
  }

  // Try CF-Connecting-IP (Cloudflare)
  const cfIp = c.req.header("CF-Connecting-IP");
  if (cfIp) {
    return `ip:${cfIp}`;
  }

  // Try X-Real-IP
  const realIp = c.req.header("X-Real-IP");
  if (realIp) {
    return `ip:${realIp}`;
  }

  // Fallback to a default key (should rarely happen)
  return "ip:unknown";
}

/**
 * Checks if a request should be rate limited and updates the counter.
 *
 * @param clientKey - The client identifier
 * @param config - Rate limit configuration
 * @returns Rate limit info including whether the request is allowed
 */
function checkRateLimit(
  clientKey: string,
  config: RateLimitConfig
): RateLimitInfo & { allowed: boolean } {
  const now = Date.now();
  const entry = rateLimitStore.get(clientKey);

  // If no entry exists or the window has expired, create a new one
  if (!entry || now - entry.windowStart >= config.windowMs) {
    rateLimitStore.set(clientKey, {
      count: 1,
      windowStart: now,
    });

    return {
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: Math.ceil((now + config.windowMs) / 1000),
      allowed: true,
    };
  }

  // Check if limit is exceeded
  if (entry.count >= config.maxRequests) {
    const resetTime = Math.ceil((entry.windowStart + config.windowMs) / 1000);
    return {
      limit: config.maxRequests,
      remaining: 0,
      reset: resetTime,
      allowed: false,
    };
  }

  // Increment counter
  entry.count += 1;

  return {
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    reset: Math.ceil((entry.windowStart + config.windowMs) / 1000),
    allowed: true,
  };
}

/**
 * Sets rate limit headers on the response.
 *
 * @param c - Hono context
 * @param info - Rate limit information
 */
function setRateLimitHeaders(c: Context, info: RateLimitInfo): void {
  c.header("X-RateLimit-Limit", info.limit.toString());
  c.header("X-RateLimit-Remaining", info.remaining.toString());
  c.header("X-RateLimit-Reset", info.reset.toString());
}

/**
 * Creates a rate limited error response.
 *
 * @param c - Hono context
 * @param info - Rate limit information
 * @returns Response with 429 status
 */
function rateLimitExceededResponse(c: Context, info: RateLimitInfo): Response {
  const retryAfter = Math.max(0, info.reset - Math.floor(Date.now() / 1000));

  c.header("Retry-After", retryAfter.toString());
  setRateLimitHeaders(c, info);

  const body: RateLimitErrorResponse = {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
      retryAfter,
    },
  };

  return c.json(body, 429);
}

/**
 * Creates a rate limiting middleware with the specified configuration.
 *
 * @param config - Rate limit configuration
 * @returns Hono middleware handler
 *
 * @example
 * // Apply to specific routes
 * app.use("/api/public/*", rateLimiter(defaultRateLimitConfigs.public));
 *
 * // Custom configuration
 * app.use("/api/heavy/*", rateLimiter({ maxRequests: 10, windowMs: 60000 }));
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const clientKey = getClientKey(c);
    const result = checkRateLimit(clientKey, config);

    // Always set rate limit headers
    setRateLimitHeaders(c, result);

    if (!result.allowed) {
      return rateLimitExceededResponse(c, result);
    }

    await next();
  };
}

/**
 * Rate limiter for public update endpoints.
 *
 * Uses IP-based limiting with permissive defaults suitable for
 * Tauri applications checking for updates.
 */
export const publicRateLimiter = rateLimiter(defaultRateLimitConfigs.public);

/**
 * Rate limiter for admin API endpoints.
 *
 * Uses API key-based limiting with moderate defaults.
 */
export const adminRateLimiter = rateLimiter(defaultRateLimitConfigs.admin);

/**
 * Rate limiter for CI endpoints.
 *
 * Uses API key-based limiting with conservative defaults
 * appropriate for automated release workflows.
 */
export const ciRateLimiter = rateLimiter(defaultRateLimitConfigs.ci);

/**
 * Resets rate limit state for a specific client key.
 * Primarily for testing purposes.
 *
 * @param clientKey - The client key to reset
 */
export function resetRateLimit(clientKey: string): void {
  rateLimitStore.delete(clientKey);
}

/**
 * Clears all rate limit state.
 * Primarily for testing purposes.
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Gets the current rate limit state for a client.
 * Primarily for debugging and testing.
 *
 * @param clientKey - The client key to check
 * @returns The rate limit entry or undefined
 */
export function getRateLimitState(clientKey: string): RateLimitEntry | undefined {
  return rateLimitStore.get(clientKey);
}
