import mongoose, { Schema, model, models } from "mongoose";

const TrafficDataSchema = new Schema(
  {
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "Map_route",
      required: true,
    },
    currentDurationMin: {
      type: Number,
      required: true,
    },
    freeFlowDurationMin: {
      type: Number,
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default models.TrafficData || model("TrafficData", TrafficDataSchema);