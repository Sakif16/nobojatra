import { auth } from "@/lib/auth";
import { fetchNominatimJson, getNominatimConfig, NominatimError } from "@/lib/nominatim";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";
import { createTtlCache } from "@/lib/ttl-cache";
import { isValidLatitude, isValidLongitude } from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

type NominatimReverseResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  error?: string;
};

type ResolvedLocation = { label: string; lat: number; lng: number };

// "Use my location" is one tap, so a handful a minute is already generous.
const checkUserRateLimit = createRateLimiter({ windowMs: 60_000, max: 10 });

// A device reports a slightly different position on every reading. Rounding to
// four decimal places (about eleven metres) lets repeat taps from the same
// spot share one lookup.
const locationCache = createTtlCache<ResolvedLocation>({
  ttlMs: 10 * 60_000,
  maxEntries: 500,
});

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const latInput = searchParams.get("lat");
  const lngInput = searchParams.get("lng");

  // Number(null) and Number("") are both 0, which is a valid coordinate, so a
  // missing value has to be refused before it is converted.
  if (!latInput || !lngInput || !isValidLatitude(latInput) || !isValidLongitude(lngInput)) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid location coordinates.",
      },
      { status: 400 },
    );
  }

  const lat = Number(latInput);
  const lng = Number(lngInput);
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = locationCache.get(cacheKey);

  if (cached) {
    return NextResponse.json({ success: true, data: cached });
  }

  const rateLimit = checkUserRateLimit(session.user.id);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many location lookups. Please wait a moment and try again.",
      },
      {
        status: 429,
        headers: {
          ...getRateLimitHeaders(rateLimit),
          "Retry-After": String(rateLimit.retryAfter),
        },
      },
    );
  }

  const url = new URL("/reverse", getNominatimConfig().baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  try {
    const result = await fetchNominatimJson<NominatimReverseResult>(url, "location lookups");

    if (result.error || !result.display_name) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to identify this location.",
        },
        { status: 404 },
      );
    }

    const data = {
      label: result.display_name,
      lat: result.lat ? Number(result.lat) : lat,
      lng: result.lon ? Number(result.lon) : lng,
    };

    locationCache.set(cacheKey, data);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof NominatimError) {
      console.warn("Nominatim reverse geocode failed:", error.message);

      return NextResponse.json(
        { success: false, message: error.userMessage },
        {
          status: error.statusCode,
          headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
        },
      );
    }

    console.error("Nominatim reverse geocode failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to fetch current location details.",
      },
      { status: 500 },
    );
  }
}
