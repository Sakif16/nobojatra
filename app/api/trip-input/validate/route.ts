import { auth } from "@/lib/auth";
import { resolveCountry } from "@/lib/country-config";
import { validateTripInput, type TripValidationPayload } from "@/lib/trip-input";
import { resolveTripTimeZone } from "@/lib/trip-time-zone";
import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";

export async function POST(req: NextRequest) {
  // Only the signed-in planner calls this, so it is not left open to others.
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = await readJsonObject<TripValidationPayload & { country?: unknown }>(req);

  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, errors: { origin: parsed.message } },
      { status: 400 },
    );
  }

  const payload = parsed.body;

  // This endpoint is only the form's pre-submit check, so it takes the country
  // from the request rather than the session. /api/trip-input/routes is the
  // authoritative gate and resolves the country from the user's profile, so a
  // client sending the wrong one here gains nothing beyond a misleading
  // client-side message.
  const validation = validateTripInput(
    payload,
    new Date(),
    resolveCountry(payload.country),
    resolveTripTimeZone,
  );

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        errors: validation.errors,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    data: validation.data,
  });
}
