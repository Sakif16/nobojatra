import { auth, authDb } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Alert from "@/models/Alert";
import Route from "@/models/Map_route";
import Place from "@/models/Place";
import TrafficData from "@/models/TrafficData";
import TripHistory from "@/models/TripHistory";
import UserProfile, { TRAVEL_PRIORITIES, type TravelPriority } from "@/models/UserProfile";
import { NextRequest, NextResponse } from "next/server";

type ProfileUpdateBody = {
  name?: unknown;
  email?: unknown;
  defaultTravelPriority?: unknown;
  defaultPassengerCount?: unknown;
  savedPlaces?: unknown;
};

type AuthUserDocument = {
  _id: string;
  id?: string;
  name?: string;
  updatedAt?: Date;
};

// Shape a saved place takes once validated and stripped of anything extra
type SavedPlace = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

const MAX_SAVED_PLACES = 10;

function isTravelPriority(value: unknown): value is TravelPriority {
  return typeof value === "string" && TRAVEL_PRIORITIES.includes(value as TravelPriority);
}

// Validates one entry from the incoming savedPlaces array. Rejects anything
// missing a label or a finite lat/lng, and drops any extra fields the client
// might have sent (e.g. a stray autocomplete "id") on the way through.
function toValidSavedPlace(value: unknown): SavedPlace | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;

  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  if (!label || label.length > 40) return null;

  const place = candidate.place;
  if (!place || typeof place !== "object") return null;
  const placeCandidate = place as Record<string, unknown>;

  const placeLabel = typeof placeCandidate.label === "string" ? placeCandidate.label.trim() : "";
  const lat = Number(placeCandidate.lat);
  const lng = Number(placeCandidate.lng);

  if (!placeLabel || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { label, place: { label: placeLabel, lat, lng } };
}

function serializeProfile(profile: {
  defaultTravelPriority: TravelPriority;
  defaultPassengerCount: number;
  savedPlaces?: SavedPlace[];
}) {
  return {
    defaultTravelPriority: profile.defaultTravelPriority,
    defaultPassengerCount: profile.defaultPassengerCount,
    savedPlaces: Array.isArray(profile.savedPlaces)
      ? profile.savedPlaces.map((sp) => ({
          label: sp.label,
          place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
        }))
      : [],
  };
}

async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

async function getOrCreateProfile(userId: string) {
  await dbConnect();

  return UserProfile.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        defaultTravelPriority: "time",
        defaultPassengerCount: 1,
      },
    },
    { returnDocument: "after", upsert: true },
  );
}

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const profile = await getOrCreateProfile(session.user.id);

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt,
      },
      profile: serializeProfile(profile),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as ProfileUpdateBody;
  const updates: Record<string, TravelPriority | number | SavedPlace[]> = {};
  let emailVerificationSent = false;

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Display name is required." },
        { status: 400 },
      );
    }

    await authDb.collection<AuthUserDocument>("user").updateOne(
      { _id: session.user.id },
      {
        $set: {
          name: body.name.trim(),
          updatedAt: new Date(),
        },
      },
    );
  }

  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !body.email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "A valid email is required." },
        { status: 400 },
      );
    }

    const normalizedEmail = body.email.trim().toLowerCase();

    if (normalizedEmail !== session.user.email.toLowerCase()) {
      await auth.api.changeEmail({
        headers: req.headers,
        body: {
          newEmail: normalizedEmail,
          callbackURL: "/profile",
        },
      });
      emailVerificationSent = true;
    }
  }

  if (body.defaultTravelPriority !== undefined) {
    if (!isTravelPriority(body.defaultTravelPriority)) {
      return NextResponse.json(
        { success: false, message: "Travel priority must be time, cost, or comfort." },
        { status: 400 },
      );
    }

    updates.defaultTravelPriority = body.defaultTravelPriority;
  }

  if (body.defaultPassengerCount !== undefined) {
    const passengerCount = Number(body.defaultPassengerCount);

    if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 8) {
      return NextResponse.json(
        { success: false, message: "Passenger count must be between 1 and 8." },
        { status: 400 },
      );
    }

    updates.defaultPassengerCount = passengerCount;
  }

  // The client always sends the full desired list (not a delta), so this is a
  // straight replace — same pattern as every other field on this endpoint.
  if (body.savedPlaces !== undefined) {
    if (!Array.isArray(body.savedPlaces)) {
      return NextResponse.json(
        { success: false, message: "savedPlaces must be an array." },
        { status: 400 },
      );
    }

    if (body.savedPlaces.length > MAX_SAVED_PLACES) {
      return NextResponse.json(
        { success: false, message: `You can save up to ${MAX_SAVED_PLACES} places.` },
        { status: 400 },
      );
    }

    const sanitized: SavedPlace[] = [];
    for (const entry of body.savedPlaces) {
      const valid = toValidSavedPlace(entry);
      if (!valid) {
        return NextResponse.json(
          { success: false, message: "Each saved place needs a label and a valid location." },
          { status: 400 },
        );
      }
      sanitized.push(valid);
    }

    updates.savedPlaces = sanitized;
  }

  await dbConnect();

  const profile = await UserProfile.findOneAndUpdate(
    { userId: session.user.id },
    {
      $set: updates,
      $setOnInsert: {
        userId: session.user.id,
      },
    },
    { returnDocument: "after", upsert: true },
  );

  return NextResponse.json({
    success: true,
    message: emailVerificationSent
      ? "Profile saved. Check your new email address to verify the change."
      : "Profile saved.",
    data: {
      profile: serializeProfile(profile),
      emailVerificationSent,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as { confirmation?: unknown };

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { success: false, message: "Type DELETE to confirm account deletion." },
      { status: 400 },
    );
  }

  await dbConnect();

  const routes = await Route.find({ userId: session.user.id }).select("_id");
  const routeIds = routes.map((route) => route._id);

  const [
    alertResult,
    trafficResult,
    tripHistoryResult,
    routeResult,
    placeResult,
    profileResult,
  ] = await Promise.all([
    Alert.deleteMany({ userId: session.user.id }),
    routeIds.length > 0
      ? TrafficData.deleteMany({ routeId: { $in: routeIds } })
      : Promise.resolve({ deletedCount: 0 }),
    TripHistory.deleteMany({
      $or: [
        { userId: session.user.id },
        ...(routeIds.length > 0 ? [{ routeId: { $in: routeIds } }] : []),
      ],
    }),
    Route.deleteMany({ userId: session.user.id }),
    Place.deleteMany({ userId: session.user.id }),
    UserProfile.deleteOne({ userId: session.user.id }),
  ]);

  await Promise.all([
    authDb.collection("verification").deleteMany({
      $or: [
        { value: session.user.id },
        { identifier: { $regex: session.user.id } },
      ],
    }),
    authDb.collection("session").deleteMany({ userId: session.user.id }),
    authDb.collection("account").deleteMany({ userId: session.user.id }),
    authDb.collection<AuthUserDocument>("user").deleteOne({
      $or: [{ _id: session.user.id }, { id: session.user.id }],
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Account deleted.",
    data: {
      deleted: {
        alerts: alertResult.deletedCount,
        trafficData: trafficResult.deletedCount,
        tripHistory: tripHistoryResult.deletedCount,
        routes: routeResult.deletedCount,
        places: placeResult.deletedCount,
        profile: profileResult.deletedCount,
      },
    },
  });
}