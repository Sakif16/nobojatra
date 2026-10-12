import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

test("cached routes keep each user's labels and rate-limit cache hits", async () => {
  let userId = "user-A";
  let providerCalls = 0;
  const saved = [];
  const { POST, routeCache } = load(
    "app/api/trip-input/routes/route.ts",
    {
      "@/lib/route-service": {
        RouteServiceError: class RouteServiceError extends Error {},
        fetchRouteSuggestions: async (origin, destination, stops) => {
          providerCalls += 1;
          const points = [origin, ...stops, destination];
          return [{
            id: "route-0",
            rank: 1,
            coords: points.map(({ lat, lng }) => [lat, lng]),
            distanceKm: 5,
            durationMin: 15,
            legs: points.slice(0, -1).map((point, index) => ({
              startIndex: index,
              endIndex: index + 1,
              color: "#000",
              distanceKm: 2.5,
              durationMin: 7,
              fromLabel: point.label,
              toLabel: points[index + 1].label,
            })),
          }];
        },
      },
      "@/lib/auth": { auth: { api: { getSession: async () => ({ user: { id: userId } }) } } },
      "@/lib/user-country": { getUserCountry: async () => "BD" },
      "@/lib/trip-time-zone": { resolveTripTimeZone: () => "Asia/Dhaka" },
      "@/lib/trip-history": {
        createTripHistoryRecord: async (input) => {
          saved.push(structuredClone(input));
          return `history-${saved.length}`;
        },
      },
      "next/server": {
        NextResponse: { json: (body, init = {}) => ({
          body,
          status: init.status ?? 200,
          headers: new Headers(init.headers),
        }) },
      },
    },
    "\nexport { routeCache };",
  );

  const trip = (prefix) => ({
    origin: { lat: 23.77, lng: 90.41, label: `${prefix} origin` },
    stops: [{ lat: 23.78, lng: 90.42, label: `${prefix} stop`, dwellMinutes: 5 }],
    destination: { lat: 23.8, lng: 90.45, label: `${prefix} destination` },
    passengerCount: 1,
    departureMode: "now",
  });
  const request = (body) => ({
    headers: new Headers({ "x-forwarded-for": "203.0.113.5" }),
    json: async () => body,
  });

  const first = await POST(request(trip("Private A")));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("X-Route-Cache"), "MISS");
  assert.equal(first.body.data.routes[0].legs[0].fromLabel, "Private A origin");
  assert.equal(JSON.stringify([...routeCache.values()]).includes("Private A"), false);
  assert.equal(Object.hasOwn([...routeCache.values()][0].routes[0].legs[0], "fromLabel"), false);

  userId = "user-B";
  const second = await POST(request(trip("Private B")));
  assert.equal(second.status, 200);
  assert.equal(second.headers.get("X-Route-Cache"), "HIT");
  // The limit is per account, so user B's first search is not charged for
  // user A's, even from the same address.
  assert.equal(second.headers.get("X-RateLimit-Remaining"), "19");
  assert.deepEqual(
    second.body.data.routes[0].legs.map(({ fromLabel, toLabel }) => [fromLabel, toLabel]),
    [["Private B origin", "Private B stop"], ["Private B stop", "Private B destination"]],
  );
  assert.deepEqual(saved[1].routes, second.body.data.routes);
  assert.equal(saved[1].trip.timeZone, "Asia/Dhaka");
  assert.equal(providerCalls, 1);

  for (let count = 0; count < 19; count += 1) {
    const hit = await POST(request(trip("Private B")));
    assert.equal(hit.status, 200);
    assert.equal(hit.headers.get("X-Route-Cache"), "HIT");
  }

  const limited = await POST(request(trip("Private B")));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("X-RateLimit-Remaining"), "0");
  assert.equal(providerCalls, 1);
  assert.equal(saved.length, 21);

  // User B being limited does not limit user A.
  userId = "user-A";
  const other = await POST(request(trip("Private A")));
  assert.equal(other.status, 200);
  assert.equal(other.headers.get("X-RateLimit-Remaining"), "18");
});
