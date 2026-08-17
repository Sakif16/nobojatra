import { evaluateForUser } from "@/lib/alert-evaluator";
import { auth } from "@/lib/auth";
import { countVisibleAlerts } from "@/lib/alerts";
import { after, NextRequest, NextResponse } from "next/server";

// GET /api/alerts/count
//
// The bell badge polls this, so the response path stays deliberately cheap:
// one count over the { userId, readAt, snoozedUntil, createdAt } index.
//
// Evaluation then runs in after(), once the response has already been flushed,
// which is what makes lazy evaluation viable at all — the badge never waits on
// a routing call. Alerts are in-app only, so an alert computed when the user
// next opens the app is worth exactly as much as one computed while they were
// away, and this avoids needing a scheduler for the common case.
//
// The evaluator's own 15-minute per-trip throttle keeps the cost down: most
// polls find nothing due and stop after a single indexed query.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const unreadCount = await countVisibleAlerts(userId);

  after(async () => {
    try {
      await evaluateForUser(userId);
    } catch (error) {
      // Nothing to report to a response that has already been sent; the next
      // poll retries anyway.
      console.error("Background alert evaluation failed:", error);
    }
  });

  return NextResponse.json({ success: true, unreadCount });
}
