import { auth } from "@/lib/auth";
import { countVisibleAlerts } from "@/lib/alerts";
import { NextRequest, NextResponse } from "next/server";

// GET /api/alerts/count
//
// The bell badge polls this, so it stays deliberately cheap: one count over
// the { userId, readAt, snoozedUntil, createdAt } index and nothing else.
// Phase 6 hangs lazy evaluation off this route via after(), which runs once
// the response has already been flushed.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const unreadCount = await countVisibleAlerts(session.user.id);

  return NextResponse.json({ success: true, unreadCount });
}
