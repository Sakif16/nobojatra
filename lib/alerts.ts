// lib/alerts.ts
// The read/write layer for in-app notifications: the bell badge, the list, and
// the "Your plan is saved" notification written when a vehicle is chosen.
//
// The model and the /api/alerts routes keep the name "alert" from when
// notifications were raised by watching saved trips for weather, traffic and
// fare changes. That system is gone; what is left only tells the user about
// things they did.
//
// One rule lives here and nowhere else: visibleAlertFilter(). The unread badge
// and the notification list must agree on what "surfaced" means, so both call
// it.
import { COUNTRY_CONFIG, DEFAULT_COUNTRY } from "@/lib/country-config";
import "server-only";

import dbConnect from "@/lib/mongodb";
import Alert from "@/models/Alert";
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

export type AlertView = {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  readAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};

type StoredAlert = {
  _id: unknown;
  title: string;
  message: string;
  severity: AlertSeverity;
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

  const cursor = parseCursor(before);

  if (cursor) {
    // "Older than the last row of the previous page", where older means an
    // earlier time, or the same time and a smaller id. Kept under $and so it
    // sits beside the visibility rule's own $or rather than replacing it.
    filter.$and = [
      {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          ...(cursor.id ? [{ createdAt: cursor.createdAt, _id: { $lt: cursor.id } }] : []),
        ],
      },
    ];
  }

  // One extra row tells us whether another page exists without a second count.
  // The id breaks ties: several notifications can share a timestamp, and
  // without a second sort key their order is not fixed between two queries.
  const records = (await Alert.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize + 1)
    .lean()) as StoredAlert[];

  const hasMore = records.length > pageSize;
  const page = hasMore ? records.slice(0, pageSize) : records;
  const last = page[page.length - 1];

  return {
    alerts: page.map(serializeAlert),
    hasMore,
    nextCursor: hasMore && last ? formatCursor(last) : null,
    unreadCount: await Alert.countDocuments({ userId, ...visibleAlertFilter(now) }),
  };
}

/**
 * Where a page ended: the last row's time and id together.
 *
 * Time alone is not a position. With twenty-one notifications written in the
 * same millisecond, "created before this time" skips the twenty-first: the
 * first page takes twenty and nothing is strictly older than their shared
 * timestamp.
 */
function formatCursor(record: StoredAlert) {
  return `${toIso(record.createdAt)}_${String(record._id)}`;
}

function parseCursor(before: string | null | undefined) {
  if (!before) return null;

  const separator = before.lastIndexOf("_");
  const time = separator === -1 ? before : before.slice(0, separator);
  const id = separator === -1 ? "" : before.slice(separator + 1);
  const createdAt = new Date(time);

  if (Number.isNaN(createdAt.getTime())) return null;

  // A bare timestamp is still accepted, and behaves as it used to.
  return { createdAt, id: Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null };
}

/**
 * What the bell polls: how many notifications are showing and which is the
 * newest. The count alone cannot tell "nothing happened" from "one arrived
 * and another was dismissed in a different tab"; the newest id can.
 */
export async function getAlertDigest(userId: string, now: Date = new Date()) {
  await dbConnect();

  const filter = { userId, ...visibleAlertFilter(now) };
  const [unreadCount, newest] = await Promise.all([
    Alert.countDocuments(filter),
    Alert.findOne(filter).sort({ createdAt: -1, _id: -1 }).select("_id").lean() as Promise<{
      _id: unknown;
    } | null>,
  ]);

  return { unreadCount, latestId: newest ? String(newest._id) : null };
}

// ── Writes ─────────────────────────────────────────────────────────────────

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

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

function formatTripConfirmationMessage(input: CreateTripConfirmedAlertInput) {
  const fare =
    typeof input.fareLow === "number" && typeof input.fareHigh === "number"
      ? ` Estimated fare: ${input.fareLow}-${input.fareHigh} ${input.currency ?? COUNTRY_CONFIG[DEFAULT_COUNTRY].currency}.`
      : "";

  return `${input.vehicleLabel} saved for ${input.originLabel} to ${input.destinationLabel}.${fare} This is not a booking.`;
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
          title: "Your plan is saved",
          message: formatTripConfirmationMessage(input),
          severity: "info",
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
