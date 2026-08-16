import { Schema, model, models } from "mongoose";
import { ALERT_CONDITION_TYPES } from "@/models/SavedTrip";

/**
 * One fired notification.
 *
 * Two fields carry most of the design:
 *
 *   `snoozedUntil` — snoozing is a query concern, not a scheduled job. An alert
 *   is surfaced when it is unread AND not currently snoozed, so a snooze
 *   expiring re-surfaces it on the next read with nothing to re-schedule. See
 *   visibleAlertFilter() in lib/alerts.ts, which is the single definition of
 *   that rule.
 *
 *   `dedupeKey` — the evaluator fires on a condition's false→true transition,
 *   but two overlapping evaluation runs could still race to write the same
 *   alert. The unique index below makes the second write fail instead of
 *   duplicating, so createAlert() can treat it as "already reported".
 *
 * `tripName` is denormalized from SavedTrip so the notification list renders
 * from one query, and so an alert still reads correctly if the trip is renamed.
 */
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
    savedTripId: {
      type: Schema.Types.ObjectId,
      ref: "SavedTrip",
      default: null,
    },
    /** Snapshot of SavedTrip.name as it read when the alert fired. */
    tripName: {
      type: String,
      default: null,
    },
    /** The `_id` of the condition subdocument that fired. */
    conditionId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    conditionType: {
      type: String,
      enum: ALERT_CONDITION_TYPES,
      default: null,
    },
    /** The measured value that crossed the threshold. */
    triggeredValue: {
      type: Number,
      default: null,
    },
    /** Human-readable threshold, e.g. "above 60" or "±15%". */
    thresholdLabel: {
      type: String,
      default: null,
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
    snoozedUntil: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Serves both the unread badge count and the notification list, which share
// the same filter and differ only in whether they sort and page.
AlertSchema.index({ userId: 1, readAt: 1, snoozedUntil: 1, createdAt: -1 });

// A partial filter rather than `sparse`: a compound sparse index still indexes
// a document that has userId but no dedupeKey, so every alert without one
// would collide on null. Restricting the index to string dedupeKeys leaves
// legacy and manually-created alerts out of it entirely.
AlertSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

// Deleting a saved trip removes its alerts with it.
AlertSchema.index({ savedTripId: 1 });

export default models.Alert || model("Alert", AlertSchema);
