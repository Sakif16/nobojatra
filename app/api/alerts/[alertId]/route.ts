import { auth } from "@/lib/auth";
import {
  countVisibleAlerts,
  markAlertRead,
  snoozeAlert,
  SNOOZE_DURATION_MS,
} from "@/lib/alerts";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ alertId: string }> };

const ACTIONS = ["read", "snooze"] as const;
type AlertAction = (typeof ACTIONS)[number];

function isAlertAction(value: unknown): value is AlertAction {
  return typeof value === "string" && ACTIONS.includes(value as AlertAction);
}

// PATCH /api/alerts/[alertId]  { "action": "read" | "snooze" }
//
// Dismiss or snooze one alert. The response carries the new unread count so
// the bell badge updates from the same round trip instead of re-polling.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  let body: { action?: unknown };
  try {
    body = (await req.json()) as { action?: unknown };
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isAlertAction(body?.action)) {
    return NextResponse.json(
      { success: false, message: `action must be one of: ${ACTIONS.join(", ")}.` },
      { status: 400 },
    );
  }

  const { alertId } = await params;

  const alert =
    body.action === "read"
      ? await markAlertRead(session.user.id, alertId)
      : await snoozeAlert(session.user.id, alertId);

  if (!alert) {
    return NextResponse.json(
      { success: false, message: "Alert not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    alert,
    unreadCount: await countVisibleAlerts(session.user.id),
    snoozeMinutes:
      body.action === "snooze" ? SNOOZE_DURATION_MS / 60_000 : undefined,
  });
}
