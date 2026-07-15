import mongoose, { Schema, model, models } from "mongoose";

const PointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: { type: String },
  },
  { _id: false }
);

const SegmentSchema = new Schema(
  {
    startIndex: { type: Number, required: true },
    endIndex: { type: Number, required: true },
    color: { type: String, required: true },
    distanceKm: { type: Number, required: true },
  },
  { _id: false }
);

const RouteSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    origin: {
      type: PointSchema,
      required: true,
    },
    destination: {
      type: PointSchema,
      required: true,
    },
    stops: {
      type: [PointSchema],
      default: [],
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
    polyline: {
      type: String,
      required: true,
    },
    segments: {
      type: [SegmentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default models.Map_route || model("Map_route", RouteSchema);