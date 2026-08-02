import { Schema, model, models } from "mongoose";

export const TRAVEL_PRIORITIES = ["time", "cost", "comfort"] as const;
export type TravelPriority = (typeof TRAVEL_PRIORITIES)[number];

const UserProfileSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    defaultTravelPriority: {
      type: String,
      enum: TRAVEL_PRIORITIES,
      default: "time",
      required: true,
    },
    defaultPassengerCount: {
      type: Number,
      min: 1,
      max: 8,
      default: 1,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default models.UserProfile || model("UserProfile", UserProfileSchema);
