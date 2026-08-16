import { auth } from "@/lib/auth";
import {
  deleteSavedTrip,
  getSavedTrip,
  MAX_TRIP_NAME_LENGTH,
  SavedTripError,
  updateSavedTrip,
  type SavedTripPatch,
} from "@/lib/saved-trips";
import {
  validateTripInput,
  type TripValidationErrors,
  type TripValidationPayload,
} from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ savedTripId: string }> };

type SavedTripUpdateBody = TripValidationPayload & {
  name?: unknown;
  isActive?: unknown;
  preferredVehicleRateId?: unknown;
};

/** Fields that, if present, mean the trip itself has to be re-validated. */
const TRIP_FIELDS = [
  "origin",
  "destination",
  "stops",
  "passengerCount",
  "departureMode",
  "scheduledAt",
] as const;

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required." },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json(
    { success: false, message: "Saved trip not found." },
    { status: 404 },
  );
}

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

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  const { savedTripId } = await params;
  const trip = await getSavedTrip(session.user.id, savedTripId);

  if (!trip) return notFound();

  return NextResponse.json({ success: true, trip });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  const { savedTripId } = await params;

  let body: SavedTripUpdateBody;
  try {
    body = (await req.json()) as SavedTripUpdateBody;
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

  const existing = await getSavedTrip(session.user.id, savedTripId);

  if (!existing) return notFound();

  const patch: SavedTripPatch = {};

  if (body.name !== undefined) {
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

    patch.name = name;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { success: false, message: "isActive must be true or false." },
        { status: 400 },
      );
    }

    patch.isActive = body.isActive;
  }

  if (body.preferredVehicleRateId !== undefined) {
    if (
      body.preferredVehicleRateId !== null &&
      typeof body.preferredVehicleRateId !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "That vehicle selection is not valid." },
        { status: 400 },
      );
    }

    patch.preferredVehicleRateId = body.preferredVehicleRateId;
  }

  // A partial trip edit (say, passenger count alone) is merged over the stored
  // trip and the whole thing re-validated, so the saved record can never end up
  // in a state validateTripInput would reject.
  const touchesTrip = TRIP_FIELDS.some((field) => body[field] !== undefined);

  if (touchesTrip) {
    const merged: TripValidationPayload = {
      origin: body.origin ?? existing.origin,
      destination: body.destination ?? existing.destination,
      stops: body.stops ?? existing.stops,
      passengerCount: body.passengerCount ?? existing.passengerCount,
      departureMode: body.departureMode ?? existing.departureMode,
      scheduledAt: body.scheduledAt ?? existing.scheduledAt ?? undefined,
    };

    const validation = validateTripInput(merged);

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

    patch.trip = validation.data;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { success: false, message: "Nothing to update." },
      { status: 400 },
    );
  }

  try {
    const trip = await updateSavedTrip({
      userId: session.user.id,
      savedTripId,
      patch,
    });

    if (!trip) return notFound();

    return NextResponse.json({ success: true, trip });
  } catch (error) {
    if (error instanceof SavedTripError) {
      return NextResponse.json(
        { success: false, message: error.userMessage },
        { status: error.statusCode },
      );
    }

    console.error("Saved trip update failed:", error);

    return NextResponse.json(
      { success: false, message: "Could not update this trip. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  const { savedTripId } = await params;
  const deleted = await deleteSavedTrip(session.user.id, savedTripId);

  if (!deleted) return notFound();

  return NextResponse.json({ success: true, message: "Saved trip deleted." });
}
