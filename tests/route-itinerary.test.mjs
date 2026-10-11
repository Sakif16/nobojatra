import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const feature = {
  geometry: { coordinates: [[90.4, 23.7], [90.42, 23.71], [90.44, 23.7]] },
  properties: {
    summary: { distance: 104_000, duration: 7200 },
    segments: [{ distance: 104_000, duration: 7200, steps: [] }],
    way_points: [0, 2],
  },
};
const tooLongForAlternatives = {
  ok: false,
  status: 400,
  text: async () =>
    JSON.stringify({
      error: {
        code: 2004,
        message:
          "Request parameters exceed the server configuration limits. The approximated route distance must not be greater than 100000.0 meters for use with the alternative Routes algorithm.",
      },
    }),
};
const oneRoute = { ok: true, json: async () => ({ features: [feature] }) };

/** Runs a route search against a scripted sequence of provider answers. */
async function searchWith(answers, { stops = [] } = {}) {
  const previousKey = process.env.ORS_API_KEY;
  const previousFetch = globalThis.fetch;
  const requests = [];
  process.env.ORS_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return answers[requests.length - 1];
  };

  try {
    const { fetchRouteSuggestions, RouteServiceError } = load("lib/route-service.ts");
    const outcome = await fetchRouteSuggestions(
      { lat: 23.7, lng: 90.4 },
      { lat: 23.7, lng: 90.44 },
      stops,
    ).then(
      (routes) => ({ routes }),
      (error) => ({ error, isRouteError: error instanceof RouteServiceError }),
    );
    return { ...outcome, requests };
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ORS_API_KEY;
    else process.env.ORS_API_KEY = previousKey;
  }
}

test("a trip refused alternatives is asked for again as a single route", async () => {
  const { routes, requests } = await searchWith([tooLongForAlternatives, oneRoute]);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].distanceKm, 104);
  // Same journey both times; only the request for alternatives is dropped.
  assert.equal(requests.length, 2);
  assert.ok(requests[0].alternative_routes);
  assert.equal("alternative_routes" in requests[1], false);
  assert.deepEqual(requests[1].coordinates, requests[0].coordinates);
});

test("the refusal is recognised by its wording when the error number is missing", async () => {
  const unnumbered = {
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ error: "Route too long for the alternative Routes algorithm." }),
  };
  const { routes, requests } = await searchWith([unnumbered, oneRoute]);

  assert.equal(routes.length, 1);
  assert.equal(requests.length, 2);
});

test("no other routing failure is retried", async () => {
  const failures = [
    [{ ok: false, status: 404, text: async () => JSON.stringify({ error: { code: 2009, message: "Route could not be found." } }) }, "No drivable route was found between these places."],
    [{ ok: false, status: 503, text: async () => "upstream down" }, "Routing service is temporarily unavailable."],
    [{ ok: false, status: 403, text: async () => JSON.stringify({ error: "Access denied" }) }, "Routing service credentials need attention."],
    [{ ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 2010, message: "Could not find routable point within a radius of 350.0 meters" } }) }, "One of the selected places cannot be routed by car."],
  ];

  for (const [answer, message] of failures) {
    const { error, isRouteError, requests } = await searchWith([answer, oneRoute]);

    assert.equal(isRouteError, true);
    assert.equal(error.userMessage, message);
    assert.equal(requests.length, 1);
  }
});

test("a second refusal is reported, not retried again", async () => {
  const unroutable = {
    ok: false,
    status: 404,
    text: async () => JSON.stringify({ error: { code: 2009, message: "Route could not be found." } }),
  };
  const { error, requests } = await searchWith([tooLongForAlternatives, unroutable, oneRoute]);

  assert.equal(error.userMessage, "No drivable route was found between these places.");
  assert.equal(requests.length, 2);
});

test("a trip with stops never asks for alternatives, so there is nothing to retry", async () => {
  const { error, requests } = await searchWith([tooLongForAlternatives, oneRoute], {
    stops: [{ lat: 23.71, lng: 90.42, label: "Stop", dwellMinutes: 5 }],
  });

  assert.equal("alternative_routes" in requests[0], false);
  assert.equal(requests.length, 1);
  assert.ok(error);
});

const HOME = { label: "Home", lat: 23.7461, lng: 90.3742 };
const MARKET = { label: "Market", lat: 23.7806, lng: 90.407 };
const NEXT_DOOR = { label: "Next door", lat: 23.7463, lng: 90.3744 };
const stop = (place) => ({ ...place, dwellMinutes: 10 });

function validate(trip) {
  const { validateTripInput } = load("lib/trip-input.ts");
  return validateTripInput(
    { passengerCount: 1, departureMode: "now", ...trip },
    new Date("2026-10-11T00:00:00Z"),
    "BD",
    () => "Asia/Dhaka",
  );
}

test("a round trip is a valid trip when a stop takes it somewhere", () => {
  const roundTrip = validate({ origin: HOME, destination: HOME, stops: [stop(MARKET)] });

  assert.equal(roundTrip.success, true);
  assert.deepEqual(roundTrip.data.destination, HOME);
  // Out and back, not the zero metres between its two ends.
  assert.ok(roundTrip.data.distanceMeters > 9000);
});

test("a trip is measured along its stops, not end to end", () => {
  // The destination is about thirty metres from the origin.
  assert.equal(
    validate({ origin: HOME, destination: NEXT_DOOR }).errors.destination,
    "Trip distance must be at least 500 meters.",
  );
  assert.equal(validate({ origin: HOME, destination: NEXT_DOOR, stops: [stop(MARKET)] }).success, true);
});

test("a trip that goes nowhere is still refused", () => {
  assert.equal(
    validate({ origin: HOME, destination: HOME }).errors.destination,
    "Origin and destination cannot be the same.",
  );
  assert.equal(
    validate({ origin: HOME, destination: HOME, stops: [] }).errors.destination,
    "Origin and destination cannot be the same.",
  );
  // A stop at the starting point does not make it a journey.
  assert.deepEqual(validate({ origin: HOME, destination: HOME, stops: [stop(HOME)] }).errors.stops, [
    "Stop 1 cannot be the same place as the origin.",
  ]);
});

test("two identical places in a row are refused, naming the repeated one", () => {
  const repeatedStop = validate({
    origin: HOME,
    destination: NEXT_DOOR,
    stops: [stop(MARKET), stop(MARKET)],
  });
  assert.equal(repeatedStop.success, false);
  assert.equal(repeatedStop.errors.stops[0], undefined);
  assert.equal(repeatedStop.errors.stops[1], "Stop 2 cannot be the same place as stop 1.");

  assert.equal(
    validate({ origin: HOME, destination: MARKET, stops: [stop(MARKET)] }).errors.destination,
    "Destination cannot be the same place as stop 1.",
  );

  // Returning to an earlier place later in the trip is fine.
  assert.equal(
    validate({ origin: HOME, destination: HOME, stops: [stop(MARKET), stop(NEXT_DOOR), stop(MARKET)] }).success,
    true,
  );
});

test("a trip without stops is judged exactly as before", () => {
  const direct = validate({ origin: HOME, destination: MARKET });

  assert.equal(direct.success, true);
  assert.ok(direct.data.distanceMeters > 4000 && direct.data.distanceMeters < 6000);
});
