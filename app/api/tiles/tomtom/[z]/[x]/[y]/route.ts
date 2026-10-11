import { auth } from "@/lib/auth";
import { parseTileCoordinates } from "@/lib/map-tiles";
import {
  budgetReachedMessage,
  ProviderBudgetError,
  spendProviderBudget,
} from "@/lib/provider-budget";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * Proxies TomTom's traffic-flow raster tiles through the server so the
 * TomTom key never has to be shipped to the browser (a NEXT_PUBLIC_ env var
 * would be readable by anyone from the page's JS bundle). This route lives
 * at its own dynamic path — /api/traffic/live has no z/x/y segments, so a
 * GET handler with that params shape doesn't belong there and previously
 * broke the production build's type-check.
 */
// A map view asks for a screenful of tiles at once and more on every pan, so
// the allowance is wide — but it is per account, and it ends.
const checkUserRateLimit = createRateLimiter({ windowMs: 60_000, max: 600 });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  // The map that shows these tiles is only reachable signed in. Without this
  // check the route is an open, key-hiding proxy to a metered API.
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "Traffic tiles are not configured." },
      { status: 500 }
    );
  }

  const rawTile = await params;
  const tile = parseTileCoordinates(rawTile.z, rawTile.x, rawTile.y);
  if (!tile) {
    return NextResponse.json(
      { success: false, message: "Invalid tile coordinates." },
      { status: 400 }
    );
  }
  const { z, x, y } = tile;

  const rateLimit = checkUserRateLimit(session.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, message: "Too many map tile requests. Please wait a moment." },
      {
        status: 429,
        headers: {
          ...getRateLimitHeaders(rateLimit),
          "Retry-After": String(rateLimit.retryAfter),
        },
      }
    );
  }

  try {
    await spendProviderBudget("tomtom_tiles");
  } catch (error) {
    if (!(error instanceof ProviderBudgetError)) throw error;
    return NextResponse.json(
      { success: false, message: budgetReachedMessage("traffic map tiles") },
      { status: 429 }
    );
  }

  // 256 matches Leaflet's default grid. A 512 tile covers the same area, so
  // Leaflet would squeeze it into a 256 slot: 2.5x the bytes, half-width lines.
  const tileUrl = `https://api.tomtom.com/maps/orbis/traffic/tile/flow/${z}/${x}/${y}.png?apiVersion=1&key=${apiKey}&style=light&tileSize=256`;

  let response: Response;
  try {
    response = await fetch(tileUrl, { signal: AbortSignal.timeout(8000) });
  } catch (error) {
    console.error("TomTom tile fetch failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to reach the traffic tile service." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    // Logged server-side only — the body can include upstream error detail
    // that shouldn't be exposed to callers, but we still need to see it here.
    const details = await response.text().catch(() => "");
    console.error(
      `TomTom tile request returned ${response.status} for z=${z} x=${x} y=${y}:`,
      details.slice(0, 300)
    );
    return NextResponse.json(
      { success: false, message: "Traffic tile service returned an error." },
      { status: 502 }
    );
  }

  const buffer = await response.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/png",
      // Traffic flow tiles are near-real-time; cache briefly, not indefinitely.
      // Private: the response is only for the signed-in user who asked for it,
      // so a shared cache must not serve it to someone who is not.
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}