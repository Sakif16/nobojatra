import assert from "node:assert/strict";
import test from "node:test";

import { createUsageStore, load } from "./support/load.mjs";

const nextServer = {
  NextResponse: {
    json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }),
  },
};
const signedIn = { auth: { api: { getSession: async () => ({ user: { id: "user-1" } }) } } };
const signedOut = { auth: { api: { getSession: async () => null } } };
const jsonRequest = (value) => ({ headers: new Headers(), json: async () => value });
const brokenRequest = () => ({
  headers: new Headers(),
  json: async () => {
    throw new SyntaxError("Unexpected token");
  },
});

test("a body that is not a JSON object is refused, whatever valid JSON it is", async () => {
  const { readJsonObject } = load("lib/request-body.ts");

  for (const value of [null, [], [{}], "text", 7, true]) {
    assert.deepEqual(await readJsonObject(jsonRequest(value)), {
      ok: false,
      message: "Request body must be a JSON object.",
    });
  }

  assert.deepEqual(await readJsonObject(brokenRequest()), {
    ok: false,
    message: "Request body must be valid JSON.",
  });
  assert.deepEqual(await readJsonObject(jsonRequest({ a: 1 })), { ok: true, body: { a: 1 } });
});

test("the traffic endpoint answers malformed and oversized requests with a 400", async () => {
  let providerCalls = 0;
  const { POST } = load("app/api/traffic/live/route.ts", {
    "next/server": nextServer,
    "@/lib/auth": signedIn,
    "@/lib/user-country": { getUserCountry: async () => "UK" },
    "@/lib/traffic-service": {
      TrafficServiceError: class TrafficServiceError extends Error {},
      getTrafficForTrip: async (points) => {
        providerCalls += 1;
        return { points: points.length };
      },
    },
  });
  const point = { lat: 51.5, lng: -0.12 };
  const post = (body) => POST(jsonRequest(body));

  // `null` used to throw inside the handler and come back as a 502.
  assert.equal((await post(null)).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await POST(brokenRequest())).status, 400);
  assert.equal((await post({ origin: point, destination: point, stops: "none" })).status, 400);
  assert.equal((await post({ origin: point, destination: point, stops: [{ lat: "x", lng: 0 }] })).status, 400);
  assert.equal((await post({ origin: point })).status, 400);

  // Eight points between the ends is a full sampled route; nine is not the planner.
  const stops = (count) => Array.from({ length: count }, () => point);
  const tooMany = await post({ origin: point, destination: point, stops: stops(9) });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.message, /up to 8 points/);
  assert.equal(providerCalls, 0);

  const allowed = await post({ origin: point, destination: point, stops: stops(8) });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.points, 10);
  assert.equal(providerCalls, 1);
});

test("trip validation refuses stops that are not a list", () => {
  const { validateTripInput } = load("lib/trip-input.ts");
  const validate = (stops) =>
    validateTripInput(
      {
        origin: { label: "A", lat: 23.81, lng: 90.41 },
        destination: { label: "B", lat: 23.87, lng: 90.38 },
        passengerCount: 1,
        departureMode: "now",
        stops,
      },
      new Date("2026-10-10T00:00:00Z"),
      "BD",
      () => "Asia/Dhaka",
    );

  for (const stops of ["Gulshan", { label: "Gulshan" }, 3]) {
    const result = validate(stops);
    assert.equal(result.success, false);
    assert.deepEqual(result.errors.stops, ["Stops must be a list of places."]);
  }

  assert.equal(validate(undefined).success, true);
  assert.equal(validate(null).success, true);
  assert.equal(validate([]).success, true);
  assert.equal(validate([{ label: "", lat: 0, lng: 0 }]).success, false);
});

test("a condition flag that is not a boolean is refused, not coerced", async () => {
  const updates = [];
  const { PATCH } = load("app/api/saved-trips/[savedTripId]/conditions/[conditionId]/route.ts", {
    "next/server": nextServer,
    "@/lib/auth": signedIn,
    "@/lib/saved-trips": {
      SavedTripError: class SavedTripError extends Error {},
      deleteCondition: async () => null,
      updateCondition: async (input) => {
        updates.push(input.patch);
        return { id: "trip" };
      },
    },
  });
  const params = { params: Promise.resolve({ savedTripId: "trip", conditionId: "condition" }) };
  const patch = (body) => PATCH(jsonRequest(body), params);

  // Boolean("false") is true: this used to resume a condition being paused.
  for (const isActive of ["false", "true", 0, 1, null, {}]) {
    const response = await patch({ isActive });
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "isActive must be true or false.");
  }
  assert.equal((await patch(null)).status, 400);
  assert.equal(updates.length, 0);

  assert.equal((await patch({ isActive: false })).status, 200);
  assert.deepEqual(updates, [{ isActive: false }]);
});

test("only real tiles reach the tile provider", () => {
  const { parseTileCoordinates } = load("lib/map-tiles.ts");

  assert.deepEqual(parseTileCoordinates("0", "0", "0"), { z: 0, x: 0, y: 0 });
  assert.deepEqual(parseTileCoordinates("12", "3023", "1773"), { z: 12, x: 3023, y: 1773 });
  assert.deepEqual(parseTileCoordinates("22", "4194303", "4194303"), { z: 22, x: 4194303, y: 4194303 });

  for (const [z, x, y] of [
    ["0", "1", "0"], // zoom 0 has one tile
    ["12", "4096", "0"], // x must be below 2^12
    ["12", "0", "4096"],
    ["23", "0", "0"], // deeper than the tiles go
    ["99999999999999999999", "0", "0"],
    ["-1", "0", "0"],
    ["1.5", "0", "0"],
    ["1e2", "0", "0"],
    ["", "0", "0"],
    ["a", "b", "c"],
  ]) {
    assert.equal(parseTileCoordinates(z, x, y), null, `${z}/${x}/${y}`);
  }
});

