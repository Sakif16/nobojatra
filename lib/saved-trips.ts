// lib/saved-trips.ts
// Service layer for named, user-curated trips — the thing alert conditions
// hang off. Routes stay thin: they authenticate, validate the request body
// with validateTripInput(), and hand a ValidatedTripInput to this module.
//
// Everything that talks to a provider lives here, because creating a saved
// trip is not a plain insert: the route has to be resolved through ORS and the
// fare baseline captured, and both of those can fail in ways the caller needs
// to report precisely.
import "server-only";

import {
  MAX_FARE_CHANGE_PERCENT,
  MIN_FARE_CHANGE_PERCENT,
  WEATHER_SEVERITY_MAX,
  WEATHER_SEVERITY_MIN,
} from "@/lib/alert-evaluator/evaluators";
import { deleteAlertsForSavedTrip } from "@/lib/alerts";
import {
  getCountryConfig,
  resolveCountry,
  type CountryCode,
} from "@/lib/country-config";
import { estimateFaresForRates, type FareSource } from "@/lib/fare-providers";
import dbConnect from "@/lib/mongodb";
import { fetchRouteSuggestions, RouteServiceError } from "@/lib/route-service";
import type { RouteResult } from "@/lib/routing";
import type { DepartureMode, TripLocation, ValidatedTripInput } from "@/lib/trip-input";
import SavedTrip, {
  MAX_CONDITIONS_PER_TRIP,
  TRAFFIC_LEVELS,
  type AlertConditionType,
  type TrafficLevel,
} from "@/models/SavedTrip";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";

/**
 * Per-country cap. Every saved trip costs provider calls on each evaluation.
 *
 * Counted per country rather than per account because the list is scoped that
 * way: a global cap would let someone with a full Dhaka list be refused a
 * London trip while the London screen sat empty, with no visible cause.
 */
export const MAX_SAVED_TRIPS = 20;

/** Kept in step with the `maxlength` on SavedTrip.name. */
export const MAX_TRIP_NAME_LENGTH = 60;

/**
 * Mirrors RouteServiceError so API routes can map any failure from this module
 * to a status and a user-safe message with one `instanceof` check.
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

type VehicleRateDocument = {
  _id: Types.ObjectId;
  provider: string;
  vehicleType: string;
  displayName: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  maxPassengers: number;
};

// ── Serialized shapes (these cross the server/client boundary) ─────────────

export type SavedTripCondition = {
  id: string;
  type: AlertConditionType;
  threshold: number | null;
  level: TrafficLevel | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
};

export type SavedTripRouteSummary = {
  routeId: string;
  distanceKm: number;
  durationMin: number;
  resolvedAt: string;
  /** Only populated when the caller asked for the full detail view. */
  coords?: [number, number][];
};

