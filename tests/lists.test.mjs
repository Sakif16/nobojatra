import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const option = (name, mid, comfortScore, maxPassengers) => ({ name, fare: { mid }, comfortScore, maxPassengers });
const OPTIONS = [
  option("Car", 300, 4, 4),
  option("Bike", 120, 2, 1),
  option("CNG", 180, 3, 3),
  option("Premium", 300, 5, 4),
];
const names = (list) => list.map((entry) => entry.name);

test("fares can be ordered by fare, comfort or seats without reshuffling ties", () => {
  const { sortFareOptions, FARE_SORT_OPTIONS } = load("lib/fare-sorting.ts");

  assert.deepEqual(names(sortFareOptions(OPTIONS, "default")), ["Car", "Bike", "CNG", "Premium"]);
  // Car and Premium cost the same and keep the order they arrived in.
  assert.deepEqual(names(sortFareOptions(OPTIONS, "fare")), ["Bike", "CNG", "Car", "Premium"]);
  assert.deepEqual(names(sortFareOptions(OPTIONS, "comfort")), ["Premium", "Car", "CNG", "Bike"]);
  assert.deepEqual(names(sortFareOptions(OPTIONS, "seats")), ["Car", "Premium", "CNG", "Bike"]);
  // The list handed in is left alone.
  assert.deepEqual(names(OPTIONS), ["Car", "Bike", "CNG", "Premium"]);
  assert.deepEqual(FARE_SORT_OPTIONS.map((entry) => entry.value), ["default", "fare", "comfort", "seats"]);
});

test("an excluded option says why and what would bring it back", () => {
  const { describeUnavailable, hasCapacityExclusion } = load("lib/fare-sorting.ts");
  const tooSmall = { eligible: false, weatherBlocked: false, maxPassengers: 1 };
  const stormBound = {
    eligible: true,
    weatherBlocked: true,
    restrictionReason: "Bike services are blocked due to severe weather.",
    maxPassengers: 1,
  };

  assert.equal(
    describeUnavailable(tooSmall, 3),
    "Seats 1 passenger; this trip has 3. Plan with 1 or fewer to use it.",
  );
  assert.equal(
    describeUnavailable(stormBound, 1),
    "Bike services are blocked due to severe weather. It may be offered again when conditions ease.",
  );
  assert.match(describeUnavailable({ ...stormBound, eligible: false }, 3), /Seats 1 passenger.*severe weather/);

  // Only a capacity exclusion is something the planner can fix.
  assert.equal(hasCapacityExclusion([stormBound]), false);
  assert.equal(hasCapacityExclusion([stormBound, tooSmall]), true);

  const screen = fs.readFileSync(path.join(root, "components/FareResults.tsx"), "utf8");
  assert.match(screen, /Change the passenger count in the planner/);
  assert.match(screen, /sortFareOptions\(/);
});

const saved = (name, from, to, createdAt) => ({ name, origin: { label: from }, destination: { label: to }, createdAt });
const SAVED = [
  saved("School run", "Home, Dhanmondi", "Sunnydale School", "2026-10-01T00:00:00Z"),
  saved("commute", "Home, Dhanmondi", "Office, Gulshan", "2026-10-05T00:00:00Z"),
  saved("Airport", "Home, Dhanmondi", "Hazrat Shahjalal Airport", "2026-09-20T00:00:00Z"),
];

test("saved trips can be searched by name or place and put in order", () => {
  const { filterAndSortSavedTrips } = load("lib/saved-trip-list.ts");

  assert.deepEqual(names(filterAndSortSavedTrips(SAVED, "", "newest")), ["commute", "School run", "Airport"]);
  // Case does not decide the order.
  assert.deepEqual(names(filterAndSortSavedTrips(SAVED, "", "name")), ["Airport", "commute", "School run"]);
  assert.deepEqual(names(filterAndSortSavedTrips(SAVED, "gulshan", "newest")), ["commute"]);
  assert.deepEqual(names(filterAndSortSavedTrips(SAVED, "  SCHOOL ", "newest")), ["School run"]);
  // Every word has to match, in the name or either place.
  assert.deepEqual(names(filterAndSortSavedTrips(SAVED, "home airport", "newest")), ["Airport"]);
  assert.deepEqual(filterAndSortSavedTrips(SAVED, "nowhere", "newest"), []);
});

test("the saved trips screen shows its limit before it is reached", () => {
  const manager = fs.readFileSync(path.join(root, "components/saved-trips/SavedTripsManager.tsx"), "utf8");

  assert.match(manager, /\{trips\.length\} of \{maxTrips\} saved in \{serviceAreaName\}/);
  assert.match(manager, /disabled=\{listFull\}/);
  assert.match(manager, /Search by name or place/);
});
