import "server-only";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

/**
 * Process-local rate limiter. Good enough for a single dev/server instance —
 * on serverless or multi-instance deployments each instance keeps its own
 * counters, so treat this as abuse dampening rather than a hard guarantee.
 */
export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
  const store = new Map<string, RateLimitEntry>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    for (const [storedKey, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(storedKey);
      }
    }

    const existing = store.get(key);

    if (!existing) {
      store.set(key, { count: 1, resetAt: now + windowMs });

      return {
        allowed: true,
        limit: max,
        remaining: max - 1,
        resetAt: now + windowMs,
        retryAfter: 0,
      };
    }

    if (existing.count >= max) {
      return {
        allowed: false,
        limit: max,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;

    return {
      allowed: true,
      limit: max,
      remaining: max - existing.count,
      resetAt: existing.resetAt,
      retryAfter: 0,
    };
  };
}

export function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    firstForwardedIp ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "anonymous"
  );
}

export function getRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
