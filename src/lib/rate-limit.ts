/**
 * Simple in-memory rate limiter for serverless
 * 
 * Note: This uses a Map that resets on cold starts.
 * For production at scale, use Redis/Upstash instead.
 * But for Cykelfesten's expected load, this is fine.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Global store (persists across requests within same instance)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
  lastCleanup = now;
}

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for namespacing */
  prefix?: string;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

/**
 * Check and increment rate limit
 * @param key Unique identifier (email, IP, etc)
 * @param config Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  cleanup();
  
  const fullKey = config.prefix ? `${config.prefix}:${key}` : key;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  
  const entry = store.get(fullKey);
  
  // No entry or expired entry
  if (!entry || entry.resetAt < now) {
    store.set(fullKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      remaining: config.limit - 1,
      resetAt: now + windowMs,
    };
  }
  
  // Within window
  if (entry.count >= config.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  
  // Increment
  entry.count++;
  return {
    success: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client IP from request headers
 * Works with Vercel's headers
 */
export function getClientIp(request: Request): string {
  // Vercel sets this
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback headers
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  
  // Last resort
  return 'unknown';
}

// Pre-configured rate limiters for common use cases

/**
 * Rate limit for auth endpoints (magic-link, verify)
 * 5 requests per 15 minutes per email
 * 10 requests per 15 minutes per IP
 */
export const AUTH_RATE_LIMIT = {
  byEmail: { limit: 5, windowSeconds: 15 * 60, prefix: 'auth:email' },
  byIp: { limit: 10, windowSeconds: 15 * 60, prefix: 'auth:ip' },
};

/**
 * Rate limit for general API endpoints
 * 100 requests per minute per IP
 */
export const API_RATE_LIMIT = {
  byIp: { limit: 100, windowSeconds: 60, prefix: 'api:ip' },
};
