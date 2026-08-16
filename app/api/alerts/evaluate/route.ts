import { evaluateDueTrips, evaluateForUser } from "@/lib/alert-evaluator";
import { auth } from "@/lib/auth";
import { createRateLimiter, getClientIp, getRateLimitHeaders } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * Runs the alert evaluator.
 *
 * Two callers, two modes:
 *
 *   Bearer ALERT_EVALUATION_SECRET — sweeps trips due across every user. This
 *   is the entry point for a scheduled job (a GitHub Actions cron, say). The
 *   secret is compared with a timing-safe length check first so a wrong-length
 *   guess cannot be distinguished by response time.
 *
 *   A signed-in session — evaluates only that user's trips. Handy for a manual
 *   "check now" button, and the same path phase 6 will call from after().
 *
 * Evaluation is expensive (one routing, traffic, weather, and fare call per
 * trip), so both modes are rate limited and both respect the evaluator's own
 * 15-minute per-trip throttle unless `force` is set by the scheduled caller.
 */
const limiter = createRateLimiter({ windowMs: 60_000, max: 6 });

function timingSafeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function POST(req: NextRequest) {
  const rate = limiter(getClientIp(req));

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, message: "Too many evaluation requests." },
      {
        status: 429,
        headers: { ...getRateLimitHeaders(rate), "Retry-After": String(rate.retryAfter) },
      },
    );
  }

  const secret = process.env.ALERT_EVALUATION_SECRET ?? "";
  const authorization = req.headers.get("authorization") ?? "";
  const presentedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  const isScheduledCaller =
    secret.length > 0 && presentedToken.length > 0 && timingSafeEquals(presentedToken, secret);

  if (isScheduledCaller) {
    const summary = await evaluateDueTrips({ force: true });

    return NextResponse.json(
      { success: true, mode: "scheduled", ...summary },
      { headers: getRateLimitHeaders(rate) },
    );
  }

  // A bearer token was offered but did not match — say so rather than falling
  // through to the session path, which would mask a misconfigured cron job.
  if (presentedToken) {
    return NextResponse.json(
      { success: false, message: "Invalid evaluation token." },
      { status: 401, headers: getRateLimitHeaders(rate) },
    );
  }

  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401, headers: getRateLimitHeaders(rate) },
    );
  }

  const summary = await evaluateForUser(session.user.id);

  return NextResponse.json(
    { success: true, mode: "user", ...summary },
    { headers: getRateLimitHeaders(rate) },
  );
}
