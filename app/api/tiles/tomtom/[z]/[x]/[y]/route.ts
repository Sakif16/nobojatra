import { NextResponse } from "next/server";

/**
 * Proxies TomTom's traffic-flow raster tiles through the server so the
 * TomTom key never has to be shipped to the browser (a NEXT_PUBLIC_ env var
 * would be readable by anyone from the page's JS bundle). This route lives
 * at its own dynamic path — /api/traffic/live has no z/x/y segments, so a
 * GET handler with that params shape doesn't belong there and previously
 * broke the production build's type-check.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: "Traffic tiles are not configured." },
      { status: 500 }
    );
  }

  const { z, x, y } = await params;
  if (![z, x, y].every((value) => /^\d+$/.test(value))) {
    return NextResponse.json(
      { success: false, message: "Invalid tile coordinates." },
      { status: 400 }
    );
  }

  const tileUrl = `https://api.tomtom.com/maps/orbis/traffic/tile/flow/${z}/${x}/${y}.png?apiVersion=1&key=${apiKey}&style=light&tileSize=512`;

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
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    },
  });
}