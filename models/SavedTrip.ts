import { Schema, model, models } from "mongoose";
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from "@/lib/country-config";

/**
 * A trip the user named and kept, independent of TripHistory.
 *
 * TripHistory is an append-only log — a row is written on every route search —
 * so it is the wrong place to hang long-lived alert conditions off. A SavedTrip
 * is curated: the user names it, it survives, and it carries the conditions
 * that the alert evaluator checks on a schedule.
 *
 * `route` and `baseline` are resolved once at creation and refreshed by the
 * evaluator. The baseline exists so "fare shifted more than X%" has a fixed
 * reference point that a later edit cannot silently redefine.
 */

export const ALERT_CONDITION_TYPES = [
  "weather_severity",
  "traffic_level",
  "fare_change",
] as const;
export type AlertConditionType = (typeof ALERT_CONDITION_TYPES)[number];

export const TRAFFIC_LEVELS = ["low", "moderate", "high", "severe"] as const;
export type TrafficLevel = (typeof TRAFFIC_LEVELS)[number];

export const MAX_CONDITIONS_PER_TRIP = 10;

const TripLocationSchema = new Schema(
  {
    label: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    dwellMinutes: { type: Number, min: 0, max: 60, default: undefined },
  },
  { _id: false },
);

const RouteSnapshotSchema = new Schema(
  {
    routeId: { type: String, required: true },
    distanceKm: { type: Number, required: true },
    travelDurationMin: { type: Number, default: null },
    dwellDurationMin: { type: Number, default: 0 },
    durationMin: { type: Number, required: true },
    coords: { type: [[Number]], default: [] },
    legs: { type: [Schema.Types.Mixed], default: [] },
    resolvedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * The vehicle the user wants priced. Denormalized by value — same reasoning as
 * TripHistory.selectedVehicle — so an edit to the rate table cannot rewrite
 * what the user chose. `vehicleRateId` is kept so the evaluator can re-read
 * live rate columns when it re-prices.
 */
const PreferredVehicleSchema = new Schema(
  {
    vehicleRateId: { type: Schema.Types.ObjectId, ref: "VehicleRate", required: true },
    provider: { type: String, required: true },
    vehicleType: { type: String, required: true },
    displayName: { type: String, required: true },
  },
  { _id: false },
);

const BaselineSchema = new Schema(
  {
    fareLow: { type: Number, required: true },
    fareHigh: { type: Number, required: true },
    durationMin: { type: Number, required: true },
    // Whether the baseline fare came from the live provider or the rate card.
    // A baseline captured from a degraded source is still usable, but knowing
    // which one it was matters when a later comparison looks surprising.
    fareSource: { type: String, enum: ["pathao_api", "rate_card"], required: true },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * `lastState` is what makes alerting fire on a transition rather than on a
 * state. Without it, an evaluator running every 15 minutes through a rainy
 * afternoon would write the same alert dozens of times; with it, the alert is
 * written only when the condition crosses from false to true.
 *
 * `_id` is deliberately kept — conditions are addressed individually by the
 * API (PATCH/DELETE /conditions/[conditionId]).
 */
const AlertConditionSchema = new Schema({
  type: {
    type: String,
    enum: ALERT_CONDITION_TYPES,
    required: true,
  },
  /** Weather severity score, or percent change for fare_change. */
  threshold: { type: Number, default: null },
  /** The level at or above which traffic_level fires. Unused by other types. */
  level: { type: String, enum: TRAFFIC_LEVELS, default: null },
  isActive: { type: Boolean, default: true },
  lastState: { type: Boolean, default: false },
  lastTriggeredAt: { type: Date, default: null },
});

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
    // Fixed at creation. The alert evaluator re-prices this trip on a schedule
    // and must keep using the rate table and currency the baseline was captured
    // against, regardless of what the user's profile says later.
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
    departureMode: {
      type: String,
      enum: ["now", "scheduled"],
      default: "now",
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    preferredVehicle: {
      type: PreferredVehicleSchema,
      default: null,
    },
    route: {
      type: RouteSnapshotSchema,
      default: null,
    },
    baseline: {
      type: BaselineSchema,
      default: null,
    },
    conditions: {
      type: [AlertConditionSchema],
      default: [],
      validate: {
        validator: (value: unknown[]) => value.length <= MAX_CONDITIONS_PER_TRIP,
        message: `You can attach up to ${MAX_CONDITIONS_PER_TRIP} conditions to a trip.`,
      },
    },
    /** Cleared by the user to stop evaluation without deleting the trip. */
    isActive: {
      type: Boolean,
      default: true,
    },
    lastEvaluatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Names are the user-facing handle for a trip, so two trips called "Commute"
// in one account would be indistinguishable in the notification list. The
// unique index makes that a 409 at the API rather than a support question.
SavedTripSchema.index({ userId: 1, name: 1 }, { unique: true });

export default models.SavedTrip || model("SavedTrip", SavedTripSchema);
