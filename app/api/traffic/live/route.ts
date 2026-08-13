import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getTrafficForTrip,
  TrafficServiceError,
  type TrafficPoint,
} from "@/lib/traffic-service";

type LiveTrafficBody = {
  origin?: TrafficPoint;
  destination?: TrafficPoint;
  stops?: TrafficPoint[];
  departureMode?: "now" | "scheduled";
  scheduledAt?: string | null;
};

function isTrafficPoint(value: unknown): value is TrafficPoint {
  if (!value || typeof value !== "object") return false;

  const point = value as Partial<TrafficPoint>;
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng) &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

export async function GET(
  _req: Request,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const { z, x, y } = params;
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TomTom key not configured" }, { status: 500 });
  }

  const url = `https://api.tomtom.com/map/1/tile/traffic/flow/512/${z}/${x}/${y}.png?key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json({ error: "Upstream tile error", details: txt }, { status: res.status });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Tile proxy failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as LiveTrafficBody;
    const stops = body.stops ?? [];

    if (
      !isTrafficPoint(body.origin) ||
      !isTrafficPoint(body.destination) ||
      stops.some((stop) => !isTrafficPoint(stop))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Origin, destination, and stops must have valid coordinates.",
        },
        { status: 400 }
      );
    }

    const departure =
      body.departureMode === "scheduled" && body.scheduledAt
        ? { mode: "scheduled" as const, scheduledAt: body.scheduledAt }
        : { mode: "now" as const };
    const traffic = await getTrafficForTrip(
      [body.origin, ...stops, body.destination],
      departure
    );

    return NextResponse.json(
      { success: true, data: traffic },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof TrafficServiceError
        ? error.userMessage
        : "Unable to fetch live traffic right now.";
    const status = error instanceof TrafficServiceError ? error.statusCode : 502;

    return NextResponse.json({ success: false, message }, { status });
  }
}