import mongoose, { Schema, model, models } from "mongoose";

const PlaceSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default models.Place || model("Place", PlaceSchema);