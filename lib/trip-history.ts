import "server-only";

import dbConnect from "@/lib/mongodb";
import type { RouteResult } from "@/lib/routing";
import type { TripLocation, ValidatedTripInput } from "@/lib/trip-input";
import TripHistory from "@/models/TripHistory";
import { Types } from "mongoose";

function serializeLocation(location: TripLocation) {
  return {
    label: location.label,
    lat: location.lat,
    lng: location.lng,
  };
}

function serializeRoute(route: RouteResult) {
  return {
    routeId: route.id,
    rank: route.rank,
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    coords: route.coords,
    legs: route.legs,
  };
}

export type RecentTrip = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  passengerCount: number;
  distanceKm: number | null;
  durationMin: number | null;
  departureMode: "now" | "scheduled";
  scheduledAt: string | null;
  createdAt: string;
};

type StoredLocation = { label?: unknown; lat?: unknown; lng?: unknown };

function getLocationLabel(location: unknown) {
  const label = (location as StoredLocation | null)?.label;
  return typeof label === "string" && label.trim() ? label : "Unknown place";
}

/**
 * Home-page summary. Returns plain serializable values because these cross the
 * server/client boundary as props.
 */
export async function getHomeTripSummary(userId: string, limit = 3) {
  await dbConnect();

  const [records, upcomingCount] = await Promise.all([
    TripHistory.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    TripHistory.countDocuments({
      userId,
      departureMode: "scheduled",
      scheduledAt: { $gt: new Date() },
    }),
  ]);

  const recentTrips: RecentTrip[] = records.map((record) => ({
    id: String(record._id),
    originLabel: getLocationLabel(record.origin),
    destinationLabel: getLocationLabel(record.destination),
    stopCount: Array.isArray(record.stops) ? record.stops.length : 0,
    passengerCount: record.passengerCount ?? 1,
    distanceKm: record.distanceKm ?? null,
    durationMin: record.durationMin ?? null,
    departureMode: record.departureMode === "scheduled" ? "scheduled" : "now",
    scheduledAt: record.scheduledAt
      ? new Date(record.scheduledAt).toISOString()
      : null,
    createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
  }));

  return { recentTrips, upcomingCount };
}

export async function createTripHistoryRecord({
  userId,
  trip,
  routes,
}: {
  userId: string;
  trip: ValidatedTripInput;
  routes: RouteResult[];
}) {
  await dbConnect();

  const selectedRoute = routes[0] ? serializeRoute(routes[0]) : null;

  const record = await TripHistory.create({
    userId,
    origin: serializeLocation(trip.origin),
    destination: serializeLocation(trip.destination),
    stops: trip.stops.map(serializeLocation),
    passengerCount: trip.passengerCount,
    departureMode: trip.departureMode,
    scheduledAt: trip.scheduledAt ? new Date(trip.scheduledAt) : null,
    routeOptions: routes.map(serializeRoute),
    selectedRoute,
    distanceKm: selectedRoute?.distanceKm ?? null,
    durationMin: selectedRoute?.durationMin ?? null,
    completedAt: new Date(),
  });

  return String(record._id);
}

export async function updateSelectedTripRoute({
  userId,
  tripHistoryId,
  routeId,
}: {
  userId: string;
  tripHistoryId: string;
  routeId: string;
}) {
  if (!Types.ObjectId.isValid(tripHistoryId)) {
    return null;
  }

  await dbConnect();

  const record = await TripHistory.findOne({
    _id: tripHistoryId,
    userId,
  });

  if (!record) {
    return null;
  }

  const routeOptions = Array.isArray(record.routeOptions)
    ? record.routeOptions
    : [];
  const selectedRoute = routeOptions.find(
    (route: { routeId?: string }) => route.routeId === routeId
  );

  if (!selectedRoute) {
    return null;
  }

  record.selectedRoute = selectedRoute;
  record.distanceKm = selectedRoute.distanceKm;
  record.durationMin = selectedRoute.durationMin;
  await record.save();

  return {
    id: String(record._id),
    selectedRoute,
  };
}

