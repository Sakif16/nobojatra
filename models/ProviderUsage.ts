import { Schema, model, models } from "mongoose";

/**
 * One counter per provider per UTC day: how many upstream calls the demo has
 * made. lib/provider-budget increments it before each call and refuses the
 * call once the day's allowance is spent.
 */
const ProviderUsageSchema = new Schema(
  {
    provider: {
      type: String,
      required: true,
    },
    // "2026-10-10", in UTC.
    day: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

ProviderUsageSchema.index({ provider: 1, day: 1 }, { unique: true });
// Counters are only read on their own day; a month is kept for looking back.
ProviderUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default models.ProviderUsage || model("ProviderUsage", ProviderUsageSchema);
