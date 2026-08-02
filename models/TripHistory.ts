import { Schema, model, models } from "mongoose";

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
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
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
