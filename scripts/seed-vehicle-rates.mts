/**
 * Seeds the VehicleRate table.
 *
 *   node scripts/seed-vehicle-rates.mts     (or: pnpm seed:rates)
 *
 * Node strips the TypeScript natively, so this needs no build step and no
 * extra dependency.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE NUMBERS BELOW ARE APPROXIMATIONS, not published tariffs — this applies
 * equally to the Dhaka figures and to the US and UK ones added alongside them.
 * They exist so the fare panel has something plausible to show. The app never
 * presents them as quotes — every figure is rendered as a range and labelled an
 * estimate — but you should still tune these against current published rates
 * before anyone relies on them. Editing this array and re-running is the whole
 * update process; upserts key on (country, provider, vehicleType), so it is
 * safe to run repeatedly.
 *
 * Each country's figures are in that country's own currency: BDT for BD, USD
 * for US, GBP for UK. Nothing here converts between them — a rate card is only
 * ever priced against trips in its own country.
 *
 * MIGRATION: this script handles the move to country-scoped rates itself. It
 * drops the old (provider, vehicleType) unique index, creates the country-
 * scoped one, and backfills any pre-existing rate row to BD before upserting.
 * All three steps are idempotent, so re-running is safe.
 * ─────────────────────────────────────────────────────────────────────────
 */
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "nobojatra";

type SeedRate = {
  country: "BD" | "US" | "UK";
  provider: "uber" | "pathao" | "cng" | "lyft" | "bolt";
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
  // ── Bangladesh (BDT) ────────────────────────────────────────────────────
  {
    country: "BD",
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
    country: "BD",
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
    country: "BD",
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
    country: "BD",
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
    country: "BD",
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
    country: "BD",
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
    country: "BD",
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

  // ── United States (USD) ─────────────────────────────────────────────────
  // Per-km rates are converted from the per-mile figures these services
  // actually quote (divide by 1.609), because the app computes every fare in
  // kilometres regardless of country.
  {
    country: "US",
    provider: "uber",
    vehicleType: "go",
    displayName: "UberX",
    baseFare: 2.55,
    perKmRate: 1.09,
    perMinRate: 0.35,
    minimumFare: 8,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "US",
    provider: "uber",
    vehicleType: "xl",
    displayName: "Uber XL",
    baseFare: 4,
    perKmRate: 1.77,
    perMinRate: 0.5,
    minimumFare: 12,
    maxPassengers: 6,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "US",
    provider: "uber",
    vehicleType: "premier",
    displayName: "Uber Black",
    baseFare: 7,
    perKmRate: 2.33,
    perMinRate: 0.65,
    minimumFare: 26,
    maxPassengers: 4,
    comfortScore: 5,
    speedFactor: 1,
  },
  {
    country: "US",
    provider: "lyft",
    vehicleType: "go",
    displayName: "Lyft",
    baseFare: 2.3,
    perKmRate: 1.03,
    perMinRate: 0.33,
    minimumFare: 8,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "US",
    provider: "lyft",
    vehicleType: "xl",
    displayName: "Lyft XL",
    baseFare: 3.8,
    perKmRate: 1.68,
    perMinRate: 0.48,
    minimumFare: 11,
    maxPassengers: 6,
    comfortScore: 4,
    speedFactor: 1,
  },

  // ── United Kingdom (GBP) ────────────────────────────────────────────────
  {
    country: "UK",
    provider: "uber",
    vehicleType: "go",
    displayName: "UberX",
    baseFare: 2.5,
    perKmRate: 1.25,
    perMinRate: 0.2,
    minimumFare: 5,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "UK",
    provider: "uber",
    vehicleType: "xl",
    displayName: "Uber XL",
    baseFare: 3.5,
    perKmRate: 1.95,
    perMinRate: 0.28,
    minimumFare: 8,
    maxPassengers: 6,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "UK",
    provider: "bolt",
    vehicleType: "go",
    displayName: "Bolt",
    baseFare: 2,
    perKmRate: 1.1,
    perMinRate: 0.17,
    minimumFare: 5,
    maxPassengers: 4,
    comfortScore: 4,
    speedFactor: 1,
  },
  {
    country: "UK",
    provider: "bolt",
    vehicleType: "xl",
    displayName: "Bolt XL",
    baseFare: 3.2,
    perKmRate: 1.8,
    perMinRate: 0.25,
    minimumFare: 7,
    maxPassengers: 6,
    comfortScore: 4,
    speedFactor: 1,
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
      country: String,
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

  // The old unique index was (provider, vehicleType), which cannot coexist with
  // rates for the same vehicle in several countries — the second country's rows
  // would be rejected as duplicates. Dropping an index removes no data and the
  // model recreates the country-scoped one, so this is safe to run repeatedly.
  try {
    await VehicleRate.collection.dropIndex("provider_1_vehicleType_1");
    console.log("  dropped stale unique index provider_1_vehicleType_1");
  } catch {
    // Already dropped, or a fresh database that never had it.
  }

  await VehicleRate.collection.createIndex(
    { country: 1, provider: 1, vehicleType: 1 },
    { unique: true },
  );

  // Backfill before upserting. Rows seeded before the country field existed
  // have no country at all, so the upsert filter below — which now includes
  // country — would not match them: it would insert a second copy of every
  // Bangladeshi rate and leave the originals orphaned, invisible to a fare
  // lookup that filters on country but still present in the collection.
  // Those rows ARE the BD fleet, so this claims them.
  const backfilled = await VehicleRate.updateMany(
    { country: { $exists: false } },
    { $set: { country: "BD" } },
  );

  if (backfilled.modifiedCount > 0) {
    console.log(`  backfilled ${backfilled.modifiedCount} pre-existing rate(s) to BD\n`);
  }

  for (const rate of RATES) {
    await VehicleRate.updateOne(
      { country: rate.country, provider: rate.provider, vehicleType: rate.vehicleType },
      { $set: { ...rate, isActive: true } },
      { upsert: true },
    );
    console.log(`  upserted ${rate.country} · ${rate.displayName}`);
  }

  const total = await VehicleRate.countDocuments({ isActive: true });
  console.log(`\nDone. ${total} active vehicle rates.`);

  for (const country of ["BD", "US", "UK"]) {
    const count = await VehicleRate.countDocuments({ country, isActive: true });
    console.log(`  ${country}: ${count}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Seed failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
