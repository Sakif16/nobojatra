import {
  fetchRouteSuggestions,
  RouteServiceError,
} from "@/lib/route-service";
import { auth } from "@/lib/auth";
import { createTripHistoryRecord } from "@/lib/trip-history";
import {
  validateTripInput,
  type TripValidationPayload,
  type ValidatedTripInput,
} from "@/lib/trip-input";
import type { RouteResult } from "@/lib/routing";
import { NextRequest, NextResponse } from "next/server";

const ROUTE_RATE_LIMIT_WINDOW_MS = 60_000;
const ROUTE_RATE_LIMIT_MAX_REQUESTS = 20;
const ROUTE_CACHE_TTL_MS = 2 * 60 * 1000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RouteCacheEntry = {
  expiresAt: number;
  routes: RouteResult[];
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const routeCache = new Map<string, RouteCacheEntry>();

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    firstForwardedIp ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "anonymous"
  );
}

function getRoundedCoordinate(value: number) {
  return Number(value.toFixed(5));
}

function getRouteCacheKey(data: ValidatedTripInput) {
  return JSON.stringify({
    origin: [
      getRoundedCoordinate(data.origin.lat),
      getRoundedCoordinate(data.origin.lng),
    ],
    destination: [
      getRoundedCoordinate(data.destination.lat),
      getRoundedCoordinate(data.destination.lng),
    ],
    stops: data.stops.map((stop) => [
      getRoundedCoordinate(stop.lat),
      getRoundedCoordinate(stop.lng),
      stop.dwellMinutes,
    ]),
  });
}

function cleanupStores(now: number) {
  for (const [key, entry] of routeCache.entries()) {
    if (entry.expiresAt <= now) {
      routeCache.delete(key);
    }
  }

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function checkRateLimit(ip: string, now: number) {
  cleanupStores(now);

  const existing = rateLimitStore.get(ip);

  if (!existing) {
    const entry = {
      count: 1,
      resetAt: now + ROUTE_RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(ip, entry);

    return {
      allowed: true,
      remaining: ROUTE_RATE_LIMIT_MAX_REQUESTS - entry.count,
      resetAt: entry.resetAt,
      retryAfter: 0,
    };
  }

  if (existing.count >= ROUTE_RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: ROUTE_RATE_LIMIT_MAX_REQUESTS - existing.count,
    resetAt: existing.resetAt,
    retryAfter: 0,
  };
}

function getRateLimitHeaders(rateLimit: ReturnType<typeof checkRateLimit>) {
  return {
    "X-RateLimit-Limit": String(ROUTE_RATE_LIMIT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
  };
}

export async function POST(req: NextRequest) {
  let payload: TripValidationPayload;
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication required.",
      },
      { status: 401 }
    );
  }

  try {
    payload = (await req.json()) as TripValidationPayload;
  } catch {
    return NextResponse.json(
      {
        success: false,
        errors: {
          origin: "Request body must be valid JSON.",
        },
      },
      { status: 400 }
    );
  }

  const validation = validateTripInput(payload);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        errors: validation.errors,
      },
      { status: 400 }
    );
  }

  const now = Date.now();
  const cacheKey = getRouteCacheKey(validation.data);
  const cached = routeCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    const tripHistoryId = await createTripHistoryRecord({
      userId: session.user.id,
      trip: validation.data,
      routes: cached.routes,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          routes: cached.routes,
          tripHistoryId,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Route-Cache": "HIT",
        },
      }
    );
  }

  const rateLimit = checkRateLimit(getClientIp(req), now);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many route requests. Please wait a moment and try again.",
      },
      {
        status: 429,
        headers: {
          ...getRateLimitHeaders(rateLimit),
          "Retry-After": String(rateLimit.retryAfter),
        },
      }
    );
  }

  try {
    const routes = await fetchRouteSuggestions(
      validation.data.origin,
      validation.data.destination,
      validation.data.stops
    );

    routeCache.set(cacheKey, {
      expiresAt: now + ROUTE_CACHE_TTL_MS,
      routes,
    });

    const tripHistoryId = await createTripHistoryRecord({
      userId: session.user.id,
      trip: validation.data,
      routes,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          routes,
          tripHistoryId,
        },
      },
      {
        headers: {
          ...getRateLimitHeaders(rateLimit),
          "Cache-Control": "no-store",
          "X-Route-Cache": "MISS",
        },
      }
    );
  } catch (error) {
    if (error instanceof RouteServiceError) {
      console.warn("Route suggestions failed:", error.message);
    } else {
      console.error("Route suggestions failed:", error);
    }

    const message =
      error instanceof RouteServiceError
        ? error.userMessage
        : "Unable to find routes right now.";
    const status = error instanceof RouteServiceError ? error.statusCode : 502;

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status,
        headers: getRateLimitHeaders(rateLimit),
      }
    );
  }
}
