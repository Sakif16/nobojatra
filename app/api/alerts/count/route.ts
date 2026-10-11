import { auth } from "@/lib/auth";
import { getAlertDigest } from "@/lib/alerts";
import { NextRequest, NextResponse } from "next/server";

// GET /api/alerts/count
//
// The bell badge polls this, so it stays deliberately cheap: one count and one
// single-row read over the { userId, readAt, snoozedUntil, createdAt } index.
//
// `latestId` is returned with the count so the bell can tell that the list has
// changed even when the number has not — one notification arriving while
// another is dismissed elsewhere leaves the count where it was.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const digest = await getAlertDigest(session.user.id);

  return NextResponse.json({ success: true, ...digest });
}