export type SavedTripDetail = {
  id: string;
  name: string;
  /** Country the trip was saved in — decides the currency the baseline renders in. */
  country: CountryCode;
  origin: TripLocation;
  destination: TripLocation;
  stops: TripLocation[];
  passengerCount: number;
  departureMode: DepartureMode;
  scheduledAt: string | null;
  preferredVehicle: {
    vehicleRateId: string;
    provider: string;
    vehicleType: string;
    displayName: string;
  } | null;
  route: SavedTripRouteSummary | null;
  baseline: {
    fareLow: number;
    fareHigh: number;
    durationMin: number;
    fareSource: FareSource;
    capturedAt: string;
  } | null;
  conditions: SavedTripCondition[];
  isActive: boolean;
  lastEvaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredLocation = { label: string; lat: number; lng: number };

type StoredSavedTrip = {
  country?: unknown;
  _id: unknown;
  name: string;
  origin: StoredLocation;
  destination: StoredLocation;
  stops?: StoredLocation[];
  passengerCount?: number;
  departureMode?: string;
  scheduledAt?: Date | null;
  preferredVehicle?: {
    vehicleRateId: unknown;
    provider: string;
    vehicleType: string;
    displayName: string;
  } | null;
  route?: {
    routeId: string;
    distanceKm: number;
    durationMin: number;
    coords?: [number, number][];
    resolvedAt?: Date;
  } | null;
  baseline?: {
    fareLow: number;
    fareHigh: number;
    durationMin: number;
    fareSource: FareSource;
    capturedAt?: Date;
  } | null;
  conditions?: {
    _id: unknown;
    type: AlertConditionType;
    threshold?: number | null;
    level?: TrafficLevel | null;
    isActive?: boolean;
    lastTriggeredAt?: Date | null;
  }[];
  isActive?: boolean;
  lastEvaluatedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function toLocation(location: StoredLocation): TripLocation {
  return { label: location.label, lat: location.lat, lng: location.lng };
}

function toIso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

/**
 * `withCoords` is off by default: a route polyline is hundreds of coordinate
 * pairs, which is wasted bytes on a list of twenty trips but exactly what the
 * detail view needs to draw a map.
 */
export function serializeSavedTrip(
  record: StoredSavedTrip,
  { withCoords = false }: { withCoords?: boolean } = {},
): SavedTripDetail {
  return {
    id: String(record._id),
    name: record.name,
    country: resolveCountry(record.country),
    origin: toLocation(record.origin),
    destination: toLocation(record.destination),
    stops: Array.isArray(record.stops) ? record.stops.map(toLocation) : [],
    passengerCount: record.passengerCount ?? 1,
    departureMode: record.departureMode === "scheduled" ? "scheduled" : "now",
    scheduledAt: toIso(record.scheduledAt),
    preferredVehicle: record.preferredVehicle
      ? {
          vehicleRateId: String(record.preferredVehicle.vehicleRateId),
          provider: record.preferredVehicle.provider,
          vehicleType: record.preferredVehicle.vehicleType,
          displayName: record.preferredVehicle.displayName,
        }
      : null,
    route: record.route
      ? {
          routeId: record.route.routeId,
          distanceKm: record.route.distanceKm,
          durationMin: record.route.durationMin,
          resolvedAt: toIso(record.route.resolvedAt) ?? new Date(0).toISOString(),
          ...(withCoords ? { coords: record.route.coords ?? [] } : {}),
        }
      : null,
    baseline: record.baseline
      ? {
          fareLow: record.baseline.fareLow,
          fareHigh: record.baseline.fareHigh,
          durationMin: record.baseline.durationMin,
          fareSource: record.baseline.fareSource,
          capturedAt: toIso(record.baseline.capturedAt) ?? new Date(0).toISOString(),
        }
      : null,
    conditions: Array.isArray(record.conditions)
      ? record.conditions.map((condition) => ({
          id: String(condition._id),
          type: condition.type,
          threshold: condition.threshold ?? null,
          level: condition.level ?? null,
          isActive: condition.isActive ?? true,
          lastTriggeredAt: toIso(condition.lastTriggeredAt),
        }))
      : [],
    isActive: record.isActive ?? true,
    lastEvaluatedAt: toIso(record.lastEvaluatedAt),
    createdAt: toIso(record.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(record.updatedAt) ?? new Date(0).toISOString(),
  };
}

// ── Provider work ──────────────────────────────────────────────────────────

async function loadPreferredRate(
  vehicleRateId: string | null | undefined,
  passengerCount: number,
): Promise<VehicleRateDocument | null> {
  if (!vehicleRateId) return null;

  if (!Types.ObjectId.isValid(vehicleRateId)) {
    throw new SavedTripError(
      `Invalid vehicleRateId: ${vehicleRateId}`,
      400,
      "That vehicle selection is not valid.",
    );
  }

  await dbConnect();

  const rate = (await VehicleRate.findOne({
    _id: vehicleRateId,
    isActive: true,
  }).lean()) as VehicleRateDocument | null;

  if (!rate) {
    throw new SavedTripError(
      `VehicleRate ${vehicleRateId} not found or inactive`,
      404,
      "That vehicle is no longer available.",
    );
  }

  if (passengerCount > rate.maxPassengers) {
    throw new SavedTripError(
      `passengerCount ${passengerCount} exceeds ${rate.displayName} capacity`,
      400,
      `${rate.displayName} seats up to ${rate.maxPassengers} passengers.`,
    );
  }

  return rate;
}

function serializeRoute(route: RouteResult) {
  return {
    routeId: route.id,
    distanceKm: route.distanceKm,
    travelDurationMin: route.travelDurationMin ?? route.durationMin,
    dwellDurationMin: route.dwellDurationMin ?? 0,
    durationMin: route.durationMin,
    coords: route.coords,
    legs: route.legs,
    resolvedAt: new Date(),
  };
}

/**
 * Prices one rate against fixed trip metrics.
 *
 * Deliberately passes the raw route distance and duration, with no speedFactor
 * applied — that is exactly what /api/fares does, and a baseline computed any
 * other way would be compared against a number the user was never shown.
 */
async function captureBaseline(
  rate: VehicleRateDocument,
  metrics: { distanceKm: number; durationMin: number },
) {
  const [estimate] = await estimateFaresForRates(
    [
      {
        provider: rate.provider,
        vehicleType: rate.vehicleType,
        baseFare: rate.baseFare,
        perKmRate: rate.perKmRate,
        perMinRate: rate.perMinRate,
        minimumFare: rate.minimumFare,
      },
    ],
    metrics,
  );

  return {
    fareLow: estimate.fare.low,
    fareHigh: estimate.fare.high,
    durationMin: metrics.durationMin,
    fareSource: estimate.fareSource,
    capturedAt: new Date(),
  };
}

async function resolveRoute(trip: {
  origin: TripLocation;
  destination: TripLocation;
  stops: TripLocation[];
}) {
  let routes: RouteResult[];

  try {
    routes = await fetchRouteSuggestions(trip.origin, trip.destination, trip.stops);
  } catch (error) {
    // Re-wrap so callers only have to know about SavedTripError.
    if (error instanceof RouteServiceError) {
      throw new SavedTripError(error.message, error.statusCode, error.userMessage);
    }
    throw error;
  }

  const best = routes[0];

  if (!best) {
    throw new SavedTripError(
      "Route service returned no routes",
      502,
      "No route could be found between those places.",
    );
  }

  return best;
}

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * The user's saved trips in one country.
 *
 * Scoped like the planner itself: a saved trip carries the country it was
 * created in, and showing a Dhaka trip to someone planning in London means
 * offering an alert on a route they cannot currently plan.
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
    .select("-route.coords -route.legs")
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

  return record ? serializeSavedTrip(record, { withCoords: true }) : null;
}

// ── Writes ─────────────────────────────────────────────────────────────────

/** Mongo's duplicate-key error, raised by the unique { userId, name } index. */
function isDuplicateNameError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function createSavedTrip({
  userId,
  name,
  trip,
  preferredVehicleRateId,
  country,
}: {
  userId: string;
  name: string;
  trip: ValidatedTripInput;
  preferredVehicleRateId?: string | null;
  country: CountryCode;
}): Promise<SavedTripDetail> {
  await dbConnect();

  const existingCount = await countSavedTripsInCountry(userId, country);

  if (existingCount >= MAX_SAVED_TRIPS) {
    throw new SavedTripError(
      `User ${userId} is at the saved-trip cap for ${country}`,
      409,
      `You can save up to ${MAX_SAVED_TRIPS} trips in ${getCountryConfig(country).serviceAreaName}. Delete one to add another.`,
    );
  }

  const rate = await loadPreferredRate(preferredVehicleRateId, trip.passengerCount);

  // Provider work happens before the insert so a routing failure leaves nothing
  // half-written — a saved trip with no route could never be evaluated.
  const route = await resolveRoute(trip);
  const baseline = rate
    ? await captureBaseline(rate, {
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
      })
    : null;

  try {
    const record = await SavedTrip.create({
      userId,
      name,
      country,
      origin: trip.origin,
      destination: trip.destination,
      stops: trip.stops,
      passengerCount: trip.passengerCount,
      departureMode: trip.departureMode,
      scheduledAt: trip.scheduledAt ? new Date(trip.scheduledAt) : null,
      preferredVehicle: rate
        ? {
            vehicleRateId: rate._id,
            provider: rate.provider,
            vehicleType: rate.vehicleType,
            displayName: rate.displayName,
          }
        : null,
      route: serializeRoute(route),
      baseline,
      conditions: [],
    });

    return serializeSavedTrip(record.toObject() as StoredSavedTrip, {
      withCoords: true,
    });
  } catch (error) {
    if (isDuplicateNameError(error)) {
      throw new SavedTripError(
        `Duplicate saved-trip name for user ${userId}`,
        409,
        "You already have a saved trip with that name in this country.",
      );
    }
    throw error;
  }
}

export type SavedTripPatch = {
  name?: string;
  isActive?: boolean;
  /** `null` clears the preferred vehicle (and the fare baseline with it). */
  preferredVehicleRateId?: string | null;
  /** Present only when waypoints, passengers, or departure actually changed. */
  trip?: ValidatedTripInput;
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

  if (patch.name !== undefined) record.name = patch.name;
  if (patch.isActive !== undefined) record.isActive = patch.isActive;

  if (patch.trip) {
    record.origin = patch.trip.origin;
    record.destination = patch.trip.destination;
    record.stops = patch.trip.stops;
    record.passengerCount = patch.trip.passengerCount;
    record.departureMode = patch.trip.departureMode;
    record.scheduledAt = patch.trip.scheduledAt
      ? new Date(patch.trip.scheduledAt)
      : null;
  }

  const vehicleChanged = patch.preferredVehicleRateId !== undefined;

  if (vehicleChanged) {
    const rate = await loadPreferredRate(
      patch.preferredVehicleRateId,
      record.passengerCount,
    );

    record.preferredVehicle = rate
      ? {
          vehicleRateId: rate._id,
          provider: rate.provider,
          vehicleType: rate.vehicleType,
          displayName: rate.displayName,
        }
      : null;

    // Clearing the vehicle clears the baseline: a fare threshold with nothing
    // to price against would silently never fire.
    if (!rate) record.baseline = null;
  }

  // Re-route only when the waypoints moved. A vehicle swap alone re-prices
  // against the stored route metrics instead, which spares an ORS call.
  if (patch.trip) {
    const route = await resolveRoute(patch.trip);
    record.route = serializeRoute(route);
  }

  const activeVehicleId = record.preferredVehicle?.vehicleRateId;

  if (activeVehicleId && (patch.trip || vehicleChanged)) {
    const rate = await loadPreferredRate(
      String(activeVehicleId),
      record.passengerCount,
    );

    if (rate && record.route) {
      record.baseline = await captureBaseline(rate, {
        distanceKm: record.route.distanceKm,
        durationMin: record.route.durationMin,
      });
    }
  }

  try {
    await record.save();
  } catch (error) {
    if (isDuplicateNameError(error)) {
      throw new SavedTripError(
        `Duplicate saved-trip name for user ${userId}`,
        409,
        "You already have a saved trip with that name in this country.",
      );
    }
    throw error;
  }

  return serializeSavedTrip(record.toObject() as StoredSavedTrip, {
    withCoords: true,
  });
}

// ── Conditions ─────────────────────────────────────────────────────────────

export type ConditionWriteInput = {
  type: AlertConditionType;
  threshold?: number | null;
  level?: TrafficLevel | null;
  isActive?: boolean;
};

type StoredCondition = {
  _id: unknown;
  type: AlertConditionType;
  threshold: number | null;
  level: TrafficLevel | null;
  isActive: boolean;
  lastState: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Rejects conditions that could never fire, rather than storing them and
 * leaving the user to wonder why nothing happens. The fare check is the
 * important one: without a preferred vehicle there is no baseline to compare
 * against, so the evaluator would skip it forever.
 */
function validateCondition(
  input: ConditionWriteInput,
  trip: { baseline: unknown; preferredVehicle: unknown },
): { threshold: number | null; level: TrafficLevel | null } {
  if (input.type === "weather_severity") {
    if (
      !isFiniteNumber(input.threshold) ||
      input.threshold < WEATHER_SEVERITY_MIN ||
      input.threshold > WEATHER_SEVERITY_MAX
    ) {
      throw new SavedTripError(
        `Invalid weather threshold: ${input.threshold}`,
        400,
        `Weather severity must be between ${WEATHER_SEVERITY_MIN} and ${WEATHER_SEVERITY_MAX}.`,
      );
    }

    return { threshold: input.threshold, level: null };
  }

  if (input.type === "traffic_level") {
    if (!input.level || !TRAFFIC_LEVELS.includes(input.level)) {
      throw new SavedTripError(
        `Invalid traffic level: ${input.level}`,
        400,
        `Traffic level must be one of: ${TRAFFIC_LEVELS.join(", ")}.`,
      );
    }

    return { threshold: null, level: input.level };
  }

  if (
    !isFiniteNumber(input.threshold) ||
    input.threshold < MIN_FARE_CHANGE_PERCENT ||
    input.threshold > MAX_FARE_CHANGE_PERCENT
  ) {
    throw new SavedTripError(
      `Invalid fare threshold: ${input.threshold}`,
      400,
      `Fare change must be between ${MIN_FARE_CHANGE_PERCENT}% and ${MAX_FARE_CHANGE_PERCENT}%.`,
    );
  }

  if (!trip.baseline || !trip.preferredVehicle) {
    throw new SavedTripError(
      "Fare condition added to a trip with no fare baseline",
      400,
      "Pick a vehicle for this trip first — a fare alert needs a baseline to compare against.",
    );
  }

  return { threshold: input.threshold, level: null };
}

async function loadOwnedTrip(userId: string, savedTripId: string) {
  if (!Types.ObjectId.isValid(savedTripId)) return null;

  await dbConnect();

  return SavedTrip.findOne({ _id: savedTripId, userId });
}

export async function addCondition({
  userId,
  savedTripId,
  input,
}: {
  userId: string;
  savedTripId: string;
  input: ConditionWriteInput;
}): Promise<SavedTripDetail | null> {
  const record = await loadOwnedTrip(userId, savedTripId);

  if (!record) return null;

  if (record.conditions.length >= MAX_CONDITIONS_PER_TRIP) {
    throw new SavedTripError(
      `Condition cap reached on trip ${savedTripId}`,
      409,
      `You can attach up to ${MAX_CONDITIONS_PER_TRIP} conditions to a trip.`,
    );
  }

  const { threshold, level } = validateCondition(input, record);

  record.conditions.push({
    type: input.type,
    threshold,
    level,
    isActive: input.isActive ?? true,
    lastState: false,
    lastTriggeredAt: null,
  });

  await record.save();

  return serializeSavedTrip(record.toObject() as StoredSavedTrip, {
    withCoords: true,
  });
}

export async function updateCondition({
  userId,
  savedTripId,
  conditionId,
  patch,
}: {
  userId: string;
  savedTripId: string;
  conditionId: string;
  patch: Omit<ConditionWriteInput, "type">;
}): Promise<SavedTripDetail | null> {
  const record = await loadOwnedTrip(userId, savedTripId);

  if (!record) return null;

  const condition = (record.conditions as StoredCondition[]).find(
    (entry) => String(entry._id) === conditionId,
  );

  if (!condition) return null;

  const thresholdChanged = patch.threshold !== undefined;
  const levelChanged = patch.level !== undefined;

  if (thresholdChanged || levelChanged) {
    const { threshold, level } = validateCondition(
      {
        type: condition.type,
        threshold: thresholdChanged ? patch.threshold : condition.threshold,
        level: levelChanged ? patch.level : condition.level,
      },
      record,
    );

    condition.threshold = threshold;
    condition.level = level;

    // Re-arm on a threshold change. Otherwise a condition left in the
    // triggered state would stay silent under its new setting until it
    // happened to clear on its own.
    condition.lastState = false;
  }

  if (patch.isActive !== undefined) {
    condition.isActive = patch.isActive;
  }

  await record.save();

  return serializeSavedTrip(record.toObject() as StoredSavedTrip, {
    withCoords: true,
  });
}

export async function deleteCondition({
  userId,
  savedTripId,
  conditionId,
}: {
  userId: string;
  savedTripId: string;
  conditionId: string;
}): Promise<SavedTripDetail | null> {
  const record = await loadOwnedTrip(userId, savedTripId);

  if (!record) return null;

  const before = record.conditions.length;

  record.conditions = (record.conditions as StoredCondition[]).filter(
    (entry) => String(entry._id) !== conditionId,
  );

  if (record.conditions.length === before) return null;

  await record.save();

  return serializeSavedTrip(record.toObject() as StoredSavedTrip, {
    withCoords: true,
  });
}

export async function deleteSavedTrip(userId: string, savedTripId: string) {
  if (!Types.ObjectId.isValid(savedTripId)) return false;

  await dbConnect();

  const result = await SavedTrip.deleteOne({ _id: savedTripId, userId });

  if (result.deletedCount === 0) return false;

  // Alerts are removed after the trip, not before: if the delete above fails
  // the notifications are still backed by a live trip, whereas the reverse
  // order could strip a user's notifications and then leave the trip in place.
  await deleteAlertsForSavedTrip(userId, savedTripId);

  return true;
}
