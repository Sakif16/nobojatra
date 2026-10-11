import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const ORIGIN = { lat: 23.7, lng: 90.4, label: "Campus, University Road, Dhaka" };
const STOP = { lat: 23.71, lng: 90.42, label: "Market", dwellMinutes: 5 };
const DESTINATION = { lat: 23.7, lng: 90.44, label: "Shop, Main Street, Dhaka" };

// 0.0027 degrees of latitude is about 300 metres.
const NORTH_300M = 0.0027;

function feature(coordinates, wayPoints) {
  const legs = Math.max(1, (wayPoints?.length ?? 2) - 1);
  return {
    geometry: { coordinates },
    properties: {
      summary: { distance: 5500, duration: 900 },
      segments: Array.from({ length: legs }, () => ({ distance: 5500 / legs, duration: 900 / legs, steps: [] })),
      way_points: wayPoints,
    },
  };
}

async function search(answer, { stops = [] } = {}) {
  const previousKey = process.env.ORS_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.ORS_API_KEY = "test-key";
  globalThis.fetch = async () => answer;

  try {
    const { fetchRouteSuggestions } = load("lib/route-service.ts");
    return await fetchRouteSuggestions(ORIGIN, DESTINATION, stops).then(
      (routes) => ({ routes }),
      (error) => ({ error }),
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ORS_API_KEY;
    else process.env.ORS_API_KEY = previousKey;
  }
}

const routed = (features) => ({ ok: true, json: async () => ({ features }) });

test("a pin well away from where the route meets the road is reported", async () => {
  // The route starts 300 m north of the origin pin and ends at the destination's.
  const { routes } = await search(
    routed([
      feature(
        [
          [ORIGIN.lng, ORIGIN.lat + NORTH_300M],
          [90.42, 23.705],
          [DESTINATION.lng, DESTINATION.lat],
        ],
        [0, 2],
      ),
    ]),
  );
  const [gap] = routes[0].accessGaps;

  assert.equal(routes[0].accessGaps.length, 1);
  assert.equal(gap.waypointIndex, 0);
  assert.ok(Math.abs(gap.gapMeters - 300) < 5, String(gap.gapMeters));
  // Positions only. Routes are cached and shared; labels are each user's own.
  assert.deepEqual(Object.keys(gap).sort(), ["gapMeters", "waypointIndex"]);
  assert.equal(JSON.stringify(routes[0].accessGaps).includes("Campus"), false);
});

test("an ordinary address a few metres from its road is not reported", async () => {
  // About 44 m from the origin pin: under the threshold.
  const { routes } = await search(
    routed([
      feature(
        [
          [ORIGIN.lng, ORIGIN.lat + 0.0004],
          [90.42, 23.705],
          [DESTINATION.lng, DESTINATION.lat],
        ],
        [0, 2],
      ),
    ]),
  );

  assert.equal("accessGaps" in routes[0], false);
});

test("a stop is measured where the route passes it", async () => {
  const { routes } = await search(
    routed([
      feature(
        [
          [ORIGIN.lng, ORIGIN.lat],
          // The route passes the stop about 300 m to its north.
          [STOP.lng, STOP.lat + NORTH_300M],
          [DESTINATION.lng, DESTINATION.lat + NORTH_300M],
        ],
        [0, 1, 2],
      ),
    ]),
    { stops: [STOP] },
  );

  assert.deepEqual(routes[0].accessGaps.map((gap) => gap.waypointIndex), [1, 2]);
});

test("without the provider's waypoint positions only the two ends are measured", async () => {
  const { routes } = await search(
    routed([
      feature(
        [
          [ORIGIN.lng, ORIGIN.lat + NORTH_300M],
          [STOP.lng, STOP.lat + NORTH_300M],
          [DESTINATION.lng, DESTINATION.lat],
        ],
        undefined,
      ),
    ]),
    { stops: [STOP] },
  );

  // The stop's position along the route is unknown, so nothing is claimed about it.
  assert.deepEqual(routes[0].accessGaps.map((gap) => gap.waypointIndex), [0]);
});

test("a place with no drivable road nearby is named", async () => {
  const refusal = (index) => ({
    ok: false,
    status: 404,
    text: async () =>
      JSON.stringify({
        error: {
          code: 2010,
          message: `Could not find routable point within a radius of 350.0 meters of specified coordinate ${index}: 90.4200000 23.7100000.`,
        },
      }),
  });
  const message = async (index) => (await search(refusal(index), { stops: [STOP] })).error.userMessage;

  assert.equal(await message(0), "The origin is not near a road a car can use. Pick a nearby point on a road.");
  assert.equal(await message(1), "Stop 1 is not near a road a car can use. Pick a nearby point on a road.");
  assert.equal(await message(2), "The destination is not near a road a car can use. Pick a nearby point on a road.");
  // A position the trip does not have is not turned into a name.
  assert.equal(await message(7), "No drivable route was found between these places.");

  const unrelated = await search({ ok: false, status: 404, text: async () => JSON.stringify({ error: "Route not found" }) });
  assert.equal(unrelated.error.userMessage, "No drivable route was found between these places.");
});

test("the note says which place, how far, and what that may mean", () => {
  const { describeAccessGap, ACCESS_GAP_THRESHOLD_METERS } = load("lib/route-access.ts");
  const labels = [ORIGIN.label, STOP.label, DESTINATION.label];

  assert.equal(ACCESS_GAP_THRESHOLD_METERS, 75);
  // The place's name without the address a search result appends.
  assert.equal(
    describeAccessGap({ waypointIndex: 0, gapMeters: 283 }, labels),
    "The route starts about 280 m from Campus. The pin may not be a usable pickup point.",
  );
  assert.equal(
    describeAccessGap({ waypointIndex: 1, gapMeters: 96 }, labels),
    "The route passes about 100 m from Market. The pin may not be a usable stopping point.",
  );
  assert.equal(
    describeAccessGap({ waypointIndex: 2, gapMeters: 1240 }, labels),
    "The route ends about 1.2 km from Shop. The pin may not be a usable entrance.",
  );
  assert.equal(
    describeAccessGap({ waypointIndex: 1, gapMeters: 120 }, [undefined, undefined, undefined]),
    "The route passes about 120 m from stop 1. The pin may not be a usable stopping point.",
  );
});
