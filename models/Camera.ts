import mongoose, { Schema, model, models } from "mongoose";

const CameraSchema = new Schema(
  {
    location: {
      type: String,
      required: true,
    },
    cameraName: {
      type: String,
      required: true,
    },
    streamUrl: {
      type: String,
      required: true,
    },
    available: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default models.Camera || model("Camera", CameraSchema);