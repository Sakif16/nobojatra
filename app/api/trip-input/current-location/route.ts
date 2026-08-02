import { isValidLatitude, isValidLongitude } from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

type NominatimReverseResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  error?: string;
};

function getNominatimConfig() {
  return {
    baseUrl: process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org",
    userAgent: process.env.NOMINATIM_USER_AGENT ?? "NoboJatra/1.0",
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latInput = searchParams.get("lat");
  const lngInput = searchParams.get("lng");

  if (!isValidLatitude(latInput) || !isValidLongitude(lngInput)) {
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
  const { baseUrl, userAgent } = getNominatimConfig();
  const url = new URL("/reverse", baseUrl);

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

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
          message: `Nominatim reverse geocode failed: ${details}`,
        },
        { status: 502 },
      );
    }

    const result = (await response.json()) as NominatimReverseResult;

    if (result.error || !result.display_name) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to identify this location.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        label: result.display_name,
        lat: result.lat ? Number(result.lat) : lat,
        lng: result.lon ? Number(result.lon) : lng,
      },
    });
  } catch (error) {
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
