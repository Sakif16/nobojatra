import { Schema, model, models } from "mongoose";

const TripLocationSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const RouteSnapshotSchema = new Schema(
  {
    routeId: {
      type: String,
      required: true,
    },
    rank: {
      type: Number,
      required: true,
    },
    distanceKm: {
      type: Number,
      required: true,
    },
    durationMin: {
      type: Number,
      required: true,
    },
    coords: {
      type: [[Number]],
      default: [],
    },
    legs: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false },
);

/**
 * Snapshot of the vehicle the user picked, with the fare range as estimated at
 * the time. Stored by value rather than by reference so a later change to the
 * rate table never rewrites what someone was shown.
 */
const SelectedVehicleSchema = new Schema(
  {
    vehicleRateId: {
      type: Schema.Types.ObjectId,
      ref: "VehicleRate",
    },
    provider: {
      type: String,
      required: true,
    },
    vehicleType: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    maxPassengers: {
      type: Number,
      required: true,
    },
    estimatedFareLow: {
      type: Number,
      required: true,
    },
    estimatedFareHigh: {
      type: Number,
      required: true,
    },
    estimatedDurationMin: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: "BDT",
    },
  },
  { _id: false },
);

/**
 * Weather/traffic reading captured at the moment the user confirmed a
 * vehicle. Stored by value so the Trip Summary page can show "what it was
 * like when you booked" without re-querying OpenWeather/TomTom — a snapshot,
 * not a live-updating reading.
 */
const SelectionWeatherSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["route_midpoint", "dhaka_fallback"],
    },
    temperatureCelsius: { type: Number },
    precipitationMmPerHour: { type: Number },
    windKmh: { type: Number },
    visibilityMeters: { type: Number, default: null },
    severityScore: { type: Number },
    severityBand: {
      type: String,
      enum: ["low", "moderate", "severe"],
    },
  },
  { _id: false },
);

const SelectionTrafficSchema = new Schema(
  {
    congestionIndexPercent: { type: Number },
    congestionLevel: {
      type: String,
      enum: ["low", "moderate", "high", "severe"],
    },
    isPeakHour: { type: Boolean },
    durationInTrafficMin: { type: Number },
    baselineDurationMin: { type: Number },
  },
  { _id: false },
);

const SelectionSnapshotSchema = new Schema(
  {
    weather: { type: SelectionWeatherSchema, default: null },
    weatherUnavailable: { type: Boolean, default: false },
    traffic: { type: SelectionTrafficSchema, default: null },
    trafficUnavailable: { type: Boolean, default: false },
    capturedAt: { type: Date, default: null },
  },
  { _id: false },
);

const TripHistorySchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "Map_route",
    },
    origin: {
      type: Schema.Types.Mixed,
      required: true,
    },
    destination: {
      type: Schema.Types.Mixed,
      required: true,
    },
    stops: {
      type: [TripLocationSchema],
      default: [],
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
    routeOptions: {
      type: [RouteSnapshotSchema],
      default: [],
    },
    selectedRoute: {
      type: RouteSnapshotSchema,
      default: null,
    },
    selectedVehicle: {
      type: SelectedVehicleSchema,
      default: null,
    },
    // Weather/traffic snapshot taken at the moment selectedVehicle was
    // confirmed. Null until a vehicle is confirmed.
    selectionSnapshot: {
      type: SelectionSnapshotSchema,
      default: null,
    },
    // When the user actually confirmed a vehicle — distinct from
    // completedAt/createdAt, which are set when the route search happened.
    selectedAt: {
      type: Date,
      default: null,
    },
    distanceKm: {
      type: Number,
      default: null,
    },
    durationMin: {
      type: Number,
      default: null,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

export default models.TripHistory || model("TripHistory", TripHistorySchema);