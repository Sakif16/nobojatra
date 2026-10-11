import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const ID = {
  bdCar: "aaaaaaaaaaaaaaaaaaaaaaa1",
  bdBike: "aaaaaaaaaaaaaaaaaaaaaaa2",
  usCar: "aaaaaaaaaaaaaaaaaaaaaaa3",
  legacyCar: "aaaaaaaaaaaaaaaaaaaaaaa4",
};
const rate = (id, country, maxPassengers, displayName) => ({
  _id: id,
  ...(country ? { country } : {}),
  provider: "p",
  vehicleType: maxPassengers === 1 ? "bike" : "go",
  displayName,
  baseFare: 50,
  perKmRate: 20,
  perMinRate: 2,
  minimumFare: 80,
  maxPassengers,
  isActive: true,
});
const RATES = [
  rate(ID.bdCar, "BD", 4, "Dhaka Car"),
  rate(ID.bdBike, "BD", 1, "Dhaka Bike"),
  rate(ID.usCar, "US", 4, "US Car"),
  // Written before rates carried a country; reads as Bangladesh.
  rate(ID.legacyCar, undefined, 4, "Legacy Car"),
];
const route = {
  id: "route-0",
  rank: 1,
  coords: [[23.81, 90.41], [23.87, 90.38]],
  distanceKm: 9,
  durationMin: 25,
  legs: [],
};
const trip = (passengerCount) => ({
  origin: { label: "A", lat: 23.81, lng: 90.41 },
  destination: { label: "B", lat: 23.87, lng: 90.38 },
  stops: [],
  passengerCount,
  departureMode: "now",
  timeZone: "Asia/Dhaka",
  distanceMeters: 9000,
});

/** lib/saved-trips with its database and providers replaced, and call counters. */
function setup(stored = null) {
  const calls = { routing: 0, created: [] };
  const savedTrips = load("lib/saved-trips.ts", {
    "@/lib/mongodb": async () => {},
    "@/lib/alerts": { deleteAlertsForSavedTrip: async () => {} },
    "@/lib/route-service": {
      RouteServiceError: class RouteServiceError extends Error {},
      fetchRouteSuggestions: async () => {
        calls.routing += 1;
        return [route];
      },
    },
    mongoose: { Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/.test(String(id)) } } },
    "@/models/VehicleRate": {
      __esModule: true,
      default: {
        findOne: (query) => ({
          lean: async () =>
            RATES.find((entry) => entry._id === String(query._id) && entry.isActive === query.isActive) ?? null,
        }),
      },
    },
    "@/models/SavedTrip": {
      __esModule: true,
      MAX_CONDITIONS_PER_TRIP: 10,
      TRAFFIC_LEVELS: ["low", "moderate", "high", "severe"],
      default: {
        find: () => ({ select: () => ({ lean: async () => [] }) }),
        findOne: async () => stored,
        create: async (document) => {
          calls.created.push(document);
          return { toObject: () => ({ _id: "saved", ...document }) };
        },
      },
    },
  });
  return { savedTrips, calls };
}

const create = (savedTrips, { vehicle, country = "BD", passengers = 1 }) =>
  savedTrips.createSavedTrip({
    userId: "user",
    name: "Commute",
    trip: trip(passengers),
    preferredVehicleRateId: vehicle,
    country,
  });

test("a vehicle from another country is refused before any route or fare work", async () => {
  const { savedTrips, calls } = setup();

  await assert.rejects(create(savedTrips, { vehicle: ID.usCar }), (error) => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.userMessage, "That vehicle is not available in Bangladesh.");
    return true;
  });
  await assert.rejects(create(savedTrips, { vehicle: ID.bdCar, country: "US" }), (error) => {
    assert.equal(error.userMessage, "That vehicle is not available in the United States.");
    return true;
  });
  assert.equal(calls.routing, 0);
  assert.equal(calls.created.length, 0);
});

test("a vehicle from the trip's own country is accepted and priced", async () => {
  const { savedTrips, calls } = setup();

  const saved = await create(savedTrips, { vehicle: ID.bdCar });
  assert.equal(saved.preferredVehicle.displayName, "Dhaka Car");
  assert.ok(saved.baseline.fareLow > 0);

  // A rate with no country predates the field and belongs to Bangladesh.
  const legacy = await create(savedTrips, { vehicle: ID.legacyCar });
  assert.equal(legacy.preferredVehicle.displayName, "Legacy Car");
  await assert.rejects(create(savedTrips, { vehicle: ID.legacyCar, country: "UK" }));

  assert.equal(calls.created.length, 2);
});

