import {
  createRateLimiter,
  getClientIp,
  getRateLimitHeaders,
} from "@/lib/rate-limit";
import {
  MAX_AUTOCOMPLETE_RESULTS,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
  NOMINATIM_SERVICE_AREA_VIEWBOX,
} from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

// This endpoint is unauthenticated so the landing-page hero can offer place
// search before signup, which makes it a public proxy to Nominatim. Nominatim's
// usage policy caps us at roughly 1 request/second for the whole server, and
// going over it gets our outbound IP blocked — hence a per-IP limit plus a
// global ceiling that protects the upstream regardless of how many callers hit us.
const checkIpRateLimit = createRateLimiter({ windowMs: 60_000, max: 30 });
const checkGlobalRateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

type NominatimSearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
};

function getNominatimConfig() {
  return {
    baseUrl: process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org",
    userAgent: process.env.NOMINATIM_USER_AGENT ?? "NoboJatra/1.0",
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();

  if (!query || query.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
    return NextResponse.json({
      success: true,
      data: [],
    });
  }

  const now = Date.now();
  const ipRateLimit = checkIpRateLimit(getClientIp(req), now);
  const globalRateLimit = checkGlobalRateLimit("global", now);
  const rateLimit = ipRateLimit.allowed ? globalRateLimit : ipRateLimit;

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        message: "Too many place searches. Please wait a moment and try again.",
      },
      {
        status: 429,
        headers: {
          ...getRateLimitHeaders(ipRateLimit),
          "Retry-After": String(rateLimit.retryAfter),
        },
      },
    );
  }

  const { baseUrl, userAgent } = getNominatimConfig();
  const url = new URL("/search", baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(MAX_AUTOCOMPLETE_RESULTS));
  url.searchParams.set("viewbox", NOMINATIM_SERVICE_AREA_VIEWBOX);
  url.searchParams.set("bounded", "1");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        {
          success: false,
          message: `Nominatim autocomplete failed: ${details}`,
        },
        { status: 502 },
      );
    }

    const results = (await response.json()) as NominatimSearchResult[];
    const data = results
      .map((result) => {
        const lat = Number(result.lat);
        const lng = Number(result.lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        return {
          id: String(result.place_id),
          label: result.display_name,
          lat,
          lng,
          type: result.type,
          importance: result.importance,
        };
      })
      .filter((result) => result !== null);

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { headers: getRateLimitHeaders(ipRateLimit) },
    );
  } catch (error) {
    console.error("Nominatim autocomplete failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to fetch place suggestions.",
      },
      { status: 500 },
    );
  }
}
