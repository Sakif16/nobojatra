import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const DHAKA_ROUTE = [
  { lat: 23.8103, lng: 90.4125 },
  { lat: 23.8759, lng: 90.3795 },
];
const LONDON_ROUTE = [
  { lat: 51.5072, lng: -0.1276 },
  { lat: 51.5416, lng: -0.0034 },
];

/** Replaces fetch for one test and counts the calls made to the provider. */
async function withProvider(summary, body) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TOMTOM_API_KEY;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return { ok: true, status: 200, json: async () => ({ routes: [{ summary }] }) };
  };
  process.env.TOMTOM_API_KEY = "test-key";
  try {
    return await body(requests);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previousKey;
  }
}

// What the provider returns where it has no traffic data: a route, no delay.
const NO_DELAY = {
  lengthInMeters: 9000,
  travelTimeInSeconds: 1200,
  noTrafficTravelTimeInSeconds: 1200,
  trafficDelayInSeconds: 0,
};

test("Bangladesh traffic is refused before the provider is asked", async () => {
  const traffic = load("lib/traffic-service.ts");

  await withProvider(NO_DELAY, async (requests) => {
    await assert.rejects(
      traffic.getTrafficForTrip(DHAKA_ROUTE, { mode: "now" }, "BD"),
      (error) => {
        assert.equal(error instanceof traffic.TrafficServiceError, true);
        assert.equal(error.userMessage, "Live traffic is not available in Bangladesh.");
        return true;
      },
    );
    // The provider would have answered "no delay", which reads as light traffic.
    assert.equal(requests.length, 0);

    // The same answer in a covered country is a real reading and is used.
    const london = await traffic.getTrafficForTrip(LONDON_ROUTE, { mode: "now" }, "UK");
    assert.equal(requests.length, 1);
    assert.equal(london.totals.congestionLevel, "low");
  });
});

test("peak hours still apply in Bangladesh, where they come from the clock", () => {
  const traffic = load("lib/traffic-service.ts");
  const sundayNine = { mode: "scheduled", scheduledAt: "2026-09-20T03:00:00.000Z" };
  const sundayThree = { mode: "scheduled", scheduledAt: "2026-09-20T09:00:00.000Z" };

  assert.equal(traffic.isDeparturePeakHour(DHAKA_ROUTE[0], sundayNine, "BD"), true);
  assert.equal(traffic.isDeparturePeakHour(DHAKA_ROUTE[0], sundayThree, "BD"), false);
});

function loadFareContext(document, calls) {
  return load("lib/fare-trip-context.ts", {
    "@/lib/mongodb": async () => {},
    "@/models/TripHistory": { findOne: () => ({ lean: async () => document }) },
    "@/lib/weather": { fetchWeatherForPoint: async () => ({ severityBand: "low", severityScore: 0 }) },
    "@/lib/traffic-service": {
      ...load("lib/traffic-service.ts"),
      getTrafficForTrip: async (...args) => {
        calls.push(args);
        return { totals: { congestionLevel: "low" }, isPeakHour: true };
      },
    },
  });
}

test("a Bangladesh fare has no traffic reading but keeps its peak-hour adjustment", async () => {
  const calls = [];
  const context = loadFareContext(
    {
      country: "BD",
      origin: { label: "A", ...DHAKA_ROUTE[0] },
      destination: { label: "B", ...DHAKA_ROUTE[1] },
      passengerCount: 1,
      departureMode: "scheduled",
      scheduledAt: new Date("2026-09-20T03:00:00.000Z"),
      routeOptions: [
        {
          routeId: "route-0",
          distanceKm: 9,
          durationMin: 20,
          coords: DHAKA_ROUTE.map(({ lat, lng }) => [lat, lng]),
        },
      ],
    },
    calls,
  );
  const loaded = await context.loadFareTripContext("owner", "trip", "route-0");
  const traffic = await context.getFareTripTraffic(loaded.context);

  assert.deepEqual(traffic, { traffic: null, trafficUnavailable: true });
  assert.equal(calls.length, 0);
  assert.deepEqual(context.getFareAdjustmentContext(loaded.context, null, traffic.traffic).traffic, {
    congestionLevel: null,
    isPeakHour: true,
  });

  // Same trip, same peak-hour multiplier, and nothing added for congestion.
  const { getFareAdjustment } = load("lib/fare-providers.ts");
  const adjustment = getFareAdjustment(
    { provider: "uber", vehicleType: "go" },
    context.getFareAdjustmentContext(loaded.context, null, traffic.traffic),
  );
  assert.equal(adjustment.trafficMultiplier, 1);
  assert.ok(adjustment.peakHourMultiplier > 1);
  assert.equal(adjustment.notes.some((note) => /traffic/i.test(note)), false);
});

const option = (overrides) => ({
  provider: "p",
  vehicleType: "go",
  displayName: "Car",
  maxPassengers: 4,
  comfortScore: 3,
  eligible: true,
  weatherRestricted: false,
  weatherBlocked: false,
  restrictionReason: null,
  fare: { low: 90, mid: 100, high: 110 },
  fareSource: "rate_card",
  fareSourceNote: null,
  fareAdjustment: null,
  ...overrides,
});

