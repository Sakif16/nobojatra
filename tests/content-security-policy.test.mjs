import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const TM_MODEL = "https://teachablemachine.withgoogle.com/models/abc123/";

function directives(policy) {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }),
  );
}

function build(options = {}) {
  const { buildContentSecurityPolicy } = load("lib/content-security-policy.ts");
  return directives(buildContentSecurityPolicy({ nonce: "test-nonce", ...options }));
}

test("scripts run only with the response's nonce, and strings are never evaluated", () => {
  const policy = build({ photoModelUrl: TM_MODEL });

  assert.deepEqual(policy["script-src"], [
    "'self'",
    "'nonce-test-nonce'",
    "'strict-dynamic'",
    "'wasm-unsafe-eval'",
  ]);
  // Neither of these may ever appear in production: each one undoes the policy.
  assert.equal(policy["script-src"].includes("'unsafe-inline'"), false);
  assert.equal(policy["script-src"].includes("'unsafe-eval'"), false);

  assert.deepEqual(policy["default-src"], ["'self'"]);
  assert.deepEqual(policy["object-src"], ["'none'"]);
  assert.deepEqual(policy["base-uri"], ["'self'"]);
  assert.deepEqual(policy["form-action"], ["'self'"]);
  assert.deepEqual(policy["frame-ancestors"], ["'none'"]);
});

test("each outside origin is allowed for the one purpose that needs it", () => {
  const { LIVE_CAMS_ORIGIN } = load("lib/live-cams.ts");
  const policy = build({ photoModelUrl: TM_MODEL });

  // Map tiles are images, from OpenStreetMap's servers and their a/b/c mirrors.
  assert.deepEqual(policy["img-src"], [
    "'self'",
    "blob:",
    "data:",
    "https://tile.openstreetmap.org",
    "https://*.tile.openstreetmap.org",
  ]);
  // The model link answers with a redirect to Google Cloud Storage; allowing
  // only the first host leaves photo search unable to download anything.
  assert.deepEqual(policy["connect-src"], [
    "'self'",
    "https://teachablemachine.withgoogle.com",
    "https://storage.googleapis.com/tm-model/",
  ]);
  assert.deepEqual(policy["frame-src"], [LIVE_CAMS_ORIGIN]);
  assert.deepEqual(policy["font-src"], ["'self'"]);

  // No origin is allowed for scripts, and none is allowed everywhere.
  for (const origin of ["openstreetmap.org", "googleapis.com", "withgoogle.com", "onrender.com"]) {
    assert.equal(policy["script-src"].some((source) => source.includes(origin)), false);
    assert.equal(policy["default-src"].some((source) => source.includes(origin)), false);
  }
});

test("the photo model's origin follows its setting, and a bad setting allows nothing", () => {
  assert.deepEqual(build({})["connect-src"], ["'self'"]);
  assert.deepEqual(build({ photoModelUrl: "" })["connect-src"], ["'self'"]);
  assert.deepEqual(build({ photoModelUrl: "not a url" })["connect-src"], ["'self'"]);
  assert.deepEqual(build({ photoModelUrl: "http://insecure.example/model/" })["connect-src"], ["'self'"]);
  // A model hosted somewhere else is allowed by its own origin only.
  assert.deepEqual(build({ photoModelUrl: "https://models.example.org/tm/v2/" })["connect-src"], [
    "'self'",
    "https://models.example.org",
  ]);
});

test("Mapbox and development additions appear only when switched on", () => {
  assert.equal(build({})["img-src"].includes("https://api.mapbox.com"), false);
  assert.equal(build({ mapboxEnabled: true })["img-src"].includes("https://api.mapbox.com"), true);

  const development = build({ isDevelopment: true });
  assert.equal(development["script-src"].includes("'unsafe-eval'"), true);
  assert.equal(development["connect-src"].includes("ws:"), true);
});

test("every page gets the policy with a nonce of its own", () => {
  const responses = [];
  const { proxy, config } = load("proxy.ts", {
    "next/server": {
      NextResponse: {
        next: ({ request }) => {
          const response = { headers: new Headers(), forwarded: request.headers };
          responses.push(response);
          return response;
        },
      },
    },
  });
  const nonceOf = (headers) => /'nonce-([^']+)'/.exec(headers.get("Content-Security-Policy"))[1];

  const first = proxy({ headers: new Headers({ cookie: "session=1" }) });
  const second = proxy({ headers: new Headers() });

  // The same policy goes to the browser and to the renderer, which reads the
  // nonce off the request to stamp its own scripts with it.
  assert.equal(first.headers.get("Content-Security-Policy"), first.forwarded.get("Content-Security-Policy"));
  assert.equal(first.forwarded.get("x-nonce"), nonceOf(first.headers));
  assert.equal(first.forwarded.get("cookie"), "session=1");
  assert.notEqual(nonceOf(first.headers), nonceOf(second.headers));
  assert.ok(nonceOf(first.headers).length >= 24);

  // Pages only: API responses and static files are left alone.
  const [{ source }] = config.matcher;
  const matches = (pathname) => new RegExp(`^${source}$`).test(pathname);
  for (const page of ["/", "/signin", "/fares", "/live-cams"]) assert.equal(matches(page), true, page);
  for (const other of ["/api/fares", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/icon.png"]) {
    assert.equal(matches(other), false, other);
  }
});
