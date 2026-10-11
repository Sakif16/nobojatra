import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

function loadHistoryWith(record) {
  return load("lib/trip-history.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    "@/models/TripHistory": { findOne: async () => record },
  });
}

const routeA = { routeId: "route-a", distanceKm: 8, durationMin: 25 };
const routeB = { routeId: "route-b", distanceKm: 11, durationMin: 31 };

function savedPlanOnRouteA() {
  return {
    _id: "trip",
    routeOptions: [routeA, routeB],
    selectedRoute: routeA,
    distanceKm: routeA.distanceKm,
    durationMin: routeA.durationMin,
    selectedVehicle: { provider: "p", vehicleType: "go", estimatedFareLow: 90, estimatedFareHigh: 110, estimatedDurationMin: 27 },
    selectionSnapshot: { weather: { severityBand: "low" }, traffic: null },
    selectedAt: new Date("2026-10-01T00:00:00Z"),
    saves: 0,
    async save() {
      this.saves += 1;
    },
  };
}

test("choosing a different route drops the vehicle saved on the old one", async () => {
  const record = savedPlanOnRouteA();
  const history = loadHistoryWith(record);

  const result = await history.updateSelectedTripRoute({
    userId: "user",
    tripHistoryId: "trip",
    routeId: "route-b",
  });

  // Route B's path with route A's fare, duration and weather is the mix this
  // prevents.
  assert.equal(result.vehicleChoiceCleared, true);
  assert.equal(record.selectedRoute, routeB);
  assert.equal(record.distanceKm, 11);
  assert.equal(record.durationMin, 31);
  assert.equal(record.selectedVehicle, null);
  assert.equal(record.selectionSnapshot, null);
  assert.equal(record.selectedAt, null);
  assert.equal(record.saves, 1);
});

test("re-selecting the same route keeps the saved vehicle", async () => {
  const record = savedPlanOnRouteA();
  const vehicle = record.selectedVehicle;
  const history = loadHistoryWith(record);

  const result = await history.updateSelectedTripRoute({
    userId: "user",
    tripHistoryId: "trip",
    routeId: "route-a",
  });

  assert.equal(result.vehicleChoiceCleared, false);
  assert.equal(record.selectedVehicle, vehicle);
  assert.notEqual(record.selectedAt, null);
});

test("changing route before any vehicle is saved clears nothing", async () => {
  const record = { ...savedPlanOnRouteA(), selectedVehicle: null, selectionSnapshot: null, selectedAt: null };
  const history = loadHistoryWith(record);

  const result = await history.updateSelectedTripRoute({
    userId: "user",
    tripHistoryId: "trip",
    routeId: "route-b",
  });

  assert.equal(result.vehicleChoiceCleared, false);
  assert.equal(record.selectedRoute, routeB);
});

test("a place search can be cancelled, so a superseded query cannot answer", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const seen = [];
  globalThis.window = { location: { origin: "http://localhost" } };
  globalThis.fetch = (url, init) => {
    seen.push({ url: String(url), signal: init?.signal });
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
      setTimeout(() => resolve({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ success: true, data: [{ label: "late" }] }) }), 20);
    });
  };

  try {
    const { searchPlaces } = load("lib/geocode.ts");
    const first = new AbortController();
    const dhan = searchPlaces("Dhan", "BD", first.signal);
    first.abort();
    await assert.rejects(dhan, { name: "AbortError" });

    const dhanmondi = await searchPlaces("Dhanmondi", "BD", new AbortController().signal);
    assert.deepEqual(dhanmondi, [{ label: "late" }]);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].signal, first.signal);
    assert.match(seen[1].url, /query=Dhanmondi/);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  }
});
