import { Schema, model, models } from "mongoose";
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from "@/lib/country-config";

export const TRAVEL_PRIORITIES = ["time", "cost", "comfort"] as const;
export type TravelPriority = (typeof TRAVEL_PRIORITIES)[number];

// A saved shortcut location — "Home", "Work", or a custom label the user typed.
// The place is stored by value (not a reference) so it works exactly like any
// other geocoded PlaceResult on the client, with no extra lookup needed.
const SavedPlaceSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    place: {
      label: { type: String, required: true },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
  },
  { _id: false },
);

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
    // Drives the service area, the ride services offered and the currency
    // fares are shown in. Profiles written before this field existed have no
    // value; every read defaults them to BD via resolveCountry().
    country: {
      type: String,
      enum: COUNTRY_OPTIONS,
      default: DEFAULT_COUNTRY,
      required: true,
    },
    defaultPassengerCount: {
      type: Number,
      min: 1,
      max: 8,
      default: 1,
      required: true,
    },
    savedPlaces: {
      type: [SavedPlaceSchema],
      default: [],
      validate: {
        validator: (value: unknown[]) => value.length <= 10,
        message: "You can save up to 10 places.",
      },
    },
  },
  {
    timestamps: true,
  },
);

export default models.UserProfile || model("UserProfile", UserProfileSchema);