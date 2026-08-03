/**
 * Seeds the VehicleRate table.
 *
 *   node scripts/seed-vehicle-rates.mts     (or: pnpm seed:rates)
 *
 * Node strips the TypeScript natively, so this needs no build step and no
 * extra dependency.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE NUMBERS BELOW ARE APPROXIMATIONS of the Dhaka market, not published
 * tariffs. They exist so the fare panel has something plausible to show. The
 * app never presents them as quotes — every figure is rendered as a range and
 * labelled an estimate — but you should still tune these against current
 * published rates before anyone relies on them. Editing this array and
 * re-running is the whole update process; upserts key on
 * (provider, vehicleType), so it is safe to run repeatedly.
 * ─────────────────────────────────────────────────────────────────────────
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "nobojatra";

type SeedRate = {
  provider: "uber" | "pathao" | "cng";
  vehicleType: "go" | "moto" | "premier" | "bike" | "car" | "auto" | "xl";
  displayName: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  maxPassengers: number;
  comfortScore: number;
  speedFactor: number;
};

const RATES: SeedRate[] = [
  {
    provider: "pathao",
    vehicleType: "bike",
    displayName: "Pathao Bike",
    baseFare: 25,
    perKmRate: 12,
    perMinRate: 0.5,
    minimumFare: 35,
    maxPassengers: 1,
    comfortScore: 2,
    speedFactor: 0.7,
  },
  {
    provider: "uber",
    vehicleType: "moto",
    displayName: "Uber Moto",
    baseFare: 25,
    perKmRate: 11,
    perMinRate: 0.5,
    minimumFare: 35,
    maxPassengers: 1,
    comfortScore: 2,
    speedFactor: 0.7,
  },
  {
    provider: "cng",
    vehicleType: "auto",
    displayName: "CNG Auto-rickshaw",
    baseFare: 40,
    perKmRate: 20,
    perMinRate: 1,
    minimumFare: 60,
    maxPassengers: 3,
    comfortScore: 2,
    speedFactor: 1.1,
  },
  {
    provider: "pathao",
    vehicleType: "car",
    displayName: "Pathao Car",
    baseFare: 55,
    perKmRate: 21,
    perMinRate: 2.5,
    minimumFare: 105,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    provider: "uber",
    vehicleType: "go",
    displayName: "Uber Go",
    baseFare: 60,
    perKmRate: 22,
    perMinRate: 2.5,
    minimumFare: 110,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    provider: "uber",
    vehicleType: "premier",
    displayName: "Uber Premier",
    baseFare: 80,
    perKmRate: 28,
    perMinRate: 3,
    minimumFare: 150,
    maxPassengers: 4,
    comfortScore: 5,
    speedFactor: 1,
  },
  {
    // The eight-seat class, so groups of 5–8 have a real option rather than a
    // list where every row is disabled.
    provider: "uber",
    vehicleType: "xl",
    displayName: "Uber XL (8-seater)",
    baseFare: 120,
    perKmRate: 35,
    perMinRate: 3.5,
    minimumFare: 220,
    maxPassengers: 8,
    comfortScore: 4,
    speedFactor: 1.05,
  },
];

async function main() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to .env and retry.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });

  // Defined inline rather than imported: the model file uses the "@/" path
  // alias, which only resolves inside the Next build.
  const schema = new mongoose.Schema(
    {
      provider: String,
      vehicleType: String,
      displayName: String,
      baseFare: Number,
      perKmRate: Number,
      perMinRate: Number,
      minimumFare: Number,
      maxPassengers: Number,
      comfortScore: Number,
      speedFactor: { type: Number, default: 1 },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true, collection: "vehiclerates" },
  );

  const VehicleRate =
    mongoose.models.VehicleRate ?? mongoose.model("VehicleRate", schema);

  for (const rate of RATES) {
    await VehicleRate.updateOne(
      { provider: rate.provider, vehicleType: rate.vehicleType },
      { $set: { ...rate, isActive: true } },
      { upsert: true },
    );
    console.log(`  upserted ${rate.displayName}`);
  }

  const total = await VehicleRate.countDocuments({ isActive: true });
  console.log(`\nDone. ${total} active vehicle rates.`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
