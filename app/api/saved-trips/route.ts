import { auth } from "@/lib/auth";
import { getUserCountry } from "@/lib/user-country";
import {
  createSavedTrip,
  listSavedTrips,
  MAX_SAVED_TRIPS,
  MAX_TRIP_NAME_LENGTH,
  SavedTripError,
} from "@/lib/saved-trips";
import {
  validateTripInput,
  type TripValidationErrors,
  type TripValidationPayload,
} from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

type SavedTripCreateBody = TripValidationPayload & {
  name?: unknown;
  preferredVehicleRateId?: unknown;
};

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required." },
    { status: 401 },
  );
}

/**
 * Validation errors are keyed by field so the form can highlight the right
 * input, and `message` carries the first of them so a caller that only reads
 * `message` — every other endpoint's contract — still shows something useful.
 */
function firstValidationError(errors: TripValidationErrors) {
  return (
    errors.origin ??
    errors.destination ??
    errors.stops?.find(Boolean) ??
    errors.passengerCount ??
    errors.departureMode ??
    errors.scheduledAt ??
    "Please check your trip details."
  );
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  const trips = await listSavedTrips(session.user.id);

  return NextResponse.json({ success: true, trips, maxTrips: MAX_SAVED_TRIPS });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  let body: SavedTripCreateBody;
  try {
    body = (await req.json()) as SavedTripCreateBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { success: false, message: "Request body must be a JSON object." },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { success: false, message: "Give this trip a name." },
      { status: 400 },
    );
  }

  if (name.length > MAX_TRIP_NAME_LENGTH) {
    return NextResponse.json(
      {
        success: false,
        message: `Trip name must be ${MAX_TRIP_NAME_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  // Same validator the dashboard search uses, so a saved trip can never hold
  // a location the route finder would have rejected.
  // Saved trips are validated against, and stored with, the user's current
  // country — unlike trip history, a saved trip is being created fresh here.
  const country = await getUserCountry(session.user.id);

  const validation = validateTripInput(body, new Date(), country);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        message: firstValidationError(validation.errors),
        errors: validation.errors,
      },
      { status: 400 },
    );
  }

  if (
    body.preferredVehicleRateId !== undefined &&
    body.preferredVehicleRateId !== null &&
    typeof body.preferredVehicleRateId !== "string"
  ) {
    return NextResponse.json(
      { success: false, message: "That vehicle selection is not valid." },
      { status: 400 },
    );
  }

  try {
    const trip = await createSavedTrip({
      userId: session.user.id,
      name,
      trip: validation.data,
      preferredVehicleRateId: body.preferredVehicleRateId ?? null,
      country,
    });

    return NextResponse.json({ success: true, trip }, { status: 201 });
  } catch (error) {
    if (error instanceof SavedTripError) {
      return NextResponse.json(
        { success: false, message: error.userMessage },
        { status: error.statusCode },
      );
    }

    console.error("Saved trip creation failed:", error);

    return NextResponse.json(
      { success: false, message: "Could not save this trip. Please try again." },
      { status: 500 },
    );
  }
}
