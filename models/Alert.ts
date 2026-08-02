import { Schema, model, models } from "mongoose";

const AlertSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "Map_route",
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
      required: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default models.Alert || model("Alert", AlertSchema);
