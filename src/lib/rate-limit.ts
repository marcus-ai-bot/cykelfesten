/**
 * Simple rate limiter with Supabase-backed persistence.
 * Falls back to in-memory Map if RPC fails.
 */
import { createAdminClient } from '@/lib/supabase/server';

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

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

function checkRateLimitInMemory(fullKey: string, windowSeconds: number, limit: number): RateLimitResult {
  cleanup();

  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const entry = store.get(fullKey);

  // No entry or expired entry
  if (!entry || entry.resetAt < now) {
    store.set(fullKey, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      success: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  // Within window
  if (entry.count >= limit) {
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
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Check and increment rate limit (Supabase RPC)
 * @param key Unique identifier (email, IP, etc)
 * @param windowMinutes Time window in minutes
 * @param maxCount Max requests allowed in the window
 */
export async function checkRateLimit(
  key: string,
  windowMinutes: number,
  maxCount: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowSeconds = windowMinutes * 60;
  const resetAt = now + windowSeconds * 1000;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_window_minutes: windowMinutes,
      p_max_count: maxCount,
    });

    if (error || data === null) {
      throw error || new Error('check_rate_limit returned null');
    }

    if (!data) {
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfterSeconds: windowSeconds,
      };
    }

    return {
      success: true,
      remaining: Math.max(0, maxCount - 1),
      resetAt,
    };
  } catch (error) {
    console.warn('Rate limit RPC failed, using in-memory fallback:', error);
    return checkRateLimitInMemory(key, windowSeconds, maxCount);
  }
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

export const AUTH_RATE_LIMIT = {
  byEmail: { maxCount: 5, windowMinutes: 15, prefix: 'auth:email' },
  byIp: { maxCount: 10, windowMinutes: 15, prefix: 'auth:ip' },
};

export const API_RATE_LIMIT = {
  byIp: { maxCount: 100, windowMinutes: 1, prefix: 'api:ip' },
};
