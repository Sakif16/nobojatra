import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

function filesNamed(directory, name) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesNamed(relative, name);
    return entry.name === name ? [relative] : [];
  });
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every API route checks for a session", () => {
  // The sign-in endpoints themselves are the only routes a visitor may call.
  const open = new Set(["app/api/auth/[...all]/route.ts"]);
  const unguarded = filesNamed("app/api", "route.ts").filter(
    (file) => !open.has(file) && !read(file).includes("auth.api.getSession"),
  );

  assert.deepEqual(unguarded, []);
});

test("every page behind the main layout checks for a session, apart from the listed public ones", () => {
  const open = new Set([
    // Third-party camera streams; shows nothing belonging to a user.
    "app/(main)/live-cams/page.tsx",
    // Only redirects to the planner, which does its own check.
    "app/(main)/dashboard/page.tsx",
  ]);
  const unguarded = filesNamed("app/(main)", "page.tsx").filter((file) => {
    if (open.has(file)) return false;
    const source = read(file);
    return !(source.includes("auth.api.getSession") && /redirect\(["']\/signin["']\)/.test(source));
  });

  assert.deepEqual(unguarded, []);
});

test("every response carries the basic security headers", async () => {
  const config = load("next.config.ts").default;
  const [rule] = await config.headers();
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));

  assert.equal(rule.source, "/:path*");
  assert.equal(config.poweredByHeader, false);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  // The content security policy carries a per-request nonce, so proxy.ts sets
  // it; a second, static one here would be enforced alongside it.
  assert.equal(headers["Content-Security-Policy"], undefined);
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Strict-Transport-Security"], /^max-age=\d{8,}/);

  // The camera is only delegated to the origin the live-cams iframe loads.
  const camsOrigin = load("lib/live-cams.ts").LIVE_CAMS_ORIGIN;
  assert.equal(
    headers["Permissions-Policy"],
    `geolocation=(self), camera=(self "${camsOrigin}"), microphone=()`,
  );
});

test("the build does not fetch fonts from the network", () => {
  const sources = [...filesNamed("app", "layout.tsx"), ...filesNamed("app", "page.tsx")];

  const importsGoogleFont = (file) => /from\s+["']next\/font\/google["']/.test(read(file));

  assert.deepEqual(sources.filter(importsGoogleFont), []);
  assert.ok(fs.statSync(path.join(root, "app/fonts/inter-latin-variable.woff2")).size > 10_000);
});
