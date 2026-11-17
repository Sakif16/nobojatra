import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteChat, getChatDetail } from "@/lib/assistant/conversations";
import { withRequestLogging } from "@/lib/error-reporting";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";

/**
 * One trip-assistant chat, for its owner only. Another account's id gets the
 * same 404 as one that does not exist.
 */

type RouteContext = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ success: false, message: "That chat could not be found." }, { status: 404 });
const rateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

function limited(userId: string) {
  const limit = rateLimit(userId);
  return limit.allowed ? null : NextResponse.json({ success: false, message: "Please wait a moment before changing chats again." }, {
    status: 429, headers: getRateLimitHeaders(limit),
  });
}

async function handleGet(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }
  const limit = limited(session.user.id);
  if (limit) return limit;

  const { id } = await params;
  const chat = await getChatDetail(session.user.id, id);
  if (!chat) return notFound();

  return NextResponse.json({ success: true, chat }, { headers: { "Cache-Control": "no-store" } });
}

async function handleDelete(req: NextRequest, { params }: RouteContext) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }
  const limit = limited(session.user.id);
  if (limit) return limit;

  const { id } = await params;
  if (!(await deleteChat(session.user.id, id))) return notFound();

  return NextResponse.json({ success: true });
}

export const GET = withRequestLogging("assistant-chats", "mongodb", handleGet);
export const DELETE = withRequestLogging("assistant-chats", "mongodb", handleDelete);
