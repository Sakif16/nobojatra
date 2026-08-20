import { resolveCountry } from "@/lib/country-config";
import { validateTripInput, type TripValidationPayload } from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let payload: TripValidationPayload & { country?: unknown };

  try {
    payload = (await req.json()) as TripValidationPayload & { country?: unknown };
  } catch {
    return NextResponse.json(
      {
        success: false,
        errors: {
          origin: "Request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  // This endpoint is only the form's pre-submit check, so it takes the country
  // from the request rather than the session. /api/trip-input/routes is the
  // authoritative gate and resolves the country from the user's profile, so a
  // client sending the wrong one here gains nothing beyond a misleading
  // client-side message.
  const validation = validateTripInput(payload, new Date(), resolveCountry(payload.country));

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
