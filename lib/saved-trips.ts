// lib/saved-trips.ts
// Service layer for named, user-curated trips. Routes stay thin: they
// authenticate, validate the request body with validateTripInput(), and hand a
// ValidatedTripInput to this module.
//
// A saved trip is a bookmark for the planner — a name, the places and the
// party size. Saving one makes no provider call; the route and fares are
// worked out when the trip is planned.
import "server-only";

import {
  getCountryConfig,
  getTripTimeZone,
  resolveCountry,
  type CountryCode,
} from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import {
  DEFAULT_STOP_DWELL_MINUTES,
  type TripLocation,
  type TripStop,
  type ValidatedTripInput,
} from "@/lib/trip-input";
import SavedTrip from "@/models/SavedTrip";
import { Types } from "mongoose";

/**
 * Per-country cap, so the list stays something a person can scan.
 *
 * Counted per country rather than per account because the list is scoped that
 * way: a global cap would let someone with a full Dhaka list be refused a
 * London trip while the London screen sat empty, with no visible cause.
 */
export const MAX_SAVED_TRIPS = 20;

/** Kept in step with the `maxlength` on SavedTrip.name. */
export const MAX_TRIP_NAME_LENGTH = 60;

/**
 * Lets API routes map any failure from this module to a status and a
 * user-safe message with one `instanceof` check.
 */
export class SavedTripError extends Error {
  statusCode: number;
  userMessage: string;

