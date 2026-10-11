import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const validObjectId = { Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/.test(String(id)) } } };
const place = (label, lat, lng) => ({ label, lat, lng });
const trip = {
  origin: place("Home", 23.7461, 90.3742),
  destination: place("Office", 23.7806, 90.407),
  stops: [{ ...place("School", 23.76, 90.39), dwellMinutes: 10 }],
  passengerCount: 2,
  departureMode: "now",
  timeZone: "Asia/Dhaka",
  distanceMeters: 5000,
};

/** lib/saved-trips over an in-memory collection, with a count of provider calls. */
function setup(stored = []) {
  const calls = { created: [], providers: 0 };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls.providers += 1;
    throw new Error("no provider should be called");
  };
  const savedTrips = load("lib/saved-trips.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: validObjectId,
    "@/models/SavedTrip": {
      __esModule: true,
      default: {
        find: () => {
          const query = {
            select: () => query,
            sort: () => query,
            lean: async () => stored,
          };
          return query;
        },
        findOne: (filter) => {
          const found = stored.find((record) => record._id === filter._id) ?? null;
          return Object.assign(Promise.resolve(found), { lean: async () => found });
        },
        create: async (document) => {
          if (stored.some((record) => record.name === document.name)) {
            throw Object.assign(new Error("duplicate"), { code: 11000 });
          }
          calls.created.push(document);
          return { toObject: () => ({ _id: ID, ...document }) };
        },
        deleteOne: async (filter) => ({
          deletedCount: stored.some((record) => record._id === filter._id) ? 1 : 0,
        }),
      },
    },
  });
  return { savedTrips, calls, restore: () => (globalThis.fetch = previousFetch) };
}

test("saving a trip stores a bookmark and calls no provider", async () => {
  const { savedTrips, calls, restore } = setup();

  try {
    const saved = await savedTrips.createSavedTrip({ userId: "user", name: "Commute", trip, country: "BD" });

    assert.deepEqual(Object.keys(calls.created[0]).sort(), [
      "country",
      "destination",
      "name",
      "origin",
      "passengerCount",
      "stops",
      "timeZone",
      "userId",
    ]);
    // No route to resolve and no fare to price: both belong to planning it.
    assert.equal(calls.providers, 0);
    assert.deepEqual(saved.origin, trip.origin);
    assert.equal(saved.stops[0].dwellMinutes, 10);
    assert.equal(saved.passengerCount, 2);
    assert.equal(saved.timeZone, "Asia/Dhaka");
    // Nothing of the old alerting is part of a saved trip any more.
    for (const gone of ["conditions", "baseline", "preferredVehicle", "route", "isActive", "lastEvaluatedAt"]) {
      assert.equal(gone in saved, false, gone);
    }
  } finally {
    restore();
  }
});

test("a trip saved while alerts existed still lists, without its alert fields", async () => {
  const legacy = {
    _id: ID,
    name: "Old commute",
    origin: trip.origin,
    destination: trip.destination,
    stops: [place("School", 23.76, 90.39)],
    passengerCount: 1,
    // Left in the database by the removed alert system.
    conditions: [{ type: "weather_severity", threshold: 3.5 }],
    baseline: { fareLow: 100, fareHigh: 120 },
    preferredVehicle: { displayName: "Car" },
    isActive: false,
    lastEvaluatedAt: new Date(),
  };
  const { savedTrips, restore } = setup([legacy, { ...legacy, _id: "cccccccccccccccccccccccc", country: "UK", name: "London" }]);

  try {
    const [listed] = await savedTrips.listSavedTrips("user", "BD");

    assert.equal(listed.name, "Old commute");
    // A record with no country predates the field and is a Bangladesh trip.
    assert.equal(listed.country, "BD");
    assert.equal(listed.timeZone, "Asia/Dhaka");
    assert.equal(listed.stops[0].dwellMinutes, 5);
    assert.deepEqual(Object.keys(listed).sort(), [
      "country",
      "createdAt",
      "destination",
      "id",
      "name",
      "origin",
      "passengerCount",
      "stops",
      "timeZone",
      "updatedAt",
    ]);
    // The list is scoped to the country being planned in.
    assert.deepEqual((await savedTrips.listSavedTrips("user", "UK")).map((entry) => entry.name), ["London"]);
  } finally {
    restore();
  }
});

