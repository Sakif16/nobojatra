import { Schema, model, models } from "mongoose";
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from "@/lib/country-config";

/**
 * A trip the user named and kept, to plan again in one tap.
 *
 * TripHistory is an append-only log — a row is written on every route search —
 * so it is the wrong place for something the user curates. A SavedTrip is the
 * opposite: the user names it, it stays until they delete it, and it holds
 * only what the planner needs to be filled in again.
 *
 * It holds no route and no fare. Both are worked out when the trip is planned,
 * so they are current then rather than a copy from the day it was saved.
 *
 * Records written while saved trips also carried alert conditions still have
 * those fields in the database (`conditions`, `baseline`, `preferredVehicle`,
 * `route`, `isActive`, `lastEvaluatedAt`). They are not in this schema, so
 * nothing reads or writes them.
 */

const TripLocationSchema = new Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    dwellMinutes: { type: Number, min: 0, max: 60, default: undefined },
  },
  { _id: false },
);

const SavedTripSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    origin: {
      type: TripLocationSchema,
      required: true,
    },
    destination: {
      type: TripLocationSchema,
      required: true,
    },
    stops: {
      type: [TripLocationSchema],
      default: [],
    },
    // Fixed at creation: the places belong to one country's service area, and
    // the list only offers a trip in the country it can be planned in.
    country: {
      type: String,
      enum: COUNTRY_OPTIONS,
      default: DEFAULT_COUNTRY,
    },
    passengerCount: {
      type: Number,
      min: 1,
      max: 8,
      default: 1,
    },
    // The IANA zone at the origin. Null on records written before it was
    // stored, which read back in the country's default zone.
    timeZone: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    // A save fails if the row changed since it was read, instead of writing
    // over the other change. See updateSavedTrip in lib/saved-trips.
    optimisticConcurrency: true,
  },
);

// Names are the user-facing handle for a trip, so two trips called "Commute"
// in one account would be indistinguishable in the list. The unique index
// makes that a 409 at the API rather than a support question.
//
// Scoped by country because the saved-trips list is: without the country in
// the key, someone whose Dhaka list holds "Commute" would be refused a London
// "Commute" by a trip their screen cannot show them.
//
// NOTE: the older { userId, name } index is not dropped automatically. It has
// been dropped from the shared database; any other environment that still has
// it keeps names unique per account until it is dropped there too.
SavedTripSchema.index({ userId: 1, country: 1, name: 1 }, { unique: true });

export default models.SavedTrip || model("SavedTrip", SavedTripSchema);
