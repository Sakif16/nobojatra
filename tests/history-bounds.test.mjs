import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const NOW = new Date("2026-10-11T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const vehicle = { provider: "p", vehicleType: "car", displayName: "Car", estimatedFareLow: 100, estimatedFareHigh: 120 };

/** lib/trip-history over an in-memory collection that records each query. */
function setup(records) {
  const queries = [];
  const inRange = (record, range) => {
    if (!range) return true;
    const at = new Date(record.createdAt).getTime();
    if (range.$gte && at < range.$gte.getTime()) return false;
    if (range.$lt && at >= range.$lt.getTime()) return false;
    return true;
  };
  const history = load("lib/trip-history.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    "@/models/TripHistory": {
      find: (filter) => {
        const query = { filter, select: null, limit: null };
        queries.push(query);
        const found = records
          .filter((record) => inRange(record, filter.createdAt))
          .filter((record) => !filter.selectedVehicle || record.selectedVehicle)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const chain = {
          select: (fields) => {
            query.select = fields;
            return chain;
          },
          sort: () => chain,
          limit: (count) => {
            query.limit = count;
            return chain;
          },
          lean: async () => found.slice(0, query.limit ?? found.length),
        };
        return chain;
      },
    },
  });
  return { history, queries };
}

const search = (index, overrides = {}) => ({
  _id: `search-${index}`,
  country: "BD",
  timeZone: "Asia/Dhaka",
  origin: { label: "A" },
  destination: { label: "B" },
  createdAt: new Date(NOW.getTime() - index * HOUR).toISOString(),
  ...overrides,
});

test("the saved plans list is capped, says so, and loads no route geometry", async () => {
  const plans = Array.from({ length: 130 }, (_, index) => search(index, { selectedVehicle: vehicle }));
  const { history, queries } = setup(plans);

  const page = await history.getTripHistoryPage("user");

  assert.equal(page.trips.length, 100);
  assert.equal(page.truncated, true);
  assert.equal(page.limit, 100);
  // The newest are the ones kept, and the totals describe the same rows.
  assert.equal(page.trips[0].id, "search-0");
  assert.equal(page.summary.tripCount, 100);
  assert.equal(page.summary.totalCost, 100 * 110);

  // One row past the limit, to learn whether there were more.
  assert.equal(queries[0].limit, 101);
  assert.doesNotMatch(queries[0].select, /routeOptions|selectedRoute|coords/);

  const small = await setup(plans.slice(0, 7)).history.getTripHistoryPage("user");
  assert.equal(small.trips.length, 7);
  assert.equal(small.truncated, false);
});

test("searches are capped per list and limited to the last six months", async () => {
  const recent = Array.from({ length: 260 }, (_, index) => search(index));
  const { history, queries } = setup([
    ...recent,
    // Seven months back: outside the months that are grouped.
    search(0, { _id: "old", createdAt: "2026-03-10T00:00:00Z" }),
  ]);

  const activity = await history.getTripHistoryActivityData("user", NOW);

  assert.equal(activity.lastSevenDays.length, 50);
  assert.equal(activity.lastSevenDaysTruncated, true);
  const monthly = activity.monthlyGroups.flatMap((group) => group.trips);
  assert.equal(monthly.length, 200);
  assert.equal(activity.monthlyTruncated, true);
  assert.equal(monthly.some((trip) => trip.id === "old"), false);

  const [lastSeven, months] = queries;
  assert.equal(lastSeven.limit, 51);
  assert.equal(months.limit, 201);
  for (const query of [lastSeven, months]) {
    assert.doesNotMatch(query.select, /routeOptions|selectedRoute|coords/);
  }
  // The monthly query no longer reads the account's whole history.
  assert.ok(months.filter.createdAt.$gte instanceof Date);
  assert.equal(months.filter.createdAt.$gte.toISOString(), "2026-04-30T00:00:00.000Z");
});

test("a month is shown whole or not at all", async () => {
  // 01:00 on 1 May in Dhaka is still 30 April in UTC: inside the six months.
  const edge = search(0, { _id: "may-edge", createdAt: "2026-04-30T19:00:00Z" });
  // 23:00 on 30 April in Dhaka: an April search, which is not grouped.
  const before = search(0, { _id: "april", createdAt: "2026-04-30T17:00:00Z" });
  const { history } = setup([edge, before]);

  const activity = await history.getTripHistoryActivityData("user", NOW);

  assert.deepEqual(
    activity.monthlyGroups.map((group) => [group.monthLabel, group.trips.map((trip) => trip.id)]),
    [["May 2026", ["may-edge"]]],
  );
  assert.equal(activity.monthlyTruncated, false);
});

test("a search is no longer recorded as a completed journey", async () => {
  const created = [];
  const history = load("lib/trip-history.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    "@/models/TripHistory": {
      create: async (document) => {
        created.push(document);
        return { _id: "new" };
      },
    },
  });

  await history.createTripHistoryRecord({
    userId: "user",
    country: "BD",
    routes: [],
    trip: {
      origin: { label: "A", lat: 23.7, lng: 90.4 },
      destination: { label: "B", lat: 23.8, lng: 90.4 },
      stops: [],
      passengerCount: 1,
      departureMode: "now",
      timeZone: "Asia/Dhaka",
    },
  });

  assert.equal("completedAt" in created[0], false);
  // And the schema no longer fills it in on its own.
  const model = fs.readFileSync(path.join(root, "models/TripHistory.ts"), "utf8");
  assert.doesNotMatch(model, /completedAt:\s*\{\s*type: Date,\s*default: Date\.now/);
});

test("the history lists have the indexes their queries use", () => {
  const model = fs.readFileSync(path.join(root, "models/TripHistory.ts"), "utf8");

  assert.match(model, /index\(\{ userId: 1, createdAt: -1 \}\)/);
  assert.match(model, /index\(\{ userId: 1, departureMode: 1, scheduledAt: 1 \}\)/);
});

test("searches and saved plans are separate tabs, and searches are not called trips", () => {
  const screen = fs.readFileSync(path.join(root, "components/TripHistoryList.tsx"), "utf8");

  assert.match(screen, /label: 'Saved plans'/);
  assert.match(screen, /label: 'Route searches'/);
  assert.match(screen, /search\{selectedActivityTrips\.length === 1 \? '' : 'es'\}/);
  assert.doesNotMatch(screen, /\} trip\{selectedActivityTrips/);
  assert.match(screen, /A\s+search is not a trip taken/);
});
