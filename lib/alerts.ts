// lib/alerts.ts
// The read/write layer for fired notifications. The API routes in phase 4 are
// thin wrappers over this; the evaluator in phase 3 writes through createAlert.
//
// One rule lives here and nowhere else: visibleAlertFilter(). The unread badge,
// the notification list, and the evaluator's "is this already showing?" check
// must all agree on what "surfaced" means, so they all call it.
import { COUNTRY_CONFIG, DEFAULT_COUNTRY } from "@/lib/country-config";
import "server-only";

import dbConnect from "@/lib/mongodb";
import Alert from "@/models/Alert";
import type { AlertConditionType } from "@/models/SavedTrip";
import { Types } from "mongoose";

/** Snooze duration offered by the notification center. */
export const SNOOZE_DURATION_MS = 60 * 60 * 1000;

export const DEFAULT_ALERT_PAGE_SIZE = 20;
export const MAX_ALERT_PAGE_SIZE = 50;

export type AlertSeverity = "info" | "warning" | "critical";

/**
 * An alert is surfaced when it has not been dismissed and is not currently
 * snoozed. Because the snooze is a timestamp compared at read time, an expired
 * snooze re-surfaces the alert on the very next query — there is nothing to
 * re-schedule and no job to run.
 */
export function visibleAlertFilter(now: Date = new Date()) {
  return {
    readAt: null,
    $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: now } }],
  };
}

/**
 * At most one alert per condition per hour.
 *
 * The evaluator already fires only on a false→true transition, so this is the
 * second line of defence: it collapses a condition that flaps across the
 * threshold repeatedly within an hour, and makes concurrent evaluation runs
 * idempotent via the unique { userId, dedupeKey } index.
 */
export function buildDedupeKey(conditionId: string, at: Date = new Date()) {
  const hourBucket = Math.floor(at.getTime() / (60 * 60 * 1000));
  return `${conditionId}:${hourBucket}`;
}

export type AlertView = {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  savedTripId: string | null;
  tripName: string | null;
  conditionId: string | null;
  conditionType: AlertConditionType | null;
  triggeredValue: number | null;
  thresholdLabel: string | null;
  readAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};

type StoredAlert = {
  _id: unknown;
  title: string;
  message: string;
  severity: AlertSeverity;
  savedTripId?: unknown;
  tripName?: string | null;
  conditionId?: unknown;
  conditionType?: AlertConditionType | null;
  triggeredValue?: number | null;
  thresholdLabel?: string | null;
  readAt?: Date | null;
  snoozedUntil?: Date | null;
  createdAt?: Date;
};

