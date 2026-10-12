import { auth } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { reportFailure, withRequestLogging } from "@/lib/error-reporting";
import { NextResponse } from "next/server";

const checkLimit = createRateLimiter({ windowMs: 60_000, max: 6 });

async function handlePost(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  const limit = checkLimit(session.user.id);
  if (!limit.allowed) return NextResponse.json({ success: false, message: "Too many reports." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ success: false, message: body.message }, { status: 400 });
  const event = body.body.event;
  if (event !== "camera_timeout" && event !== "camera_load_error") {
    return NextResponse.json({ success: false, message: "Unknown diagnostic event." }, { status: 400 });
  }
  reportFailure("camera", "traffic_punk", { name: event === "camera_timeout" ? "TimeoutError" : "EmbedLoadError" });
  return NextResponse.json({ success: true });
}

export const POST = withRequestLogging("camera", "traffic_punk", handlePost);
