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