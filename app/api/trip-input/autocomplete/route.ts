import { auth } from "@/lib/auth";
import { getCountryConfig, resolveCountry } from "@/lib/country-config";
import { fetchNominatimJson, getNominatimConfig, NominatimError } from "@/lib/nominatim";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";
import { createTtlCache } from "@/lib/ttl-cache";
import {
  getNominatimServiceAreaViewbox,
  MAX_AUTOCOMPLETE_RESULTS,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
} from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

// Place search is a proxy to Nominatim, so it is only offered to signed-in
// users — every screen that searches for a place already requires a session.
// The limit is per account rather than per IP: an address can be claimed in a
// header, an account cannot. lib/nominatim adds the server-wide ceiling and
// the daily budget on top.
const checkUserRateLimit = createRateLimiter({ windowMs: 60_000, max: 30 });

// Typing "Dhanmondi" and deleting a letter asks for "Dhanmond" twice, and
// popular places are searched by everyone. Results change slowly, so repeats
// within ten minutes are answered from here and never reach Nominatim.
const placeCache = createTtlCache<PlaceSuggestion[]>({
  ttlMs: 10 * 60_000,
  maxEntries: 500,
});

const MAX_QUERY_LENGTH = 120;

type NominatimSearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
};

type PlaceSuggestion = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type?: string;
  importance?: number;
};

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  // Sent by the form rather than read from the profile: it only filters
  // suggestions, and /api/trip-input/routes validates the chosen place against
  // the profile's country regardless.
  const country = resolveCountry(searchParams.get("country"));

  if (!query || query.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
    return NextResponse.json({
      success: true,
      data: [],
    });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { success: false, message: "That search is too long." },
      { status: 400 },
    );
  }

  const cacheKey = `${country}:${query.toLowerCase()}`;
  const cached = placeCache.get(cacheKey);

  if (cached) {
    return NextResponse.json(
      { success: true, data: cached },
      { headers: { "X-Place-Cache": "HIT" } },
    );
  }

  const rateLimit = checkUserRateLimit(session.user.id);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many place searches. Please wait a moment and try again.",
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

  const url = new URL("/search", getNominatimConfig().baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(MAX_AUTOCOMPLETE_RESULTS));

  // countrycodes does the country-level filtering for every market. A country
  // whose service area is smaller than the country itself additionally pins a
  // viewbox, so results outside it do not come back and then fail validation.
  const { nominatimCountryCode, useBoundedViewbox } = getCountryConfig(country);
  url.searchParams.set("countrycodes", nominatimCountryCode);

  if (useBoundedViewbox) {
    url.searchParams.set("viewbox", getNominatimServiceAreaViewbox(country));
    url.searchParams.set("bounded", "1");
  }

  try {
    const results = await fetchNominatimJson<NominatimSearchResult[]>(url, "place search");
    const data = (Array.isArray(results) ? results : []).flatMap((result) => {
      const lat = Number(result.lat);
      const lng = Number(result.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

      return [
        {
          id: String(result.place_id),
          label: result.display_name,
          lat,
          lng,
          type: result.type,
          importance: result.importance,
        },
      ];
    });

    placeCache.set(cacheKey, data);

    return NextResponse.json(
      { success: true, data },
      { headers: { ...getRateLimitHeaders(rateLimit), "X-Place-Cache": "MISS" } },
    );
  } catch (error) {
    if (error instanceof NominatimError) {
      console.warn("Nominatim autocomplete failed:", error.message);

      return NextResponse.json(
        { success: false, message: error.userMessage },
        {
          status: error.statusCode,
          headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
        },
      );
    }

    console.error("Nominatim autocomplete failed:", error);

    return NextResponse.json(
      { success: false, message: "Unable to fetch place suggestions." },
      { status: 500 },
    );
  }
}