// ── Trip Summary & Trip History ─────────────────────────────────────────

export type SelectedVehicleInput = {
  vehicleRateId?: string | null;
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  estimatedFareLow: number;
  estimatedFareHigh: number;
  estimatedDurationMin: number | null;
  currency?: string;
};

export type SelectionWeatherSnapshot = {
  source: "route_midpoint" | "dhaka_fallback";
  temperatureCelsius: number;
  precipitationMmPerHour: number;
  windKmh: number;
  visibilityMeters: number | null;
  severityScore: number;
  severityBand: "low" | "moderate" | "severe";
} | null;

export type SelectionTrafficSnapshot = {
  congestionIndexPercent: number;
  congestionLevel: "low" | "moderate" | "high" | "severe";
  isPeakHour: boolean;
  durationInTrafficMin: number;
  baselineDurationMin: number;
} | null;

export type SelectionSnapshotInput = {
  weather: SelectionWeatherSnapshot;
  weatherUnavailable: boolean;
  traffic: SelectionTrafficSnapshot;
  trafficUnavailable: boolean;
};

/**
 * Confirms a vehicle for a trip: re-anchors the selected route (in case the
 * user picked a different route card than what was last saved), stores the
 * vehicle by value, and stamps a weather/traffic snapshot for that instant.
 * Returns null if the trip or route isn't found/owned by this user.
 */
export async function saveVehicleSelection({
  userId,
  tripHistoryId,
  routeId,
  vehicle,
  snapshot,
}: {
  userId: string;
  tripHistoryId: string;
  routeId: string;
  vehicle: SelectedVehicleInput;
  snapshot: SelectionSnapshotInput;
}) {
  if (!Types.ObjectId.isValid(tripHistoryId)) return null;

  await dbConnect();

  const record = await TripHistory.findOne({ _id: tripHistoryId, userId });
  if (!record) return null;

  const routeOptions = Array.isArray(record.routeOptions) ? record.routeOptions : [];
  const matchedRoute =
    routeOptions.find((route: { routeId?: string }) => route.routeId === routeId) ??
    (record.selectedRoute?.routeId === routeId ? record.selectedRoute : null);

  if (!matchedRoute) return null;

  record.selectedRoute = matchedRoute;
  record.distanceKm = matchedRoute.distanceKm;
  record.durationMin = matchedRoute.durationMin;
  record.selectedVehicle = vehicle;
  record.selectionSnapshot = {
    ...snapshot,
    capturedAt: new Date(),
  };
  record.selectedAt = new Date();

  await record.save();

  return { id: String(record._id) };
}

export type TripSummaryDetail = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  passengerCount: number;
  distanceKm: number | null;
  durationMin: number | null;
  vehicle: {
    provider: string;
    vehicleType: string;
    displayName: string;
    maxPassengers: number;
    fareLow: number;
    fareHigh: number;
    currency: string;
  } | null;
  departureMode: "now" | "scheduled";
  estimatedDepartureAt: string | null;
  estimatedArrivalAt: string | null;
  weather: SelectionWeatherSnapshot;
  weatherUnavailable: boolean;
  traffic: SelectionTrafficSnapshot;
  trafficUnavailable: boolean;
  selectedAt: string | null;
  createdAt: string;
};

