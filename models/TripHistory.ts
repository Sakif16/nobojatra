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
