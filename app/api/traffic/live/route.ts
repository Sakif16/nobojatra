import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-body";
import { MAX_TRAFFIC_SAMPLES } from "@/lib/routing";
import { getUserCountry } from "@/lib/user-country";
import {
  getTrafficForTrip,
  TrafficServiceError,
  type TrafficPoint,
} from "@/lib/traffic-service";

/** A sampled route's points, less its two ends. */
const MAX_TRAFFIC_STOPS = MAX_TRAFFIC_SAMPLES - 2;

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

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  const parsed = await readJsonObject<LiveTrafficBody>(req);
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, message: parsed.message },
      { status: 400 }
    );
  }
  const body = parsed.body;

  if (body.stops != null && !Array.isArray(body.stops)) {
    return NextResponse.json(
      { success: false, message: "Stops must be a list of coordinates." },
      { status: 400 }
    );
  }

  const stops = body.stops ?? [];

  // Every point after the first is one provider call. The planner never sends
  // more than a sampled route's worth, so anything longer is not the planner.
  if (stops.length > MAX_TRAFFIC_STOPS) {
    return NextResponse.json(
      {
        success: false,
        message: `Traffic can be checked for up to ${MAX_TRAFFIC_STOPS} points between the origin and destination.`,
      },
      { status: 400 }
    );
  }

  try {
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
    // This is the live planner preview — the trip is not stored yet, so the
    // profile's country is the one being planned in.
    const country = await getUserCountry(session.user.id);
    const traffic = await getTrafficForTrip(
      [body.origin, ...stops, body.destination],
      departure,
      country
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