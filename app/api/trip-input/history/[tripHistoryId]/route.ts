import { auth } from "@/lib/auth";
import { updateSelectedTripRoute } from "@/lib/trip-history";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tripHistoryId: string }> }
) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message: "Authentication required.",
      },
      { status: 401 }
    );
  }

  const { tripHistoryId } = await params;
  let body: { routeId?: unknown };

  try {
    body = (await req.json()) as { routeId?: unknown };
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  if (typeof body.routeId !== "string" || body.routeId.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "routeId is required.",
      },
      { status: 400 }
    );
  }

  const updated = await updateSelectedTripRoute({
    userId: session.user.id,
    tripHistoryId,
    routeId: body.routeId,
  });

  if (!updated) {
    return NextResponse.json(
      {
        success: false,
        message: "Trip history route was not found.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}
