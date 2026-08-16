import { auth } from "@/lib/auth";
import { addCondition, SavedTripError } from "@/lib/saved-trips";
import { ALERT_CONDITION_TYPES, type AlertConditionType } from "@/models/SavedTrip";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ savedTripId: string }> };

type ConditionBody = {
  type?: unknown;
  threshold?: unknown;
  level?: unknown;
  isActive?: unknown;
};

function isConditionType(value: unknown): value is AlertConditionType {
  return (
    typeof value === "string" &&
    ALERT_CONDITION_TYPES.includes(value as AlertConditionType)
  );
}

// POST /api/saved-trips/[savedTripId]/conditions
//
// Attaches one alert condition. Per-type validation (threshold ranges, and
// whether the trip even has a fare baseline to compare against) lives in
// lib/saved-trips.ts so it applies to updates too.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  let body: ConditionBody;
  try {
    body = (await req.json()) as ConditionBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isConditionType(body?.type)) {
    return NextResponse.json(
      {
        success: false,
        message: `type must be one of: ${ALERT_CONDITION_TYPES.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const { savedTripId } = await params;

  try {
    const trip = await addCondition({
      userId: session.user.id,
      savedTripId,
      input: {
        type: body.type,
        threshold: typeof body.threshold === "number" ? body.threshold : null,
        level: typeof body.level === "string" ? (body.level as never) : null,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    });

    if (!trip) {
      return NextResponse.json(
        { success: false, message: "Saved trip not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, trip }, { status: 201 });
  } catch (error) {
    if (error instanceof SavedTripError) {
      return NextResponse.json(
        { success: false, message: error.userMessage },
        { status: error.statusCode },
      );
    }

    console.error("Adding alert condition failed:", error);

    return NextResponse.json(
      { success: false, message: "Could not add this condition. Please try again." },
      { status: 500 },
    );
  }
}
