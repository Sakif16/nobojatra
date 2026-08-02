import { validateTripInput, type TripValidationPayload } from "@/lib/trip-input";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let payload: TripValidationPayload;

  try {
    payload = (await req.json()) as TripValidationPayload;
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

  const validation = validateTripInput(payload);

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
