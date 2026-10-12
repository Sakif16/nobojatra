import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((part) => matches(record, part));
    if (value && typeof value === "object") {
      if ("$in" in value) return value.$in.includes(record[key]);
      if ("$exists" in value) return (key in record) === value.$exists;
    }
    return record[key] === value;
  });
}

function fixture() {
  const stores = Object.fromEntries(["Alert", "SavedTrip", "TripHistory", "Place", "UserProfile", "Map_route", "tripinputrequests", "verification"].map((name) => [name, [
    { _id: `${name}-a`, userId: "a", value: "a" },
    { _id: `${name}-b`, userId: "b", value: "b" },
  ]]));
  stores.TrafficData = [{ routeId: "Map_route-a" }, { routeId: "Map_route-b" }];
  stores.TripHistory.push({ _id: "legacy-a", routeId: "Map_route-a" });
  // An explicit foreign owner must win over a stale/wrong route reference.
  stores.TripHistory.push({ _id: "foreign", userId: "b", routeId: "Map_route-a" });
  const calls = [];
  let failTraffic = false;
  let failVerification = false;
  const model = (name) => ({
    find: (filter) => ({ select: async () => stores[name].filter((row) => matches(row, filter)) }),
    async deleteMany(filter) {
      calls.push(name);
      if ((name === "TrafficData" && failTraffic) || (name === "verification" && failVerification)) throw new Error("injected deletion failure");
      const before = stores[name].length;
      stores[name] = stores[name].filter((row) => !matches(row, filter));
      return { deletedCount: before - stores[name].length };
    },
    async deleteOne(filter) { return this.deleteMany(filter); },
  });
  const db = { collection: model };
  const mocks = { mongoose: { connection: { db } }, "@/lib/mongodb": async () => {} };
  for (const name of ["Alert", "SavedTrip", "TrafficData", "TripHistory", "Place", "UserProfile", "Map_route"]) mocks[`@/models/${name}`] = model(name);
  return { stores, calls, db, cleanup: load("lib/account-cleanup.ts", mocks).deleteAccountData,
    failTraffic: (value) => { failTraffic = value; }, failVerification: (value) => { failVerification = value; } };
}

test("account cleanup removes owned and legacy data without touching another user", async () => {
  const f = fixture();
  const counts = await f.cleanup("a", f.db);
  assert.equal(counts.routes, 1);
  assert.equal(counts.tripHistory, 2);
  assert.equal(counts.tripInputRequests, 1);
  assert.equal(f.stores.TrafficData.length, 1);
  assert.equal(f.stores.TrafficData[0].routeId, "Map_route-b");
  assert.ok(f.stores.TripHistory.some((row) => row._id === "foreign"));
  assert.equal(f.calls.at(-1), "Map_route");
  for (const name of ["Alert", "SavedTrip", "Place", "UserProfile", "Map_route", "tripinputrequests", "verification"]) assert.equal(f.stores[name][0].userId, "b");
  assert.ok(Object.values(await f.cleanup("a", f.db)).every((count) => count === 0));
});

for (const failure of ["failTraffic", "failVerification"]) {
  test(`cleanup preserves route ownership after ${failure}, so retry removes dependent data`, async () => {
    const f = fixture();
    f[failure](true);
    await assert.rejects(f.cleanup("a", f.db), /injected/);
    assert.ok(f.stores.Map_route.some((row) => row.userId === "a"));
    assert.ok(!f.calls.includes("Map_route"));
    f[failure](false);
    await f.cleanup("a", f.db);
    assert.equal(f.stores.Map_route.length, 1);
    assert.equal(f.stores.TrafficData.length, 1);
    assert.equal(f.stores.verification.length, 1);
  });
}