test("the tile proxy needs a session and never forwards an invalid tile", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TOMTOM_API_KEY;
  let upstream = 0;
  globalThis.fetch = async () => {
    upstream += 1;
    throw new Error("network disabled in tests");
  };
  process.env.TOMTOM_API_KEY = "test-key";
  const routeFor = (auth) =>
    load("app/api/tiles/tomtom/[z]/[x]/[y]/route.ts", { "next/server": nextServer, "@/lib/auth": auth });
  const get = (route, z, x, y) =>
    route.GET({ headers: new Headers() }, { params: Promise.resolve({ z, x, y }) });

  try {
    assert.equal((await get(routeFor(signedOut), "12", "3023", "1773")).status, 401);
    assert.equal((await get(routeFor(signedIn), "12", "4096", "0")).status, 400);
    assert.equal(upstream, 0);

    // A valid tile for a signed-in user is the only request that goes out.
    assert.equal((await get(routeFor(signedIn), "12", "3023", "1773")).status, 502);
    assert.equal(upstream, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previousKey;
  }
});

function budgetWith(store) {
  return load("lib/provider-budget.ts", {
    "@/lib/mongodb": async () => {},
    "@/models/ProviderUsage": store,
  });
}

test("a provider's daily budget is spent call by call and then refused", async () => {
  const previous = process.env.DEMO_BUDGET_OPENWEATHER;
  process.env.DEMO_BUDGET_OPENWEATHER = "3";

  try {
    const store = createUsageStore();
    const budget = budgetWith(store);

    assert.equal(budget.getDailyBudget("openweather"), 3);
    assert.equal(budget.getDailyBudget("nominatim"), budget.PROVIDER_DAILY_BUDGETS.nominatim);

    await budget.spendProviderBudget("openweather");
    await budget.spendProviderBudget("openweather", 2);
    await assert.rejects(budget.spendProviderBudget("openweather"), (error) => {
      assert.equal(error instanceof budget.ProviderBudgetError, true);
      assert.equal(error.provider, "openweather");
      return true;
    });

    // Each provider has its own allowance.
    await budget.spendProviderBudget("nominatim");
    assert.equal([...store.counts.keys()].every((key) => /^\w+:\d{4}-\d{2}-\d{2}$/.test(key)), true);
  } finally {
    if (previous === undefined) delete process.env.DEMO_BUDGET_OPENWEATHER;
    else process.env.DEMO_BUDGET_OPENWEATHER = previous;
  }
});

test("a budget counter that cannot be reached does not take the feature down", async () => {
  const warn = console.warn;
  console.warn = () => {};

  try {
    const budget = budgetWith({
      findOneAndUpdate: () => ({
        lean: async () => {
          throw new Error("database unavailable");
        },
      }),
    });

    await budget.spendProviderBudget("openweather");
  } finally {
    console.warn = warn;
  }
});

test("the place cache expires entries and stays within its size", () => {
  const { createTtlCache } = load("lib/ttl-cache.ts");
  const cache = createTtlCache({ ttlMs: 1000, maxEntries: 2 });

  cache.set("a", 1, 0);
  assert.equal(cache.get("a", 999), 1);
  assert.equal(cache.get("a", 1000), undefined);

  cache.set("b", 2, 2000);
  cache.set("c", 3, 2001);
  cache.set("d", 4, 2002);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("b", 2003), undefined);
  assert.equal(cache.get("c", 2003), 3);
  assert.equal(cache.get("d", 2003), 4);
});

test("place search needs a session, repeats come from the cache, and each account is limited", async () => {
  const previousFetch = globalThis.fetch;
  const upstream = [];
  globalThis.fetch = async (url) => {
    upstream.push(String(url));
    return {
      ok: true,
      json: async () => [{ place_id: 1, display_name: "Dhanmondi, Dhaka", lat: "23.7461", lon: "90.3742" }],
    };
  };
  let userId = "user-1";
  const route = (auth) =>
    load("app/api/trip-input/autocomplete/route.ts", { "next/server": nextServer, "@/lib/auth": auth });
  const search = (handler, query) =>
    handler.GET({
      headers: new Headers(),
      url: `http://localhost/api/trip-input/autocomplete?query=${encodeURIComponent(query)}&country=BD`,
    });

  try {
    assert.equal((await search(route(signedOut), "Dhanmondi")).status, 401);
    assert.equal(upstream.length, 0);

    const handler = route({ auth: { api: { getSession: async () => ({ user: { id: userId } }) } } });

    const first = await search(handler, "Dhanmondi");
    assert.equal(first.status, 200);
    assert.equal(first.headers["X-Place-Cache"], "MISS");
    assert.deepEqual(first.body.data.map((place) => place.label), ["Dhanmondi, Dhaka"]);

    // Same query, different case and spacing: answered without asking again.
    const repeat = await search(handler, "  dhanmondi ");
    assert.equal(repeat.headers["X-Place-Cache"], "HIT");
    assert.deepEqual(repeat.body.data, first.body.data);
    assert.equal(upstream.length, 1);

    assert.equal((await search(handler, "x".repeat(121))).status, 400);

    // Thirty upstream searches a minute per account; the first query was one.
    for (let count = 0; count < 29; count += 1) {
      assert.equal((await search(handler, `place ${count}`)).status, 200);
    }
    const limited = await search(handler, "one too many");
    assert.equal(limited.status, 429);
    assert.equal(upstream.length, 30);

    // A cached answer is still served, and another account is not affected.
    assert.equal((await search(handler, "Dhanmondi")).status, 200);
    userId = "user-2";
    assert.equal((await search(handler, "somewhere else")).status, 200);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
