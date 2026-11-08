import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

const { savedTripRequest } = load("components/saved-trips/saved-trip-request.ts");
const origin = { label: "A", lat: 23, lng: 90 };
const destination = { label: "B", lat: 24, lng: 90 };

test("saved-trip edits preserve stops and supply the version last seen", () => {
  const stops = [{ label: "Stop", lat: 23.5, lng: 90, dwellMinutes: 10 }];
  const result = savedTripRequest({ name: "  Commute  ", origin, destination, passengerCount: 2,
    initialTrip: { stops, updatedAt: "2026-10-01T10:00:00.000Z" } });
  assert.equal(result.name, "Commute");
  assert.deepEqual(result.stops, stops);
  assert.equal(result.expectedUpdatedAt, "2026-10-01T10:00:00.000Z");
});

test("new saved trips start without stops or a stale-edit version", () => {
  const result = savedTripRequest({ name: "Trip", origin, destination, passengerCount: 1 });
  assert.deepEqual(result.stops, []);
  assert.equal("expectedUpdatedAt" in result, false);
});
