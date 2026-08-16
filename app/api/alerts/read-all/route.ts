import { auth } from "@/lib/auth";
import { countVisibleAlerts, markAllAlertsRead } from "@/lib/alerts";
import { NextRequest, NextResponse } from "next/server";

// POST /api/alerts/read-all
//
// Dismisses everything currently surfaced. Snoozed alerts are deliberately
// left alone — the user asked to be reminded later, and a bulk dismiss should
// not quietly cancel that.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const dismissed = await markAllAlertsRead(session.user.id);

  return NextResponse.json({
    success: true,
    dismissed,
    unreadCount: await countVisibleAlerts(session.user.id),
  });
}