function toIso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export function serializeAlert(record: StoredAlert): AlertView {
  return {
    id: String(record._id),
    title: record.title,
    message: record.message,
    severity: record.severity,
    savedTripId: record.savedTripId ? String(record.savedTripId) : null,
    tripName: record.tripName ?? null,
    conditionId: record.conditionId ? String(record.conditionId) : null,
    conditionType: record.conditionType ?? null,
    triggeredValue: record.triggeredValue ?? null,
    thresholdLabel: record.thresholdLabel ?? null,
    readAt: toIso(record.readAt),
    snoozedUntil: toIso(record.snoozedUntil),
    createdAt: toIso(record.createdAt) ?? new Date(0).toISOString(),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** The badge number. Counts only what the list would actually show. */
export async function countVisibleAlerts(userId: string, now: Date = new Date()) {
  await dbConnect();

  return Alert.countDocuments({ userId, ...visibleAlertFilter(now) });
}

export type ListAlertsOptions = {
  limit?: number;
  /** Cursor: return alerts created strictly before this instant. */
  before?: string | null;
  /** Include dismissed and still-snoozed alerts (a history view). */
  includeHidden?: boolean;
};

export async function listAlerts(
  userId: string,
  { limit, before, includeHidden = false }: ListAlertsOptions = {},
) {
  await dbConnect();

  const now = new Date();
  const pageSize = Math.min(
    Math.max(Number(limit) || DEFAULT_ALERT_PAGE_SIZE, 1),
    MAX_ALERT_PAGE_SIZE,
  );

  const filter: Record<string, unknown> = { userId };

  if (!includeHidden) {
    Object.assign(filter, visibleAlertFilter(now));
  }

  if (before) {
    const cursor = new Date(before);
    if (!Number.isNaN(cursor.getTime())) {
      filter.createdAt = { $lt: cursor };
    }
  }

  // One extra row tells us whether another page exists without a second count.
  const records = (await Alert.find(filter)
    .sort({ createdAt: -1 })
    .limit(pageSize + 1)
    .lean()) as StoredAlert[];

  const hasMore = records.length > pageSize;
  const page = hasMore ? records.slice(0, pageSize) : records;

  return {
    alerts: page.map(serializeAlert),
    hasMore,
    nextCursor: hasMore ? toIso(page[page.length - 1]?.createdAt) : null,
    unreadCount: await Alert.countDocuments({ userId, ...visibleAlertFilter(now) }),
  };
}

// ── Writes ─────────────────────────────────────────────────────────────────

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

export type CreateAlertInput = {
  userId: string;
  savedTripId: string;
  tripName: string;
  conditionId: string;
  conditionType: AlertConditionType;
  title: string;
  message: string;
  severity?: AlertSeverity;
  triggeredValue?: number | null;
  thresholdLabel?: string | null;
  /** Defaults to buildDedupeKey(conditionId). */
  dedupeKey?: string;
};

export type CreateTripConfirmedAlertInput = {
  userId: string;
  tripHistoryId: string;
  originLabel: string;
  destinationLabel: string;
  vehicleLabel: string;
  fareLow?: number | null;
  fareHigh?: number | null;
  currency?: string | null;
};

/**
 * Writes one alert, or returns null when an alert with the same dedupeKey
 * already exists for this user. Callers treat null as "already reported"
 * rather than as a failure.
 *
 * This is an upsert rather than an insert-and-catch-11000 on purpose.
 * Mongoose's autoIndex builds indexes in the background and does not block
 * writes, so on a cold collection the unique { userId, dedupeKey } index may
 * not exist yet at the moment of the first write — and correctness here must
 * not depend on that timing. The upsert dedupes on its own; the unique index
 * remains as the guard for genuinely concurrent writers, which the catch
 * below absorbs.
 */
export async function createAlert(input: CreateAlertInput): Promise<AlertView | null> {
  await dbConnect();

  const dedupeKey = input.dedupeKey ?? buildDedupeKey(input.conditionId);

  try {
    // userId and dedupeKey are omitted from $setOnInsert deliberately: the
    // filter's equality terms already seed them on insert.
    const result = await Alert.findOneAndUpdate(
      { userId: input.userId, dedupeKey },
      {
        $setOnInsert: {
          savedTripId: input.savedTripId,
          tripName: input.tripName,
          conditionId: input.conditionId,
          conditionType: input.conditionType,
          title: input.title,
          message: input.message,
          severity: input.severity ?? "info",
          triggeredValue: input.triggeredValue ?? null,
          thresholdLabel: input.thresholdLabel ?? null,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true },
    );

    if (result.lastErrorObject?.updatedExisting) return null;

    return serializeAlert(result.value as StoredAlert);
  } catch (error) {
    // Lost a race to a concurrent writer — the alert exists, which is the
    // outcome we wanted.
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

function formatTripConfirmationMessage(input: CreateTripConfirmedAlertInput) {
  const fare =
    typeof input.fareLow === "number" && typeof input.fareHigh === "number"
      ? ` Estimated fare: ${input.fareLow}-${input.fareHigh} ${input.currency ?? COUNTRY_CONFIG[DEFAULT_COUNTRY].currency}.`
      : "";

  return `${input.vehicleLabel} is confirmed for ${input.originLabel} to ${input.destinationLabel}.${fare}`;
}

/**
 * Writes the in-app confirmation notification shown after a user picks a vehicle.
 *
 * The dedupe key is stable per TripHistory row so retrying the select request,
 * or re-confirming from an old tab, does not create repeat notifications.
 */
export async function createTripConfirmedAlert(
  input: CreateTripConfirmedAlertInput,
): Promise<AlertView | null> {
  await dbConnect();

  const dedupeKey = `trip-confirmed:${input.tripHistoryId}`;

  try {
    const result = await Alert.findOneAndUpdate(
      { userId: input.userId, dedupeKey },
      {
        $setOnInsert: {
          title: "Your trip has been confirmed",
          message: formatTripConfirmationMessage(input),
          severity: "info",
          savedTripId: null,
          tripName: null,
          conditionId: null,
          conditionType: null,
          triggeredValue: null,
          thresholdLabel: null,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true },
    );

    if (result.lastErrorObject?.updatedExisting) return null;

    return serializeAlert(result.value as StoredAlert);
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

/**
 * Applies `update` to an unread alert.
 *
 * Returns the alert either way when it exists — dismissing an already-dismissed
 * alert, or snoozing one that was dismissed in another tab, is a no-op rather
 * than an error, because the client that raced is not wrong, just late.
 */
async function updateUnreadAlert(
  userId: string,
  alertId: string,
  update: Record<string, unknown>,
): Promise<AlertView | null> {
  if (!Types.ObjectId.isValid(alertId)) return null;

  await dbConnect();

  const updated = await Alert.findOneAndUpdate(
    { _id: alertId, userId, readAt: null },
    { $set: update },
    { returnDocument: "after" },
  ).lean();

  if (updated) return serializeAlert(updated as StoredAlert);

  // Either it does not exist, or it was already read. Only the second case
  // costs an extra query, and only on a redundant click.
  const existing = (await Alert.findOne({
    _id: alertId,
    userId,
  }).lean()) as StoredAlert | null;

  return existing ? serializeAlert(existing) : null;
}

export function markAlertRead(userId: string, alertId: string) {
  return updateUnreadAlert(userId, alertId, { readAt: new Date() });
}

export function snoozeAlert(
  userId: string,
  alertId: string,
  durationMs: number = SNOOZE_DURATION_MS,
) {
  return updateUnreadAlert(userId, alertId, {
    snoozedUntil: new Date(Date.now() + durationMs),
  });
}

/** Dismisses everything currently surfaced. Snoozed alerts are left alone. */
export async function markAllAlertsRead(userId: string) {
  await dbConnect();

  const now = new Date();
  const result = await Alert.updateMany(
    { userId, ...visibleAlertFilter(now) },
    { $set: { readAt: now } },
  );

  return result.modifiedCount;
}

/**
 * Removes a trip's alerts when the trip itself is deleted. An alert whose trip
 * is gone is no longer actionable, and leaving it would accumulate dead rows in
 * the notification center. Drop this call if alert history should outlive the
 * trip it describes.
 */
export async function deleteAlertsForSavedTrip(userId: string, savedTripId: string) {
  if (!Types.ObjectId.isValid(savedTripId)) return 0;

  await dbConnect();

  const result = await Alert.deleteMany({ userId, savedTripId });

  return result.deletedCount;
}