test("names stay unique, the list is capped, and a trip can be deleted", async () => {
  const full = Array.from({ length: 20 }, (_, index) => ({
    _id: `${String(index).padStart(2, "0")}${"d".repeat(22)}`,
    name: `Trip ${index}`,
    country: "BD",
    origin: trip.origin,
    destination: trip.destination,
  }));
  const { savedTrips, restore } = setup(full);

  try {
    await assert.rejects(
      savedTrips.createSavedTrip({ userId: "user", name: "One more", trip, country: "BD" }),
      (error) => error.statusCode === 409 && /up to 20 trips/.test(error.userMessage),
    );
    // The cap is per country, so another country's list is still open.
    await assert.rejects(
      savedTrips.createSavedTrip({ userId: "user", name: "Trip 3", trip, country: "UK" }),
      (error) => error.statusCode === 409 && /already have a saved trip with that name/.test(error.userMessage),
    );
    assert.equal((await savedTrips.createSavedTrip({ userId: "user", name: "London", trip, country: "UK" })).name, "London");

    assert.equal(await savedTrips.deleteSavedTrip("user", full[0]._id), true);
    assert.equal(await savedTrips.deleteSavedTrip("user", "eeeeeeeeeeeeeeeeeeeeeeee"), false);
    assert.equal(await savedTrips.deleteSavedTrip("user", "not-an-id"), false);
  } finally {
    restore();
  }
});

test("the passenger field cannot submit a count a trip does not allow", () => {
  const { clampPassengerCount } = load("lib/vehicle-capacity.ts");

  // An emptied field used to submit 0 passengers.
  assert.equal(clampPassengerCount(""), 1);
  assert.equal(clampPassengerCount("0"), 1);
  assert.equal(clampPassengerCount("abc"), 1);
  assert.equal(clampPassengerCount("3"), 3);
  assert.equal(clampPassengerCount("15"), 8);
});

const nextServer = {
  NextResponse: {
    json: (body, init = {}) => ({ body, status: init.status ?? 200, headers: init.headers ?? {} }),
  },
};

test("notifications are counted without starting any background check", async () => {
  let afterCalls = 0;
  const { GET } = load("app/api/alerts/count/route.ts", {
    "next/server": { ...nextServer, after: () => (afterCalls += 1) },
    "@/lib/auth": { auth: { api: { getSession: async () => ({ user: { id: "user" } }) } } },
    "@/lib/alerts": { getAlertDigest: async () => ({ unreadCount: 3, latestId: "newest" }) },
  });

  const response = await GET({ headers: new Headers() });

  assert.deepEqual(response.body, { success: true, unreadCount: 3, latestId: "newest" });
  // The badge poll used to kick off an evaluation of the user's saved trips.
  assert.equal(afterCalls, 0);
});

test("a notification carries what it says and when, and nothing about a condition", async () => {
  const written = [];
  const alerts = load("lib/alerts.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: validObjectId,
    "@/models/Alert": {
      __esModule: true,
      default: {
        findOneAndUpdate: async (filter, update) => {
          written.push({ filter, update });
          return {
            lastErrorObject: { updatedExisting: false },
            value: { _id: ID, ...update.$setOnInsert, createdAt: new Date("2026-10-11T00:00:00Z") },
          };
        },
      },
    },
  });

  const notification = await alerts.createTripConfirmedAlert({
    userId: "user",
    tripHistoryId: "trip-1",
    originLabel: "Home",
    destinationLabel: "Office",
    vehicleLabel: "Uber X",
    fareLow: 120,
    fareHigh: 150,
    currency: "BDT",
  });

  assert.equal(notification.title, "Your plan is saved");
  assert.equal(notification.message, "Uber X saved for Home to Office. Estimated fare: 120-150 BDT. This is not a booking.");
  assert.deepEqual(Object.keys(notification).sort(), [
    "createdAt",
    "id",
    "message",
    "readAt",
    "severity",
    "snoozedUntil",
    "title",
  ]);
  assert.deepEqual(Object.keys(written[0].update.$setOnInsert).sort(), ["message", "severity", "title"]);
  // Retrying the same choice does not write a second notification.
  assert.equal(written[0].filter.dedupeKey, "trip-confirmed:trip-1");

  // The alert-raising half of the module is gone.
  for (const removed of ["createAlert", "buildDedupeKey", "deleteAlertsForSavedTrip"]) {
    assert.equal(removed in alerts, false, removed);
  }
});

test("the alert system's code and endpoints are gone, and the notification ones remain", () => {
  const exists = (file) => fs.existsSync(path.join(root, file));

  for (const removed of [
    "lib/alert-evaluator",
    "app/api/alerts/evaluate",
    "app/api/saved-trips/[savedTripId]/conditions",
    "components/saved-trips/ConditionEditor.tsx",
  ]) {
    assert.equal(exists(removed), false, removed);
  }
  for (const kept of [
    "app/api/alerts/route.ts",
    "app/api/alerts/count/route.ts",
    "app/api/alerts/read-all/route.ts",
    "app/api/alerts/[alertId]/route.ts",
    "components/notifications/NotificationBell.tsx",
    "components/notifications/NotificationCenter.tsx",
  ]) {
    assert.equal(exists(kept), true, kept);
  }

  const manager = fs.readFileSync(path.join(root, "components/saved-trips/SavedTripsManager.tsx"), "utf8");
  assert.match(manager, /href=\{`\/\?savedTrip=\$\{trip\.id\}`\}/);
  assert.doesNotMatch(manager, /Check now|Pause|Resume|baseline|ConditionEditor/);

  // The bin asks first; only the confirmation deletes.
  assert.match(manager, /This cannot be undone/);
  assert.match(manager, /Delete trip/);
  assert.equal((manager.match(/deleteTrip\(trip\.id\)/g) ?? []).length, 1);
});

