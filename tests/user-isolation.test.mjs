import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

const id = "a".repeat(24);
const mongo = { Types: { ObjectId: { isValid: () => true } } };

// The database stand-ins match both ID and owner; a foreign record exists,
// so these exercise access denial rather than merely a nonexistent ID.
test("another account cannot read, update or delete a saved trip", async () => {
  const record = { _id: id, userId: "owner" };
  const queries = [];
  const findOne = (query) => {
    queries.push(query);
    const found = query._id === id && query.userId === record.userId ? record : null;
    return Object.assign(Promise.resolve(found), { lean: async () => found });
  };
  const trips = load("lib/saved-trips.ts", {
    mongoose: mongo, "@/lib/mongodb": async () => {},
    "@/models/SavedTrip": {
      findOne,
      deleteOne: async (query) => { queries.push(query); return { deletedCount: query.userId === record.userId ? 1 : 0 }; },
    },
  });
  assert.equal(await trips.getSavedTrip("other", id), null);
  assert.equal(await trips.updateSavedTrip({ userId: "other", savedTripId: id, patch: { name: "intrusion" } }), null);
  assert.equal(await trips.deleteSavedTrip("other", id), false);
  assert.ok(queries.every((query) => query._id === id && query.userId === "other"));
});

test("another account cannot read a trip summary or save a vehicle on the owned trip", async () => {
  const queries = [];
  const history = load("lib/trip-history.ts", {
    mongoose: mongo, "@/lib/mongodb": async () => {},
    "@/models/TripHistory": { findOne: (query) => { queries.push(query); return Object.assign(Promise.resolve(null), { lean: async () => null }); } },
    "@/models/Map_route": {},
  });
  assert.equal(await history.getTripSummary("other", id), null);
  assert.equal(await history.saveVehicleSelection({ userId: "other", tripHistoryId: id, routeId: "route", vehicle: {}, snapshot: {} }), null);
  assert.ok(queries.every((query) => query._id === id && query.userId === "other"));
});
