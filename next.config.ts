import type { NextConfig } from "next";

// Sent with every response, pages and API alike. The content security policy
// is not here: it carries a per-request nonce, so proxy.ts builds it for each
// page.
//
//   - nosniff stops a browser treating a response as a different type from the
//     one it was served as.
//   - X-Frame-Options stops another site embedding the app to trick a
//     signed-in user into clicking. The policy's frame-ancestors says the same
//     for pages; this covers every other response and older browsers.
//   - The referrer policy keeps trip ids in page URLs from being sent to other
//     sites the app links to or loads from.
//   - HSTS keeps a returning browser on HTTPS. Browsers ignore it on plain
//     http://localhost, so it does not get in the way of development.
//   - The permissions policy allows location, which "use my location" needs,
//     and the camera only for the embedded live-cams app, which the iframe in
//     components/live-cams/LiveCamsFrame hands it to. The microphone is off:
//     nothing here asks for it.
// Keep in step with LIVE_CAMS_URL in lib/live-cams.ts; a test checks it.
const LIVE_CAMS_ORIGIN = "https://traffic-punk-re.onrender.com";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: `geolocation=(self), camera=(self "${LIVE_CAMS_ORIGIN}"), microphone=()`,
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