/** Post-selection summary for the Trip Summary page — a single owned trip. */
export async function getTripSummary(
  userId: string,
  tripHistoryId: string,
): Promise<TripSummaryDetail | null> {
  if (!Types.ObjectId.isValid(tripHistoryId)) return null;

  await dbConnect();

  const record = await TripHistory.findOne({ _id: tripHistoryId, userId }).lean();
  if (!record) return null;

  const vehicle = record.selectedVehicle
    ? {
        provider: record.selectedVehicle.provider,
        vehicleType: record.selectedVehicle.vehicleType,
        displayName: record.selectedVehicle.displayName,
        maxPassengers: record.selectedVehicle.maxPassengers,
        fareLow: record.selectedVehicle.estimatedFareLow,
        fareHigh: record.selectedVehicle.estimatedFareHigh,
        currency: record.selectedVehicle.currency ?? "BDT",
      }
    : null;

  const durationMin =
    record.selectedVehicle?.estimatedDurationMin ?? record.durationMin ?? null;

  // "now" trips depart when the user confirmed; scheduled trips depart at the
  // chosen time. Arrival is derived, not stored, so it never drifts from the
  // duration actually shown.
  const departureBase =
    record.departureMode === "scheduled" && record.scheduledAt
      ? new Date(record.scheduledAt)
      : record.selectedAt
        ? new Date(record.selectedAt)
        : new Date(record.createdAt ?? Date.now());

  const estimatedDepartureAt = departureBase.toISOString();
  const estimatedArrivalAt =
    durationMin != null
      ? new Date(departureBase.getTime() + durationMin * 60_000).toISOString()
      : null;

  return {
    id: String(record._id),
    originLabel: getLocationLabel(record.origin),
    destinationLabel: getLocationLabel(record.destination),
    stopCount: Array.isArray(record.stops) ? record.stops.length : 0,
    passengerCount: record.passengerCount ?? 1,
    distanceKm: record.distanceKm ?? null,
    durationMin,
    vehicle,
    departureMode: record.departureMode === "scheduled" ? "scheduled" : "now",
    estimatedDepartureAt,
    estimatedArrivalAt,
    weather: record.selectionSnapshot?.weather ?? null,
    weatherUnavailable: Boolean(record.selectionSnapshot?.weatherUnavailable),
    traffic: record.selectionSnapshot?.traffic ?? null,
    trafficUnavailable: Boolean(record.selectionSnapshot?.trafficUnavailable),
    selectedAt: record.selectedAt ? new Date(record.selectedAt).toISOString() : null,
    createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
  };
}

export type TripHistoryListItem = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  vehicleProvider: string | null;
  vehicleType: string | null;
  vehicleDisplayName: string | null;
  fareLow: number | null;
  fareHigh: number | null;
  fareMid: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  selectedAt: string | null;
  createdAt: string;
};

export type TripHistoryFilters = {
  from?: string;
  to?: string;
  provider?: string;
  vehicleType?: string;
};

export type TripHistoryPage = {
  trips: TripHistoryListItem[];
  summary: {
    tripCount: number;
    totalCost: number;
    averageCost: number;
    mostUsedVehicle: string | null;
  };
};

/**
 * Trip History list — only trips with a confirmed vehicle count (a search
 * that was never booked isn't trip history), reverse-chronological, with an
 * optional date-range and/or vehicle filter and a summary header computed
 * over the filtered set.
 */
