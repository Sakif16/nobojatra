import {
  fetchRouteSuggestions,
  RouteServiceError,
} from "@/lib/route-service";
import { auth } from "@/lib/auth";
import { getUserCountry } from "@/lib/user-country";
import { createTripHistoryRecord } from "@/lib/trip-history";
import {
  validateTripInput,
  type TripValidationPayload,
  type ValidatedTripInput,
} from "@/lib/trip-input";
import { resolveTripTimeZone } from "@/lib/trip-time-zone";
import type { RouteLeg, RouteResult } from "@/lib/routing";
import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";

const ROUTE_RATE_LIMIT_WINDOW_MS = 60_000;
const ROUTE_RATE_LIMIT_MAX_REQUESTS = 20;
const ROUTE_CACHE_TTL_MS = 2 * 60 * 1000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RouteCacheEntry = {
  expiresAt: number;
  routes: CachedRoute[];
};

type CachedRoute = Omit<RouteResult, "legs"> & {
  legs: Omit<RouteLeg, "fromLabel" | "toLabel">[];
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const routeCache = new Map<string, RouteCacheEntry>();

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

function stripRouteLabels(routes: RouteResult[]): CachedRoute[] {
  return routes.map((route) => ({
    ...route,
    legs: route.legs.map((leg) => {
      const cachedLeg = { ...leg };
      delete cachedLeg.fromLabel;
      delete cachedLeg.toLabel;
      return cachedLeg;
    }),
  }));
}

function labelRoutes(routes: CachedRoute[], trip: ValidatedTripInput): RouteResult[] {
  const waypoints = [trip.origin, ...trip.stops, trip.destination];

  return routes.map((route) => ({
    ...route,
    legs: route.legs.map((leg, index) => ({
      ...leg,
      fromLabel: waypoints[index]?.label ?? `Point ${index + 1}`,
      toLabel: waypoints[index + 1]?.label ?? `Point ${index + 2}`,
    })),
  }));
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

function checkRateLimit(userId: string, now: number) {
  cleanupStores(now);

  const existing = rateLimitStore.get(userId);

  if (!existing) {
    const entry = {
      count: 1,
      resetAt: now + ROUTE_RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(userId, entry);

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

  const parsed = await readJsonObject<TripValidationPayload>(req);

  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, errors: { origin: parsed.message } },
      { status: 400 }
    );
  }

  const payload = parsed.body;

  // The user's chosen country decides which service area their origin,
  // destination and stops are validated against, and is snapshotted onto the
  // trip record so the fare and weather stages downstream agree with it.
  const country = await getUserCountry(session.user.id);

  const validation = validateTripInput(payload, new Date(), country, resolveTripTimeZone);

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
  // Counted per account, not per IP address: the address comes from a header
  // the caller can set, and this route already knows who is signed in.
  const rateLimit = checkRateLimit(session.user.id, now);

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

  const cacheKey = getRouteCacheKey(validation.data);
  const cached = routeCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    const routes = labelRoutes(cached.routes, validation.data);
    const tripHistoryId = await createTripHistoryRecord({
      userId: session.user.id,
      trip: validation.data,
      routes,
      country,
    });

    return NextResponse.json(
      {
        success: true,
        data: { routes, tripHistoryId },
      },
      {
        headers: {
          ...getRateLimitHeaders(rateLimit),
          "Cache-Control": "no-store",
          "X-Route-Cache": "HIT",
        },
      }
    );
  }

  try {
    const fetchedRoutes = await fetchRouteSuggestions(
      validation.data.origin,
      validation.data.destination,
      validation.data.stops
    );

    const cacheRoutes = stripRouteLabels(fetchedRoutes);
    const routes = labelRoutes(cacheRoutes, validation.data);

    routeCache.set(cacheKey, {
      expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      routes: cacheRoutes,
    });

    const tripHistoryId = await createTripHistoryRecord({
      userId: session.user.id,
      trip: validation.data,
      routes,
      country,
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