  constructor(message: string, statusCode: number, userMessage: string) {
    super(message);
    this.name = "SavedTripError";
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

// ── Serialized shape (crosses the server/client boundary) ──────────────────

export type SavedTripDetail = {
  id: string;
  name: string;
  /** Country the trip was saved in, and the only one it can be planned in. */
  country: CountryCode;
  origin: TripLocation;
  destination: TripLocation;
  stops: TripStop[];
  passengerCount: number;
  /** The IANA zone at the origin. */
  timeZone: string;
  createdAt: string;
  updatedAt: string;
};

type StoredLocation = { label: string; lat: number; lng: number; dwellMinutes?: number };

type StoredSavedTrip = {
  _id: unknown;
  name: string;
  country?: unknown;
  origin: StoredLocation;
  destination: StoredLocation;
  stops?: StoredLocation[];
  passengerCount?: number;
  timeZone?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

function toLocation(location: StoredLocation): TripLocation {
  return { label: location.label, lat: location.lat, lng: location.lng };
}

function toStop(location: StoredLocation): TripStop {
  return {
    ...toLocation(location),
    dwellMinutes: location.dwellMinutes ?? DEFAULT_STOP_DWELL_MINUTES,
  };
}

function toIso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : new Date(0).toISOString();
}

export function serializeSavedTrip(record: StoredSavedTrip): SavedTripDetail {
  const country = resolveCountry(record.country);

  return {
    id: String(record._id),
    name: record.name,
    country,
    origin: toLocation(record.origin),
    destination: toLocation(record.destination),
    stops: Array.isArray(record.stops) ? record.stops.map(toStop) : [],
    passengerCount: record.passengerCount ?? 1,
    timeZone: getTripTimeZone(record.timeZone, country),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * The user's saved trips in one country, newest first.
 *
 * Scoped like the planner itself: a saved trip carries the country it was
 * created in, and showing a Dhaka trip to someone planning in London means
 * offering a trip they cannot currently plan.
 *
 * The country match happens in JS, not in the query, so trips written before
 * the field existed still count as BD — the same rule resolveCountry applies
 * everywhere else. The cap keeps the result set small enough for this to be
 * cheaper than a second index.
 */
export async function listSavedTrips(
  userId: string,
  country: CountryCode,
): Promise<SavedTripDetail[]> {
  await dbConnect();

  const records = (await SavedTrip.find({ userId })
    .sort({ createdAt: -1 })
    .lean()) as StoredSavedTrip[];

  return records
    .filter((record) => resolveCountry(record.country) === country)
    .map((record) => serializeSavedTrip(record));
}

/** Saved trips the user already has in one country, for the cap check. */
async function countSavedTripsInCountry(userId: string, country: CountryCode) {
  const records = (await SavedTrip.find({ userId })
    .select("country")
    .lean()) as { country?: unknown }[];

  return records.filter((record) => resolveCountry(record.country) === country).length;
}

/**
 * Whether `savedTripId` falls outside the country's limit once every trip in
 * it is ranked oldest first.
 */
async function isOverCap(userId: string, country: CountryCode, savedTripId: unknown) {
  const records = (await SavedTrip.find({ userId })
    .select("country")
    .sort({ _id: 1 })
    .lean()) as { _id: unknown; country?: unknown }[];
  const position = records
    .filter((record) => resolveCountry(record.country) === country)
    .findIndex((record) => String(record._id) === String(savedTripId));

  return position >= MAX_SAVED_TRIPS;
}

export async function getSavedTrip(
  userId: string,
  savedTripId: string,
): Promise<SavedTripDetail | null> {
  if (!Types.ObjectId.isValid(savedTripId)) return null;

  await dbConnect();

  const record = (await SavedTrip.findOne({
    _id: savedTripId,
    userId,
  }).lean()) as StoredSavedTrip | null;

  return record ? serializeSavedTrip(record) : null;
}

// ── Writes ─────────────────────────────────────────────────────────────────

/** Mongo's duplicate-key error, raised by the unique name index. */
function isDuplicateNameError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

function capReached(userId: string, country: CountryCode) {
  return new SavedTripError(
    `User ${userId} is at the saved-trip cap for ${country}`,
    409,
    `You can save up to ${MAX_SAVED_TRIPS} trips in ${getCountryConfig(country).serviceAreaName}. Delete one to add another.`,
  );
}

function changedElsewhere(savedTripId: string) {
  return new SavedTripError(
    `Saved trip ${savedTripId} changed since it was read`,
    409,
    "This trip was changed elsewhere. Reload and try again.",
  );
}

/** Mongoose's error for a save that lost an optimistic-concurrency check. */
function isVersionError(error: unknown) {
  return error instanceof Error && error.name === "VersionError";
}

function duplicateName(userId: string) {
  return new SavedTripError(
    `Duplicate saved-trip name for user ${userId}`,
    409,
    "You already have a saved trip with that name in this country.",
  );
}

export async function createSavedTrip({
  userId,
  name,
  trip,
  country,
}: {
  userId: string;
  name: string;
  trip: ValidatedTripInput;
  country: CountryCode;
}): Promise<SavedTripDetail> {
  await dbConnect();

  const existingCount = await countSavedTripsInCountry(userId, country);

  if (existingCount >= MAX_SAVED_TRIPS) throw capReached(userId, country);

  try {
    const record = await SavedTrip.create({
      userId,
      name,
      country,
      origin: trip.origin,
      destination: trip.destination,
      stops: trip.stops,
      passengerCount: trip.passengerCount,
      timeZone: trip.timeZone,
    });

    // The count above and this insert are two steps, so two saves at the same
    // moment can both pass the check at nineteen and leave twenty-one. Looking
    // again after the insert closes that: the trips are ranked in creation
    // order, and one that falls outside the limit is taken back out. Ranking
    // rather than counting means exactly one of two racing saves is kept.
    if (await isOverCap(userId, country, record._id)) {
      await SavedTrip.deleteOne({ _id: record._id, userId });
      throw capReached(userId, country);
    }

    return serializeSavedTrip(record.toObject() as StoredSavedTrip);
  } catch (error) {
    if (isDuplicateNameError(error)) throw duplicateName(userId);
    throw error;
  }
}

export type SavedTripPatch = {
  name?: string;
  /** Present only when the places or the party size actually changed. */
  trip?: ValidatedTripInput;
  /**
   * The `updatedAt` the caller last saw. When given, the edit is refused if
   * the trip has changed since — an edit made from a stale copy would
   * otherwise undo whatever happened in between.
   */
  expectedUpdatedAt?: string;
};

export async function updateSavedTrip({
  userId,
  savedTripId,
  patch,
}: {
  userId: string;
  savedTripId: string;
  patch: SavedTripPatch;
}): Promise<SavedTripDetail | null> {
  if (!Types.ObjectId.isValid(savedTripId)) return null;

  await dbConnect();

  const record = await SavedTrip.findOne({ _id: savedTripId, userId });

  if (!record) return null;

  if (
    patch.expectedUpdatedAt !== undefined &&
    new Date(record.updatedAt).getTime() !== new Date(patch.expectedUpdatedAt).getTime()
  ) {
    throw changedElsewhere(savedTripId);
  }

  if (patch.name !== undefined) record.name = patch.name;

  if (patch.trip) {
    record.origin = patch.trip.origin;
    record.destination = patch.trip.destination;
    record.stops = patch.trip.stops;
    record.passengerCount = patch.trip.passengerCount;
    record.timeZone = patch.trip.timeZone;
  }

  try {
    await record.save();
  } catch (error) {
    if (isDuplicateNameError(error)) throw duplicateName(userId);
    // Another edit was saved between this one's read and its write.
    if (isVersionError(error)) throw changedElsewhere(savedTripId);
    throw error;
  }

  return serializeSavedTrip(record.toObject() as StoredSavedTrip);
}

export async function deleteSavedTrip(userId: string, savedTripId: string) {
  if (!Types.ObjectId.isValid(savedTripId)) return false;

  await dbConnect();

  const result = await SavedTrip.deleteOne({ _id: savedTripId, userId });

  return result.deletedCount > 0;
}