export async function getTripHistoryPage(
  userId: string,
  filters: TripHistoryFilters = {},
): Promise<TripHistoryPage> {
  await dbConnect();

  const query: Record<string, unknown> = {
    userId,
    selectedVehicle: { $ne: null },
  };

  const createdAtRange: Record<string, Date> = {};
  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.getTime())) createdAtRange.$gte = from;
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999); // inclusive of the whole "to" day
      createdAtRange.$lte = to;
    }
  }
  if (Object.keys(createdAtRange).length > 0) {
    query.createdAt = createdAtRange;
  }

  if (filters.provider) query["selectedVehicle.provider"] = filters.provider;
  if (filters.vehicleType) query["selectedVehicle.vehicleType"] = filters.vehicleType;

  const records = await TripHistory.find(query).sort({ createdAt: -1 }).lean();

  const trips: TripHistoryListItem[] = records.map((record) => {
    const fareLow = record.selectedVehicle?.estimatedFareLow ?? null;
    const fareHigh = record.selectedVehicle?.estimatedFareHigh ?? null;
    const fareMid =
      fareLow != null && fareHigh != null ? (fareLow + fareHigh) / 2 : null;

    return {
      id: String(record._id),
      originLabel: getLocationLabel(record.origin),
      destinationLabel: getLocationLabel(record.destination),
      vehicleProvider: record.selectedVehicle?.provider ?? null,
      vehicleType: record.selectedVehicle?.vehicleType ?? null,
      vehicleDisplayName: record.selectedVehicle?.displayName ?? null,
      fareLow,
      fareHigh,
      fareMid,
      distanceKm: record.distanceKm ?? null,
      durationMin: record.durationMin ?? null,
      selectedAt: record.selectedAt ? new Date(record.selectedAt).toISOString() : null,
      createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
    };
  });

  const costs = trips.map((t) => t.fareMid).filter((v): v is number => v != null);
  const totalCost = Math.round(costs.reduce((sum, v) => sum + v, 0));
  const averageCost = costs.length > 0 ? Math.round(totalCost / costs.length) : 0;

  const usage = new Map<string, { label: string; count: number }>();
  for (const trip of trips) {
    if (!trip.vehicleDisplayName || !trip.vehicleProvider || !trip.vehicleType) continue;
    const key = `${trip.vehicleProvider}-${trip.vehicleType}`;
    const existing = usage.get(key);
    if (existing) existing.count += 1;
    else usage.set(key, { label: trip.vehicleDisplayName, count: 1 });
  }

  let mostUsedVehicle: string | null = null;
  let mostUsedCount = 0;
  for (const entry of usage.values()) {
    if (entry.count > mostUsedCount) {
      mostUsedCount = entry.count;
      mostUsedVehicle = entry.label;
    }
  }

  return {
    trips,
    summary: {
      tripCount: trips.length,
      totalCost,
      averageCost,
      mostUsedVehicle,
    },
  };
}

// ── Saved Places & Frequent Routes ──────────────────────────────────────

export type FrequentTripSuggestion = {
  origin: TripLocation;
  destination: TripLocation;
  passengerCount: number;
  tripCount: number;
};

// Rounds to 4 decimal places (~11m precision) so two trips to the "same"
// address don't get split into separate groups over GPS noise, while still
// telling apart genuinely different nearby places.
function roundCoord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10_000) / 10_000
    : null;
}

function toGroupableLocation(location: unknown): TripLocation | null {
  const record = location as StoredLocation | null;
  const lat = roundCoord(record?.lat);
  const lng = roundCoord(record?.lng);
  const label = typeof record?.label === "string" && record.label.trim() ? record.label : null;

  if (lat === null || lng === null || !label) return null;

  return { label, lat, lng };
}

/**
 * Groups trip history from the last N days by origin+destination pair and
 * returns the most-repeated ones, for the home screen's "Plan Again" cards.
 * A pair must occur at least `minOccurrences` times to count as "frequent" —
 * a one-off trip isn't a pattern worth surfacing.
 */
export async function getFrequentTrips(
  userId: string,
  options: { days?: number; limit?: number; minOccurrences?: number } = {},
): Promise<FrequentTripSuggestion[]> {
  await dbConnect();

  const days = options.days ?? 30;
  const limit = options.limit ?? 3;
  const minOccurrences = options.minOccurrences ?? 2;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const records = await TripHistory.find({ userId, createdAt: { $gte: cutoff } })
    .select("origin destination passengerCount createdAt")
    .sort({ createdAt: -1 }) // newest first, so the first hit per group is the most recent passenger count
    .lean();

  type Group = {
    origin: TripLocation;
    destination: TripLocation;
    passengerCount: number;
    count: number;
  };

  const groups = new Map<string, Group>();

  for (const record of records) {
    const origin = toGroupableLocation(record.origin);
    const destination = toGroupableLocation(record.destination);
    if (!origin || !destination) continue;

    const key = `${origin.lat},${origin.lng}=>${destination.lat},${destination.lng}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        origin,
        destination,
        passengerCount: record.passengerCount ?? 1,
        count: 1,
      });
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((group) => ({
      origin: group.origin,
      destination: group.destination,
      passengerCount: group.passengerCount,
      tripCount: group.count,
    }));
}