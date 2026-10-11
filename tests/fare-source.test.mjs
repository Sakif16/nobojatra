import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const validObjectId = { Types: { ObjectId: { isValid: (id) => /^[a-f0-9]{24}$/.test(String(id)) } } };

test("each source has a label, and an unrecorded one has none", () => {
  const { getFareSourceLabel } = load("lib/fare-source.ts");

  assert.equal(getFareSourceLabel("rate_card"), "Rate-card estimate");
  assert.equal(getFareSourceLabel("pathao_api"), "Live Pathao pricing");
  for (const missing of [undefined, null, "", "something_else"]) {
    assert.equal(getFareSourceLabel(missing), null);
  }
});

test("a saved plan keeps the source of its fare", async () => {
  const selectedVehicle = {
    provider: "pathao",
    vehicleType: "car",
    displayName: "Pathao Car",
    maxPassengers: 4,
    estimatedFareLow: 300,
    estimatedFareHigh: 360,
  };
  const summaryFor = (vehicle) =>
    load("lib/trip-history.ts", {
      "@/lib/mongodb": async () => {},
      mongoose: validObjectId,
      "@/models/TripHistory": {
        findOne: () => ({
          lean: async () => ({ _id: "trip", country: "BD", createdAt: "2026-10-01T00:00:00Z", selectedVehicle: vehicle }),
        }),
      },
    }).getTripSummary("user", "bbbbbbbbbbbbbbbbbbbbbbbb");

  const fallback = await summaryFor({
    ...selectedVehicle,
    fareSource: "rate_card",
    fareSourceNote: "Live Pathao pricing was unavailable; showing a rate-card estimate.",
  });
  assert.equal(fallback.vehicle.fareSource, "rate_card");
  assert.match(fallback.vehicle.fareSourceNote, /rate-card estimate/);

  // A plan saved before the source was stored says nothing rather than guessing.
  const older = await summaryFor(selectedVehicle);
  assert.equal(older.vehicle.fareSource, null);
  assert.equal(older.vehicle.fareSourceNote, null);
});

test("every screen that shows a fare shows where it came from", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

  for (const file of [
    "components/FareResults.tsx",
    "components/BestOptionsResults.tsx",
    "components/TripSummary.tsx",
  ]) {
    assert.match(read(file), /getFareSourceLabel\(/, `${file} does not label the fare source`);
  }
  for (const file of ["components/FareResults.tsx", "components/BestOptionsResults.tsx", "components/TripSummary.tsx"]) {
    assert.match(read(file), /\{[^}]*fareSourceNote\}/, `${file} does not show the fallback note`);
  }
  // The plan is saved with the source the user was shown.
  assert.match(read("app/api/trip-input/select/route.ts"), /fareSource: fareEstimate\.fareSource/);
});
