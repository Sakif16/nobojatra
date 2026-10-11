import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/content-security-policy";

/**
 * Stamps every page with a content security policy and the nonce that goes
 * with it. Next.js reads the nonce back off the request header during
 * rendering and puts it on its own scripts, which is why this has to run
 * before the page renders and why pages are rendered per request (see
 * app/layout.tsx) rather than built once.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    photoModelUrl: process.env.NEXT_PUBLIC_TM_MODEL_URL,
    mapboxEnabled: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);

  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. API responses are JSON, and static files and images carry
      // no scripts to police. Prefetches are skipped because a nonce issued
      // for one would never be used.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
