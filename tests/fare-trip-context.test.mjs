import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

function setup(document) {
  const calls = { queries: [], weather: [], traffic: [], peakHour: [] };
  const context = load("lib/fare-trip-context.ts", {
    "@/lib/mongodb": async () => {},
    "@/models/TripHistory": {
      findOne: (query) => {
        calls.queries.push(query);
        return { lean: async () => document };
      },
    },
    "@/lib/weather": {
      fetchWeatherForDeparture: async (point) => {
        calls.weather.push(point);
        return { severityBand: "low", severityScore: 0 };
      },
    },
    "@/lib/traffic-service": {
      TrafficServiceError: class TrafficServiceError extends Error {},
      isDeparturePeakHour: (start, departure, country) => {
        calls.peakHour.push({ start, departure, country });
        return true;
      },
      getTrafficForTrip: async (points, departure, country) => {
        calls.traffic.push({ points, departure, country });
        return {
          totals: { congestionLevel: "moderate", durationInTrafficSec: 900 },
          isPeakHour: true,
        };
      },
    },
  });
  return { context, calls };
}

test("one stored route drives the same country, timing, midpoint, weather and traffic context", async () => {
  const document = {
    country: "UK",
    origin: { label: "A", lat: 51.5, lng: -0.12 },
    destination: { label: "B", lat: 51.52, lng: -0.1 },
    passengerCount: 2,
    departureMode: "scheduled",
    scheduledAt: new Date("2026-10-02T09:00:00.000Z"),
    routeOptions: [
      {
        routeId: "route-0",
        distanceKm: 6,
        durationMin: 22,
        legs: [{ startIndex: 0, endIndex: 2, color: "#000", dwellAfterMin: 4 }],
        coords: [[51.5, -0.12], [51.51, -0.11], [51.52, -0.1]],
      },
    ],
  };
  const { context, calls } = setup(document);
  const result = await context.loadFareTripContext("owner-1", "trip-1", "route-0");
  assert.equal(result.ok, true);
  assert.deepEqual(calls.queries, [{ _id: "trip-1", userId: "owner-1" }]);
  assert.equal(result.context.country, "UK");
  assert.equal(result.context.dwellDurationMin, 4);
  assert.equal(result.context.travelDurationMin, 18);
  assert.deepEqual(result.context.departure, {
    mode: "scheduled",
    scheduledAt: "2026-10-02T09:00:00.000Z",
  });

  const weather = await context.getFareTripWeather(result.context);
  const traffic = await context.getFareTripTraffic(result.context);
  assert.equal(weather.weather.source, "route_midpoint");
  assert.equal(calls.weather.length, 1);
  assert.ok(Math.abs(calls.weather[0].lat - 51.51) < 0.00001);
  assert.ok(Math.abs(calls.weather[0].lng - -0.11) < 0.00001);
  assert.equal(traffic.trafficUnavailable, false);
  assert.equal(calls.traffic[0].country, "UK");
  assert.deepEqual(calls.traffic[0].departure, result.context.departure);
  assert.equal(calls.traffic[0].points.length, 3);
  assert.deepEqual(calls.peakHour, [
    { start: { lat: 51.5, lng: -0.12 }, departure: result.context.departure, country: "UK" },
  ]);
  assert.deepEqual(context.getFareAdjustmentContext(result.context, weather.weather, traffic.traffic), {
    weather: weather.weather,
    traffic: { congestionLevel: "moderate", isPeakHour: true },
  });
});

test("missing geometry uses the trip country's fallback, and missing routes stay errors", async () => {
  const document = {
    country: "US",
    passengerCount: 1,
    departureMode: "now",
    routeOptions: [{ routeId: "route-0", distanceKm: 5, durationMin: 12, coords: [] }],
  };
  const { context, calls } = setup(document);
  const missing = await context.loadFareTripContext("owner-1", "trip-1", "route-x");
  assert.deepEqual(missing, { ok: false, status: 404, message: "Route was not found for this trip." });

  const result = await context.loadFareTripContext("owner-1", "trip-1", "route-0");
  assert.equal(result.ok, true);
  const weather = await context.getFareTripWeather(result.context);
  const traffic = await context.getFareTripTraffic(result.context);
  assert.equal(weather.weather.source, "dhaka_fallback");
  assert.deepEqual(calls.weather, [{ lat: 40.7128, lng: -74.006 }]);
  assert.equal(traffic.traffic, null);
  assert.equal(traffic.trafficUnavailable, true);
  assert.equal(calls.traffic.length, 0);
});
