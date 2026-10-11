import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

function loadRouteService() {
  return load("lib/route-service.ts", {
    "@/lib/routing": { ROUTE_COLORS: ["#abc", "#def", "#123"] },
    "@/lib/trip-input": { calculateDistanceMeters: () => 1000 },
  });
}

function feature(middle) {
  return {
    geometry: {
      coordinates: [[90.4, 23.7], middle, [90.44, 23.7]],
    },
    properties: {
      summary: { distance: 5500, duration: 900 },
      segments: [{ distance: 5500, duration: 900, steps: [] }],
      way_points: [0, 2],
    },
  };
}

test("equal displayed metrics do not hide distinct route geometry", async () => {
  const previousKey = process.env.ORS_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ORS_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [
        feature([90.42, 23.71]),
        feature([90.42, 23.69]),
        feature([90.42001, 23.71001]),
      ],
    }),
  });

  try {
    const { fetchRouteSuggestions } = loadRouteService();
    const routes = await fetchRouteSuggestions(
      { lat: 23.7, lng: 90.4 },
      { lat: 23.7, lng: 90.44 },
    );

    assert.equal(routes.length, 2);
    assert.deepEqual(routes.map(({ id, rank }) => [id, rank]), [["route-0", 1], ["route-1", 2]]);
    assert.deepEqual(routes.map(({ distanceKm, durationMin }) => [distanceKm, durationMin]), [
      [5.5, 15],
      [5.5, 15],
    ]);
    assert.deepEqual(routes.map((route) => route.coords[1]), [
      [23.71, 90.42],
      [23.69, 90.42],
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ORS_API_KEY;
    else process.env.ORS_API_KEY = previousKey;
  }
});
