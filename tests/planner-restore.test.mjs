import assert from "node:assert/strict";
import test from "node:test";
import { load, requirePackage } from "./support/load.mjs";

const tripId = "507f1f77bcf86cd799439011";
const document = {
  country: "UK", timeZone: "Europe/London", passengerCount: 2,
  origin: { label: "A", lat: 51.5, lng: -0.12 },
  destination: { label: "B", lat: 51.52, lng: -0.1 },
  stops: [{ label: "Stop", lat: 51.51, lng: -0.11, dwellMinutes: 10 }],
  departureMode: "scheduled", scheduledAt: new Date("2026-10-02T09:00:00Z"),
  routeOptions: [1, 2].map((rank) => ({ routeId: `route-${rank}`, rank, distanceKm: rank + 3, durationMin: 20,
    coords: [[51.5, -0.12], [51.52, -0.1]], legs: [] })),
};

function setup(owner = "owner") {
  const queries = [];
  const restore = load("lib/planner-restore.ts", {
    mongoose: requirePackage("mongoose"),
    "@/lib/mongodb": async () => {},
    "@/models/TripHistory": { findOne: (query) => {
      queries.push(query);
      return { lean: async () => query.userId === owner && query._id === tripId ? document : null };
    } },
    "@/lib/fare-trip-context": {
      normalizeRouteCoords: (coords) => coords,
      normalizeRouteLegs: (legs) => legs,
    },
  });
  return { restore, queries };
}

test("restores the requested alternative and trip details without creating a search", async () => {
  const { restore, queries } = setup();
  const trip = await restore.getPlannerTrip("owner", tripId, "route-2");
  assert.deepEqual(queries, [{ _id: tripId, userId: "owner" }]);
  assert.equal(trip.selectedRouteId, "route-2");
  assert.equal(trip.routes.length, 2);
  assert.equal(trip.values.stops[0].dwellMinutes, 10);
  assert.equal(trip.values.passengerCount, 2);
  assert.equal(trip.values.scheduledLocal, "2026-10-02T10:00");
  assert.equal(trip.scheduledAt, "2026-10-02T09:00:00.000Z");
});

test("rejects another user's trip, invalid IDs and routes outside the trip", async () => {
  const { restore, queries } = setup();
  assert.equal(await restore.getPlannerTrip("other", tripId, "route-1"), null);
  assert.equal(await restore.getPlannerTrip("owner", tripId, "missing"), null);
  assert.equal(await restore.getPlannerTrip("owner", "invalid", "route-1"), null);
  assert.equal(queries.length, 2);
});
