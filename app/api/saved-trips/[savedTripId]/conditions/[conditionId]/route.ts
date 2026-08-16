import { auth } from "@/lib/auth";
import { deleteCondition, SavedTripError, updateCondition } from "@/lib/saved-trips";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ savedTripId: string; conditionId: string }>;
};

type ConditionPatchBody = {
  threshold?: unknown;
  level?: unknown;
  isActive?: unknown;
};

function unauthorized() {
  return NextResponse.json(
    { success: false, message: "Authentication required." },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json(
    { success: false, message: "Condition not found." },
    { status: 404 },
  );
}

// PATCH /api/saved-trips/[savedTripId]/conditions/[conditionId]
//
// Editing a threshold re-arms the condition (see updateCondition), so a change
// takes effect on the next evaluation rather than waiting for the old setting
// to clear first.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  let body: ConditionPatchBody;
  try {
    body = (await req.json()) as ConditionPatchBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    body.threshold === undefined &&
    body.level === undefined &&
    body.isActive === undefined
  ) {
    return NextResponse.json(
      { success: false, message: "Nothing to update." },
      { status: 400 },
    );
  }

  const { savedTripId, conditionId } = await params;

  try {
    const trip = await updateCondition({
      userId: session.user.id,
      savedTripId,
      conditionId,
      patch: {
        ...(body.threshold !== undefined
          ? { threshold: typeof body.threshold === "number" ? body.threshold : null }
          : {}),
        ...(body.level !== undefined
          ? { level: typeof body.level === "string" ? (body.level as never) : null }
          : {}),
        ...(body.isActive !== undefined
          ? { isActive: Boolean(body.isActive) }
          : {}),
      },
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

    console.error("Updating alert condition failed:", error);

    return NextResponse.json(
      { success: false, message: "Could not update this condition. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) return unauthorized();

  const { savedTripId, conditionId } = await params;

  const trip = await deleteCondition({
    userId: session.user.id,
    savedTripId,
    conditionId,
  });

  if (!trip) return notFound();

  return NextResponse.json({ success: true, trip });
}
