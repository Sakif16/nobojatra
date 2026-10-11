import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const loadNav = () => load("lib/navigation.ts");

test("every signed-in page links to every destination, including scheduled trips", () => {
  const { PRIMARY_LINKS } = loadNav();

  assert.deepEqual(
    PRIMARY_LINKS.map((link) => link.href),
    ["/", "/scheduled-trips", "/saved-trips", "/trip-history", "/live-cams"],
  );
  // Each link leads to a page that exists.
  for (const { href } of PRIMARY_LINKS) {
    const page = href === "/" ? "app/(main)/page.tsx" : `app/(main)${href}/page.tsx`;
    assert.equal(fs.existsSync(path.join(root, page)), true, page);
  }
  // It is in the navbar, so it is on every page under the main layout.
  assert.match(read("components/navbar.tsx"), /<PrimaryNav /);
  assert.match(read("components/PrimaryNav.tsx"), /aria-current=\{current \? "page" : undefined\}/);
  assert.match(read("components/PrimaryNav.tsx"), /<nav aria-label="Primary"/);
});

test("the current page is the one whose path the visitor is on", () => {
  const { isCurrentPath } = loadNav();

  assert.equal(isCurrentPath("/", "/"), true);
  // The planner is not "current" on every page just because every path starts with "/".
  assert.equal(isCurrentPath("/", "/saved-trips"), false);
  assert.equal(isCurrentPath("/saved-trips", "/saved-trips"), true);
  assert.equal(isCurrentPath("/trip-history", "/trip-history/anything"), true);
  assert.equal(isCurrentPath("/saved-trips", "/saved-trips-archive"), false);
});

test("the home page no longer carries a second set of navigation links", () => {
  const home = read("components/home/AuthedHome.tsx");

  for (const href of ["/trip-history", "/live-cams", "/saved-trips"]) {
    assert.equal(home.includes(`href="${href}"`), false, href);
  }
});

test("errors are announced as alerts and progress as status, from one component", () => {
  const message = read("components/ui/status-message.tsx");
  assert.match(message, /role=\{tone === "error" \? "alert" : "status"\}/);

  for (const file of [
    "components/map/MapDashboardSection.tsx",
    "components/saved-trips/SavedTripForm.tsx",
    "components/saved-trips/SavedTripsManager.tsx",
  ]) {
    assert.match(read(file), /<StatusMessage/, file);
  }
  const profile = read("app/(main)/profile/profile-form.tsx");
  assert.equal((profile.match(/role="alert"/g) ?? []).length >= 2, true);
});

test("a plan copies as plain text that carries the same caveat as the screen", () => {
  const { buildPlanSummary } = load("lib/plan-summary.ts");

  assert.equal(
    buildPlanSummary({
      originLabel: "Dhanmondi",
      destinationLabel: "Uttara",
      stopCount: 2,
      passengerCount: 3,
      distanceKm: 14.2,
      durationMin: 41.6,
      vehicleName: "Uber X",
      fare: "৳320–390",
      departure: "Tue, Oct 13, 2026, 9:00 AM GMT+6",
    }),
    [
      "NoboJatra trip plan",
      "Dhanmondi → Uttara, 2 stops",
      "Departing Tue, Oct 13, 2026, 9:00 AM GMT+6",
      "14.2 km · about 42 min · 3 passengers",
      "Uber X, estimated fare ৳320–390",
      "Estimates only. This is a plan, not a booking.",
    ].join("\n"),
  );
  // Missing pieces are left out, not printed as blanks.
  assert.equal(
    buildPlanSummary({
      originLabel: "A",
      destinationLabel: "B",
      stopCount: 0,
      passengerCount: 1,
      distanceKm: null,
      durationMin: null,
      vehicleName: null,
      fare: null,
      departure: null,
    }),
    ["NoboJatra trip plan", "A → B", "1 passenger", "Estimates only. This is a plan, not a booking."].join("\n"),
  );

  const summary = read("components/TripSummary.tsx");
  assert.match(summary, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(summary, /Could not copy the plan/);
});
