import { LIVE_CAMS_ORIGIN } from "@/lib/live-cams";

/**
 * The content security policy sent with every page.
 *
 * It lists, by purpose, the only places a page may load from. Everything is
 * the app's own origin except the entries below, and each of those is here
 * because a feature stops working without it:
 *
 *   - Map tiles are images from OpenStreetMap's tile servers.
 *   - The photo-search model is fetched from Teachable Machine, which answers
 *     with a redirect to Google Cloud Storage, so both have to be allowed.
 *   - The live-cams page frames one third-party app.
 *
 * Adding a feature that loads from somewhere new means adding it here; the
 * browser otherwise blocks it and says so in the console.
 */

const OPENSTREETMAP_TILES = [
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
];

const MAPBOX_API = "https://api.mapbox.com";

/** Where Teachable Machine's shareable model links redirect to. */
const TEACHABLE_MACHINE_HOST = "teachablemachine.withgoogle.com";
const TEACHABLE_MACHINE_STORAGE = "https://storage.googleapis.com/tm-model/";

function getPhotoModelSources(photoModelUrl: string | undefined) {
  if (!photoModelUrl) return [];

  let url: URL;

  try {
    url = new URL(photoModelUrl);
  } catch {
    return [];
  }

  if (url.protocol !== "https:") return [];

  return url.host === TEACHABLE_MACHINE_HOST
    ? [url.origin, TEACHABLE_MACHINE_STORAGE]
    : [url.origin];
}

export type ContentSecurityPolicyOptions = {
  /** Fresh for every response; only scripts carrying it may run. */
  nonce: string;
  /** `next dev` needs eval for React's debugging and a socket for reloading. */
  isDevelopment?: boolean;
  /** NEXT_PUBLIC_TM_MODEL_URL, if photo search is configured. */
  photoModelUrl?: string;
  /** True when NEXT_PUBLIC_MAPBOX_TOKEN switches the map to Mapbox tiles. */
  mapboxEnabled?: boolean;
};

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment = false,
  photoModelUrl,
  mapboxEnabled = false,
}: ContentSecurityPolicyOptions) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Only scripts the server stamped with this response's nonce run, plus
    // whatever those scripts load themselves. An injected <script> has no
    // nonce, and inline event handlers are refused outright.
    //
    // 'wasm-unsafe-eval' permits compiling WebAssembly and nothing else. The
    // photo-search library probes for it on load; refusing only makes it fall
    // back to plain JavaScript and log a violation on every page that uses it.
    // It is not 'unsafe-eval': evaluating strings as code stays refused.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "'wasm-unsafe-eval'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    // React writes `style` attributes and Leaflet positions the map with them,
    // so inline styles cannot be refused.
    "style-src": ["'self'", "'unsafe-inline'"],
    // blob: is the preview of a photo the user picked; data: is used by the
    // map library and by icons embedded in stylesheets.
    "img-src": [
      "'self'",
      "blob:",
      "data:",
      ...OPENSTREETMAP_TILES,
      ...(mapboxEnabled ? [MAPBOX_API] : []),
    ],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      ...getPhotoModelSources(photoModelUrl),
      ...(isDevelopment ? ["ws:"] : []),
    ],
    "frame-src": [LIVE_CAMS_ORIGIN],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}
