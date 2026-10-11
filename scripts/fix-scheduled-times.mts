/**
 * Repairs scheduled departure times stored before trips knew their time zone.
 *
 *   node --env-file=.env scripts/fix-scheduled-times.mts            (dry run)
 *   node --env-file=.env scripts/fix-scheduled-times.mts --apply
 *
 * THE DEFECT: the planner sent a bare wall-clock time ("2026-09-18T20:28") and
 * the server parsed it with `new Date`, in the server's own zone. On a UTC host
 * a Dhaka user's 20:28 was stored as 20:28Z — six hours late. On a laptop set
 * to Dhaka time the same code stored the right instant. Nothing on the record
 * says which host wrote it.
 *
 * WHAT CAN BE TOLD APART: the form prefilled the field with the browser's
 * clock at page load plus one minute. Stored by a UTC host, such a time sits
 * almost exactly one zone offset after the record's own `createdAt`. Stored
 * correctly, it sits a minute or two before or after `createdAt`. So a record
 * whose stored time, re-read as a wall-clock time in the trip's zone, lands in
 * the few minutes around its creation is one the UTC host wrote with the
 * prefilled time, and re-reading it is the repair.
 *
 * Any other scheduled record is left alone and listed: a time the user chose
 * by hand fits both readings, and guessing would damage the correct ones.
 *
 * Only records with no `timeZone` are considered — every record written since
 * the fix has one — so running this twice changes nothing the second time.
 * The dry run prints each record's stored value, which is also what is needed
 * to undo a repair.
 */
import mongoose from "mongoose";

import { getCountryConfig } from "../lib/country-config.ts";
import { formatLocalDateTime, localDateTimeToInstant } from "../lib/trip-time.ts";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "nobojatra";
const APPLY = process.argv.includes("--apply");

/**
 * How far from `createdAt` a re-read prefilled time can sit: the form allowed
 * it to go stale while the user filled in the rest, and it started a minute
 * ahead of the clock.
 */
const PREFILL_BEFORE_CREATION_MS = 15 * 60 * 1000;
const PREFILL_AFTER_CREATION_MS = 2 * 60 * 1000;

const COLLECTIONS = ["triphistories", "savedtrips"];

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in your .env file");
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });

const db = mongoose.connection.db;
if (!db) throw new Error("No database connection.");

let repaired = 0;
let leftAlone = 0;

for (const name of COLLECTIONS) {
  const collection = db.collection(name);
  const records = await collection
    .find({ scheduledAt: { $type: "date" }, timeZone: null })
    .project({ country: 1, scheduledAt: 1, createdAt: 1 })
    .sort({ createdAt: 1 })
    .toArray();

  for (const record of records) {
    const stored = record.scheduledAt as Date;
    const createdAt = record.createdAt as Date;
    // Every record this old predates per-origin zones, and none is in a
    // country with more than one, so the country's zone is the trip's zone.
    const { timeZone, timeZones } = getCountryConfig(record.country);
    const reread = localDateTimeToInstant(stored.toISOString().slice(0, 16), timeZone);
    const id = String(record._id);

    const sinceCreationMs = reread.ok ? reread.instant.getTime() - createdAt.getTime() : NaN;
    const isPrefilledByUtcHost =
      timeZones.length === 1 &&
      sinceCreationMs >= -PREFILL_BEFORE_CREATION_MS &&
      sinceCreationMs <= PREFILL_AFTER_CREATION_MS;

    if (!reread.ok || !isPrefilledByUtcHost) {
      leftAlone += 1;
      console.log(
        `LEFT ALONE  ${name} ${id}  stored ${stored.toISOString()}  ` +
          `(${formatLocalDateTime(stored, timeZone)} ${timeZone} as stored` +
          (reread.ok ? `, ${formatLocalDateTime(reread.instant, timeZone)} if re-read` : "") +
          `)  created ${createdAt.toISOString()}`,
      );
      continue;
    }

    repaired += 1;
    console.log(
      `${APPLY ? "REPAIRED  " : "WOULD FIX "}  ${name} ${id}  ` +
        `${stored.toISOString()} -> ${reread.instant.toISOString()}  ` +
        `(${formatLocalDateTime(reread.instant, timeZone)} ${timeZone})  created ${createdAt.toISOString()}`,
    );

    if (APPLY) {
      // Matching on the stored value makes this a no-op if the record changed
      // since it was read.
      await collection.updateOne(
        { _id: record._id, scheduledAt: stored, timeZone: null },
        { $set: { scheduledAt: reread.instant, timeZone } },
      );
    }
  }
}

console.log(
  `\n${APPLY ? "Repaired" : "Would repair"} ${repaired}; left alone ${leftAlone}.` +
    (APPLY ? "" : " Nothing was written. Re-run with --apply to write."),
);

await mongoose.disconnect();