/** A collection where a rival save can land between this save's check and its insert. */
function racingSetup({ existing, rivalLandsFirst }) {
  const stored = Array.from({ length: existing }, (_, index) => ({
    _id: `a${String(index).padStart(23, "0")}`,
    name: `Trip ${index}`,
    country: "BD",
    origin: trip.origin,
    destination: trip.destination,
  }));
  const deleted = [];
  const savedTrips = load("lib/saved-trips.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: validObjectId,
    "@/models/SavedTrip": {
      __esModule: true,
      default: {
        find: () => {
          const query = { select: () => query, sort: () => query, lean: async () => [...stored].sort((a, b) => (a._id < b._id ? -1 : 1)) };
          return query;
        },
        create: async (document) => {
          // The rival passed the same check and inserted a moment earlier or later.
          const rival = { _id: rivalLandsFirst ? "b0000000000000000000000a" : "b0000000000000000000000c", name: "Rival", country: "BD" };
          const mine = { _id: "b0000000000000000000000b", ...document };
          stored.push(rival, mine);
          return { _id: mine._id, toObject: () => mine };
        },
        deleteOne: async (filter) => {
          deleted.push(filter._id);
          return { deletedCount: 1 };
        },
      },
    },
  });
  return { savedTrips, deleted };
}

test("two saves at the same moment cannot take the list past its limit", async () => {
  const create = (savedTrips) => savedTrips.createSavedTrip({ userId: "user", name: "Mine", trip, country: "BD" });

  // Nineteen saved, and a rival's save landed first: ours is the twenty-first.
  const lost = racingSetup({ existing: 19, rivalLandsFirst: true });
  await assert.rejects(create(lost.savedTrips), (error) => error.statusCode === 409 && /up to 20 trips/.test(error.userMessage));
  assert.deepEqual(lost.deleted, ["b0000000000000000000000b"]);

  // The same race the other way round: ours is the twentieth and is kept, so
  // exactly one of the two saves succeeds rather than neither.
  const won = racingSetup({ existing: 19, rivalLandsFirst: false });
  assert.equal((await create(won.savedTrips)).name, "Mine");
  assert.deepEqual(won.deleted, []);

  // With room to spare a simultaneous save changes nothing.
  const roomy = racingSetup({ existing: 5, rivalLandsFirst: true });
  assert.equal((await create(roomy.savedTrips)).name, "Mine");
  assert.deepEqual(roomy.deleted, []);
});

test("an edit made from a stale copy is refused instead of overwriting", async () => {
  const record = (save) => ({
    _id: ID,
    name: "Commute",
    country: "BD",
    origin: trip.origin,
    destination: trip.destination,
    stops: [],
    passengerCount: 1,
    updatedAt: new Date("2026-10-11T10:00:00Z"),
    save,
    toObject() {
      return { ...this };
    },
  });
  const libraryFor = (stored) =>
    load("lib/saved-trips.ts", {
      "@/lib/mongodb": async () => {},
      mongoose: validObjectId,
      "@/models/SavedTrip": { __esModule: true, default: { findOne: async () => stored } },
    });
  const rename = (stored, patch) =>
    libraryFor(stored).updateSavedTrip({ userId: "user", savedTripId: ID, patch: { name: "School run", ...patch } });
  const refused = (error) =>
    error.statusCode === 409 && error.userMessage === "This trip was changed elsewhere. Reload and try again.";

  // The caller last saw the trip before someone else changed it.
  let saves = 0;
  const stale = record(async () => (saves += 1));
  await assert.rejects(rename(stale, { expectedUpdatedAt: "2026-10-11T09:00:00.000Z" }), refused);
  assert.equal(saves, 0);
  assert.equal(stale.name, "Commute");

  // The caller's copy is current: the edit goes through.
  const current = record(async () => {});
  assert.equal((await rename(current, { expectedUpdatedAt: "2026-10-11T10:00:00.000Z" })).name, "School run");

  // Two edits in flight at once: the store rejects the second write.
  const racing = record(async () => {
    throw Object.assign(new Error("No matching document found"), { name: "VersionError" });
  });
  await assert.rejects(rename(racing, {}), refused);

  const model = fs.readFileSync(path.join(root, "models/SavedTrip.ts"), "utf8");
  assert.match(model, /optimisticConcurrency: true/);
});
