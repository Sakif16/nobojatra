import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { root } from "./support/load.mjs";

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the navbar and footer run full width, lined up with the map sidebar", () => {
  const navbar = read("components/navbar.tsx");
  assert.doesNotMatch(navbar, /max-w-7xl/);
  assert.doesNotMatch(read("components/Footer.tsx"), /max-w-7xl/);
  // The header itself is the variable's height, border included, so the map
  // layout that subtracts it fits the window exactly.
  assert.equal(navbar.match(/<header className="sticky top-0 z-40 h-\(--app-header-height\) border-b/g)?.length, 2);
});

test("pages without a map share two widths", () => {
  const pages = {
    "components/TripSummary.tsx": /<PageContainer width="narrow">/,
    "components/TripHistoryList.tsx": /<PageContainer>/,
    "components/ScheduledTripsList.tsx": /<PageContainer>/,
    "app/(main)/saved-trips/page.tsx": /<PageContainer>/,
    "app/(main)/profile/profile-form.tsx": /<PageContainer className=/,
    "app/(main)/live-cams/page.tsx": /<PageContainer>/,
  };
  for (const [file, pattern] of Object.entries(pages)) {
    const source = read(file);
    assert.match(source, pattern, file);
    assert.doesNotMatch(source, /max-w-(4xl|5xl|7xl) px-4/, file);
  }
});

test("each page loads into a skeleton of its own shape", () => {
  assert.match(read("app/(main)/loading.tsx"), /<MapPageSkeleton \/>/);
  for (const page of ["trip-history", "scheduled-trips", "saved-trips", "profile", "live-cams", "trip-summary"]) {
    assert.match(read(`app/(main)/${page}/loading.tsx`), /<ListPageSkeleton/, page);
  }
});

test("the trip summary timeline line runs through its markers", () => {
  const summary = read("components/TripSummary.tsx");
  assert.doesNotMatch(summary, /border-l-2/);
  assert.match(summary, /absolute top-5 bottom-0 left-3 w-0\.5 -translate-x-1\/2 bg-border/);
});

test("list rows are borderless, inside one panel", () => {
  const fares = read("components/FareResults.tsx");
  assert.doesNotMatch(fares, /!isSelected && 'border-border bg-card'/);
  assert.doesNotMatch(fares, /disabled className="border-border bg-card/);
  assert.doesNotMatch(read("components/TripHistoryList.tsx"), /<ListRow [^>]*className="border-border bg-card"/);
  assert.doesNotMatch(read("components/saved-trips/SavedTripsManager.tsx"), /<article key=\{trip\.id\}><Panel/);
  assert.doesNotMatch(read("components/home/SuggestionTiles.tsx"), /rounded-lg border/);
});

test("only primary buttons glow on hover", () => {
  assert.doesNotMatch(read("app/globals.css"), /button:not\(:disabled\)[^{]*:hover/);
  const button = read("components/ui/button.tsx");
  assert.match(button, /default: "bg-primary text-primary-foreground hover:bg-primary\/90 hover:shadow-\[/);
  assert.equal(button.match(/hover:shadow-\[/g)?.length, 1);
});

test("list pages use the shared states and controls", () => {
  const saved = read("components/saved-trips/SavedTripsManager.tsx");
  assert.match(saved, /<SkeletonRows label="Loading saved trips…" \/>/);
  assert.match(saved, /<EmptyState\s/);
  assert.match(saved, /formRef\.current\?\.scrollIntoView\(/);

  const history = read("components/TripHistoryList.tsx");
  assert.doesNotMatch(history, /role="tablist"|role="tab"/);
  assert.match(history, /<SkeletonRows label="Loading trip history…" \/>/);
  assert.equal(history.match(/>Last 7 days</g)?.length, 1);

  assert.match(read("components/TripSummary.tsx"), /href=\{`\/fares\?\$\{new URLSearchParams\(\{ tripHistoryId: trip\.id, routeId: trip\.routeId \}\)\}`\}/);
  assert.match(read("lib/navigation.ts"), /\{ href: "\/live-cams", label: "Live cams" \}/);
});
