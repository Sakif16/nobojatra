import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

test("the framework's sample images are gone and nothing points at them", () => {
  for (const name of ["next.svg", "vercel.svg", "file.svg", "globe.svg", "window.svg"]) {
    assert.equal(exists(`public/${name}`), false, name);
  }
});

test("the footer states no address or email that nobody supplied", () => {
  const footer = read("components/Footer.tsx");

  assert.doesNotMatch(footer, /mailto:|@nobojatra\.app|addressLines/);
  assert.doesNotMatch(footer, />\s*Contact\s*</);
  // The estimate caveat stays.
  assert.match(footer, /Fares and travel times are estimates, not quotes\./);
});

test("every page has a title of its own", () => {
  const titled = [
    "app/(main)/page.tsx",
    "app/(main)/fares/page.tsx",
    "app/(main)/ranked-options/page.tsx",
    "app/(main)/trip-summary/page.tsx",
    "app/(main)/trip-history/page.tsx",
    "app/(main)/scheduled-trips/page.tsx",
    "app/(main)/saved-trips/page.tsx",
    "app/(main)/live-cams/page.tsx",
    "app/(main)/profile/page.tsx",
    "app/(auth)/signin/layout.tsx",
    "app/(auth)/signup/layout.tsx",
    "app/(auth)/forgot-password/layout.tsx",
    "app/(auth)/reset-password/page.tsx",
    "app/not-found.tsx",
  ];
  const titles = titled.map((file) => {
    const match = /export const metadata: Metadata = \{ title: ["']([^"']+)["'] \}/.exec(read(file));
    assert.ok(match, `${file} has no title`);
    return match[1];
  });

  assert.equal(new Set(titles).size, titles.length);
  // The app's name is added to each by the root layout.
  assert.match(read("app/layout.tsx"), /template: "%s · NoboJatra"/);
});

test("the manifest and robots file describe the app as it is", () => {
  const manifest = load("app/manifest.ts").default();
  assert.equal(manifest.name, "NoboJatra");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    assert.equal(exists(`app${icon.src}`), true, icon.src);
  }

  // Members-only: crawlers get the two public pages and nothing else.
  assert.deepEqual(load("app/robots.ts").default().rules, {
    userAgent: "*",
    allow: ["/signin", "/signup"],
    disallow: "/",
  });
});

test("the dark theme is declared as the one theme, not left as an accident", () => {
  const layout = read("app/layout.tsx");

  assert.match(layout, /colorScheme: "dark"/);
  assert.match(layout, /className=\{`\$\{inter\.variable\} dark /);
  assert.equal(load("app/manifest.ts").default().theme_color, "#19140f");
});

test("Bangladesh has no rush hour on Friday or Saturday", () => {
  const { COUNTRY_CONFIG } = load("lib/country-config.ts");
  const { isPeakHour } = load("lib/traffic-service.ts");
  // 09:00 in Dhaka on each day of one week.
  const nineAm = (day) => new Date(`2026-09-${day}T03:00:00Z`);

  assert.deepEqual(COUNTRY_CONFIG.BD.nonPeakWeekdays, [5, 6]);
  assert.equal(isPeakHour(nineAm(24), "BD", "Asia/Dhaka"), true); // Thursday
  assert.equal(isPeakHour(nineAm(25), "BD", "Asia/Dhaka"), false); // Friday
  assert.equal(isPeakHour(nineAm(26), "BD", "Asia/Dhaka"), false); // Saturday
  assert.equal(isPeakHour(nineAm(27), "BD", "Asia/Dhaka"), true); // Sunday
  // The other countries keep Saturday and Sunday.
  assert.deepEqual(COUNTRY_CONFIG.UK.nonPeakWeekdays, [0, 6]);
});