function storedTrip(overrides = {}) {
  return {
    _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
    name: "Commute",
    country: "BD",
    origin: trip(1).origin,
    destination: trip(1).destination,
    stops: [],
    passengerCount: 1,
    departureMode: "now",
    preferredVehicle: { vehicleRateId: ID.bdBike, provider: "p", vehicleType: "bike", displayName: "Dhaka Bike" },
    baseline: { fareLow: 100, fareHigh: 120, durationMin: 25, fareSource: "rate_card", capturedAt: new Date() },
    route: null,
    conditions: [],
    async save() {},
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

const update = (savedTrips, patch) =>
  savedTrips.updateSavedTrip({ userId: "user", savedTripId: "bbbbbbbbbbbbbbbbbbbbbbbb", patch });

test("editing a trip checks a new vehicle against the trip's country, not the profile's", async () => {
  const stored = storedTrip();
  const { savedTrips } = setup(stored);

  await assert.rejects(update(savedTrips, { preferredVehicleRateId: ID.usCar }), (error) => {
    assert.equal(error.userMessage, "That vehicle is not available in Bangladesh.");
    return true;
  });
  // Nothing was changed by the refused edit.
  assert.equal(stored.preferredVehicle.displayName, "Dhaka Bike");

  const updated = await update(savedTrips, { preferredVehicleRateId: ID.bdCar });
  assert.equal(updated.preferredVehicle.displayName, "Dhaka Car");
});

test("more passengers than the saved vehicle seats clears the vehicle and its baseline", async () => {
  const stored = storedTrip();
  const { savedTrips } = setup(stored);

  const updated = await update(savedTrips, { trip: trip(3) });

  assert.equal(updated.passengerCount, 3);
  assert.equal(updated.preferredVehicle, null);
  assert.equal(updated.baseline, null);
});

test("an edit the saved vehicle still fits keeps it and re-prices it", async () => {
  const stored = storedTrip({
    preferredVehicle: { vehicleRateId: ID.bdCar, provider: "p", vehicleType: "go", displayName: "Dhaka Car" },
    baseline: { fareLow: 1, fareHigh: 2, durationMin: 1, fareSource: "rate_card", capturedAt: new Date() },
  });
  const { savedTrips } = setup(stored);

  const updated = await update(savedTrips, { trip: trip(3) });

  assert.equal(updated.preferredVehicle.displayName, "Dhaka Car");
  assert.ok(updated.baseline.fareLow > 2);
});

test("a stored vehicle from another country is dropped the next time the trip is edited", async () => {
  const stored = storedTrip({
    preferredVehicle: { vehicleRateId: ID.usCar, provider: "p", vehicleType: "go", displayName: "US Car" },
  });
  const { savedTrips } = setup(stored);

  const updated = await update(savedTrips, { trip: trip(1) });

  assert.equal(updated.preferredVehicle, null);
  assert.equal(updated.baseline, null);
});

test("the form lets go of a vehicle that no longer seats the party", () => {
  const { clampPassengerCount, keepVehicleIfItFits, seatsPassengers } = load("lib/vehicle-capacity.ts");
  const vehicles = [
    { id: "bike", maxPassengers: 1 },
    { id: "car", maxPassengers: 4 },
  ];

  assert.equal(keepVehicleIfItFits("bike", vehicles, 1), "bike");
  assert.equal(keepVehicleIfItFits("bike", vehicles, 2), "");
  assert.equal(keepVehicleIfItFits("car", vehicles, 4), "car");
  assert.equal(keepVehicleIfItFits("car", vehicles, 5), "");
  assert.equal(keepVehicleIfItFits("", vehicles, 2), "");
  assert.equal(keepVehicleIfItFits("gone", vehicles, 1), "");
  assert.equal(seatsPassengers({ maxPassengers: 4 }, 4), true);

  // An emptied field used to submit 0 passengers.
  assert.equal(clampPassengerCount(""), 1);
  assert.equal(clampPassengerCount("0"), 1);
  assert.equal(clampPassengerCount("-3"), 1);
  assert.equal(clampPassengerCount("abc"), 1);
  assert.equal(clampPassengerCount("3"), 3);
  assert.equal(clampPassengerCount("2.9"), 2);
  assert.equal(clampPassengerCount("15"), 8);
});

test("alert evaluation does not price a trip from another country's rate", async () => {
  const evaluatorFor = () =>
    load("lib/alert-evaluator/context.ts", {
      "@/lib/mongodb": async () => {},
      "@/lib/route-service": { fetchRouteSuggestions: async () => [route] },
      "@/lib/weather": { fetchWeatherForPoint: async () => ({ severityBand: "low", severityScore: 0 }) },
      mongoose: { Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/.test(String(id)) } } },
      "@/models/VehicleRate": {
        __esModule: true,
        default: {
          findOne: (query) => ({
            select: () => ({
              lean: async () => RATES.find((entry) => entry._id === String(query._id)) ?? null,
            }),
          }),
        },
      },
    });
  const evaluate = (vehicleRateId) =>
    evaluatorFor().buildEvaluationContext({
      _id: "saved",
      name: "Commute",
      country: "BD",
      origin: trip(1).origin,
      destination: trip(1).destination,
      stops: [],
      departureMode: "now",
      preferredVehicle: { vehicleRateId },
      baseline: null,
    });

  const foreign = await evaluate(ID.usCar);
  assert.equal(foreign.context.fare, null);
  assert.deepEqual(foreign.notes, ["Fare unavailable: preferred vehicle belongs to another country."]);
  // The rest of the evaluation still runs.
  assert.equal(foreign.context.weather.severityBand, "low");

  const local = await evaluate(ID.bdCar);
  assert.ok(local.context.fare.mid > 0);
  assert.deepEqual(local.notes, []);
});