test("ranking without a traffic reading never claims low traffic or low overall risk", () => {
  const { rankRouteOptions } = load("lib/route-scoring.ts");
  const options = [
    option({ displayName: "Car" }),
    option({ vehicleType: "bike", displayName: "Bike", fare: { low: 45, mid: 50, high: 55 }, comfortScore: 2 }),
  ];
  const rank = (congestionLevel, weatherBand) =>
    rankRouteOptions({ options, baseDurationMin: 30, congestionLevel, weatherBand, priority: "time" });
  const claims = (ranked) => ranked.flatMap((entry) => [...entry.pros, ...entry.cons]);

  const weatherOnly = rank(null, "low");
  assert.deepEqual(new Set(weatherOnly.map((entry) => entry.riskBasis)), new Set(["weather"]));
  assert.equal(claims(weatherOnly).some((claim) => /traffic/i.test(claim)), false);
  assert.equal(claims(weatherOnly).includes("Low weather score"), true);
  // No reading, so no vehicle is sped up or slowed down for congestion.
  assert.deepEqual(new Set(weatherOnly.map((entry) => entry.adjustedDurationMin)), new Set([30]));

  const nothing = rank(null, null);
  assert.deepEqual(new Set(nothing.map((entry) => entry.riskBasis)), new Set(["none"]));
  assert.equal(claims(nothing).some((claim) => /risk|traffic|weather score/i.test(claim)), false);

  const both = rank("low", "low");
  assert.deepEqual(new Set(both.map((entry) => entry.riskBasis)), new Set(["weather_and_traffic"]));
  assert.equal(claims(both).includes("Low weather/traffic score"), true);

  // A severe reading still changes the times; a missing one must not.
  const severe = rank("severe", "low");
  assert.notDeepEqual(new Set(severe.map((entry) => entry.adjustedDurationMin)), new Set([30]));
});

test("a saved plan in Bangladesh hides the stored no-data traffic reading", async () => {
  const storedTraffic = {
    congestionIndexPercent: 0,
    congestionLevel: "low",
    isPeakHour: false,
    durationInTrafficMin: 20,
    baselineDurationMin: 20,
  };
  const record = (country) => ({
    _id: "trip",
    country,
    createdAt: "2026-09-18T10:00:00Z",
    selectedVehicle: {
      provider: "p",
      vehicleType: "go",
      displayName: "Car",
      maxPassengers: 4,
      estimatedFareLow: 90,
      estimatedFareHigh: 110,
    },
    selectionSnapshot: { traffic: storedTraffic, trafficUnavailable: false },
  });
  const summaryFor = async (country) => {
    const history = load("lib/trip-history.ts", {
      "@/lib/mongodb": async () => {},
      mongoose: { Types: { ObjectId: { isValid: () => true } } },
      "@/models/TripHistory": { findOne: () => ({ lean: async () => record(country) }) },
    });
    return history.getTripSummary("user", "trip");
  };

  const dhaka = await summaryFor("BD");
  assert.equal(dhaka.traffic, null);
  assert.equal(dhaka.trafficUnavailable, true);

  const london = await summaryFor("UK");
  assert.deepEqual(london.traffic, storedTraffic);
  assert.equal(london.trafficUnavailable, false);
});

test("the traffic overlay and traffic alerts are off only where there is no live traffic", () => {
  const config = load("lib/country-config.ts");

  assert.equal(config.hasLiveTraffic("BD"), false);
  assert.equal(config.hasLiveTraffic("US"), true);
  assert.equal(config.hasLiveTraffic("UK"), true);
  // An unknown country reads as Bangladesh everywhere else, so it does here.
  assert.equal(config.hasLiveTraffic(undefined), false);
  assert.equal(
    config.liveTrafficUnavailableMessage("BD"),
    "Live traffic is not available in Bangladesh.",
  );
});

test("a traffic alert cannot be added to a Bangladesh saved trip", async () => {
  const tripIn = (country) => ({
    _id: "trip",
    country,
    conditions: [],
    baseline: null,
    preferredVehicle: null,
    save: async () => {},
    toObject() {
      return { ...this, name: "Commute", origin: {}, destination: {} };
    },
  });
  const savedTripsFor = (country) =>
    load("lib/saved-trips.ts", {
      "@/lib/mongodb": async () => {},
      "@/lib/alerts": { deleteAlertsForSavedTrip: async () => {} },
      "@/models/VehicleRate": {},
      mongoose: { Types: { ObjectId: { isValid: () => true } } },
      "@/models/SavedTrip": {
        __esModule: true,
        default: { findOne: async () => tripIn(country) },
        ALERT_CONDITION_TYPES: ["weather_severity", "traffic_level", "fare_change"],
        TRAFFIC_LEVELS: ["low", "moderate", "high", "severe"],
      },
    });
  const add = (country) =>
    savedTripsFor(country).addCondition({
      userId: "user",
      savedTripId: "trip",
      input: { type: "traffic_level", level: "high" },
    });

  await assert.rejects(add("BD"), (error) => {
    assert.equal(error.statusCode ?? error.status, 400);
    assert.match(error.userMessage, /Live traffic is not available in Bangladesh/);
    return true;
  });

  const london = await add("UK");
  assert.deepEqual(london.conditions.map((condition) => condition.type), ["traffic_level"]);
});
