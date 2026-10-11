import { Schema, model, models } from "mongoose";

/**
 * One in-app notification.
 *
 * Two fields carry most of the design:
 *
 *   `snoozedUntil` — snoozing is a query concern, not a scheduled job. A
 *   notification is surfaced when it is unread AND not currently snoozed, so a
 *   snooze expiring re-surfaces it on the next read with nothing to
 *   re-schedule. See visibleAlertFilter() in lib/alerts.ts, which is the
 *   single definition of that rule.
 *
 *   `dedupeKey` — a retried request must not write the same notification
 *   twice. The unique index below makes the second write fail instead of
 *   duplicating.
 *
 * The model keeps the name Alert from when notifications were raised by
 * conditions on saved trips. Rows written then may still carry `savedTripId`,
 * `tripName`, `conditionId`, `conditionType`, `triggeredValue` and
 * `thresholdLabel`; those are not in this schema and nothing reads them.
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

export default models.Alert || model("Alert", AlertSchema);
