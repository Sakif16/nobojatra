import { auth } from "@/lib/auth";
import { listAlerts, MAX_ALERT_PAGE_SIZE } from "@/lib/alerts";
import { NextRequest, NextResponse } from "next/server";

// GET /api/alerts?limit=&before=&includeHidden=
//
// Reverse-chronological notification list. By default it returns only what is
// surfaced — unread and not currently snoozed — because that is what the
// notification center shows. `includeHidden=1` returns dismissed and snoozed
// alerts too, for a history view.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;

  if (rawLimit && (!Number.isFinite(limit) || (limit as number) < 1)) {
    return NextResponse.json(
      {
        success: false,
        message: `limit must be a number between 1 and ${MAX_ALERT_PAGE_SIZE}.`,
      },
      { status: 400 },
    );
  }

  const page = await listAlerts(session.user.id, {
    limit,
    before: searchParams.get("before"),
    includeHidden: searchParams.get("includeHidden") === "1",
  });

  return NextResponse.json({ success: true, ...page });
}
