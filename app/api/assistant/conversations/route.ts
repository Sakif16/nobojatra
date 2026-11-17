import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listChats } from "@/lib/assistant/conversations";
import { getUserCountry } from "@/lib/user-country";
import { withRequestLogging } from "@/lib/error-reporting";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";

const rateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

/**
 * The signed-in user's trip-assistant chats for the country they are planning
 * in, newest first. Chats from another country stay stored and come back when
 * the user switches back.
 */
async function handleGet(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }
  const limit = rateLimit(session.user.id);
  if (!limit.allowed) return NextResponse.json({ success: false, message: "Please wait a moment before loading chats again." }, {
    status: 429, headers: getRateLimitHeaders(limit),
  });

  const country = await getUserCountry(session.user.id);
  const chats = await listChats(session.user.id, country);

  return NextResponse.json({ success: true, chats }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withRequestLogging("assistant-chats", "mongodb", handleGet);
