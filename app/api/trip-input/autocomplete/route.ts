import {
  MAX_AUTOCOMPLETE_RESULTS,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
  NOMINATIM_DHAKA_VIEWBOX,
} from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

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

  const { baseUrl, userAgent } = getNominatimConfig();
  const url = new URL("/search", baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query);
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(MAX_AUTOCOMPLETE_RESULTS));
  url.searchParams.set("viewbox", NOMINATIM_DHAKA_VIEWBOX);
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

    return NextResponse.json({
      success: true,
      data,
    });
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
