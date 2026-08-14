import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import UserProfile, { TRAVEL_PRIORITIES, type TravelPriority } from "@/models/UserProfile";
import { NextRequest, NextResponse } from "next/server";

type ProfileUpdateBody = {
  name?: unknown;
  email?: unknown;
  defaultTravelPriority?: unknown;
  defaultPassengerCount?: unknown;
  savedPlaces?: unknown;
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

// Better Auth's error codes are stable; its messages are not always suitable
// for this dialog. Map the ones a user can actually hit, and fall back to
// whatever the upstream said rather than inventing a generic failure.
const DELETE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "That password is incorrect.",
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    "This account has no password set, so it cannot be deleted this way.",
  ACCOUNT_CLEANUP_FAILED:
    "Your data could not be fully removed, so the account was not deleted. Please try again.",
};

async function getDeleteErrorMessage(response: Response) {
  const payload = (await response
    .json()
    .catch(() => null)) as { code?: unknown; message?: unknown } | null;

  const code = typeof payload?.code === "string" ? payload.code : "";

  return (
    DELETE_ERROR_MESSAGES[code] ??
    (typeof payload?.message === "string" && payload.message
      ? payload.message
      : "Unable to delete account.")
  );
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

  // Malformed JSON must not surface as an empty 500 — the client only ever
  // reads `message`, so an unparseable body needs the same contract as any
  // other bad input.
  let body: ProfileUpdateBody;
  try {
    body = (await req.json()) as ProfileUpdateBody;
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

  const updates: Record<string, TravelPriority | number | SavedPlace[]> = {};

  // ── Phase 1: validate everything before writing anything ────────────────
  // Every field is checked up front so a late validation failure (say, a bad
  // passenger count) cannot leave an earlier field already committed. Nothing
  // below this block touches the database.

  let nextName: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Display name is required." },
        { status: 400 },
      );
    }

    nextName = body.name.trim();
  }

  let nextEmail: string | undefined;
  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !body.email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "A valid email is required." },
        { status: 400 },
      );
    }

    const normalizedEmail = body.email.trim().toLowerCase();
    if (normalizedEmail !== session.user.email.toLowerCase()) {
      nextEmail = normalizedEmail;
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

  // ── Phase 2: writes, ordered cheapest-and-most-reliable first ───────────
  // The email change is last on purpose: it is the only step that calls an
  // external mail provider, so it is the most likely to fail, and putting it
  // last means a mail outage cannot roll back or block the local saves.

  const committed = { name: false, profile: false, emailChangeRequested: false };

  // Go through Better Auth rather than writing the `user` collection directly.
  // The Mongo adapter stores `_id` as an ObjectId while the session exposes a
  // string, so a raw `updateOne({ _id: session.user.id })` matches zero
  // documents and silently succeeds — which is exactly what used to happen.
  if (nextName !== undefined && nextName !== session.user.name) {
    try {
      await auth.api.updateUser({
        headers: req.headers,
        body: { name: nextName },
      });
      committed.name = true;
    } catch (error) {
      console.error("Profile name update failed:", error);
      return NextResponse.json(
        {
          success: false,
          message: "Could not update your display name. No changes were saved.",
          data: { committed },
        },
        { status: 502 },
      );
    }
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
  committed.profile = true;

  if (nextEmail !== undefined) {
    try {
      await auth.api.changeEmail({
        headers: req.headers,
        body: {
          newEmail: nextEmail,
          callbackURL: "/profile",
        },
      });
      committed.emailChangeRequested = true;
    } catch (error) {
      console.error("Profile email change failed:", error);
      // Report precisely what did commit rather than a blanket failure — the
      // name and travel defaults are already persisted at this point.
      return NextResponse.json(
        {
          success: false,
          message:
            "Your name and travel defaults were saved, but the email change could not be started. Please try changing your email again.",
          data: { profile: serializeProfile(profile), committed },
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    success: true,
    message: committed.emailChangeRequested
      ? "Profile saved. Check your new email address to verify the change."
      : "Profile saved.",
    data: {
      profile: serializeProfile(profile),
      emailVerificationSent: committed.emailChangeRequested,
      committed,
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

  let body: { confirmation?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { confirmation?: unknown; password?: unknown };
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

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { success: false, message: "Type DELETE to confirm account deletion." },
      { status: 400 },
    );
  }

  // Deleting an account is irreversible, so it needs more than a live cookie.
  // Better Auth verifies this against the stored credential hash.
  if (typeof body.password !== "string" || body.password.length === 0) {
    return NextResponse.json(
      { success: false, message: "Enter your password to confirm account deletion." },
      { status: 400 },
    );
  }

  // Better Auth owns deletion end to end: it verifies the password, runs the
  // application-data cascade in the `beforeDelete` hook (lib/auth.ts), then
  // removes session, account, and user, and clears the session cookie. This
  // route deliberately no longer touches the auth collections — the raw
  // string-keyed deletes it used to run never matched the adapter's ObjectId
  // keys, so it reported "Account deleted." over an account that still worked.
  const authResponse = await auth.api.deleteUser({
    headers: req.headers,
    body: { password: body.password },
    asResponse: true,
  });

  if (!authResponse.ok) {
    return NextResponse.json(
      { success: false, message: await getDeleteErrorMessage(authResponse) },
      { status: authResponse.status },
    );
  }

  const response = NextResponse.json({
    success: true,
    message: "Account deleted.",
  });

  // Carry Better Auth's session-clearing cookie through to the browser.
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}