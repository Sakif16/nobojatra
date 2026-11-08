import "server-only";

import { Types } from "mongoose";
import connectMongoDB from "@/lib/mongodb";
import TripHistory from "@/models/TripHistory";
import { getTripTimeZone, resolveCountry, type CountryCode } from "@/lib/country-config";
import { formatLocalDateTime } from "@/lib/trip-time";
import { normalizeRouteCoords, normalizeRouteLegs } from "@/lib/fare-trip-context";
import type { RouteResult } from "@/lib/routing";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";

export type RestoredPlannerTrip = {
  country: CountryCode;
  tripHistoryId: string;
  selectedRouteId: string;
  values: RouteFormValues;
  routes: RouteResult[];
  scheduledAt: string | null;
  timeZone: string;
};

type StoredPlace = { label: string; lat: number; lng: number; dwellMinutes?: number | null };
type StoredPlannerTrip = {
  country?: unknown; timeZone?: unknown; origin?: StoredPlace; destination?: StoredPlace;
  stops?: StoredPlace[]; passengerCount?: number; departureMode?: string; scheduledAt?: Date | null;
  routeOptions?: Array<{ routeId: string; rank: number; distanceKm: number; durationMin: number;
    travelDurationMin?: number | null; dwellDurationMin?: number | null; coords?: unknown; legs?: unknown }>;
};

export async function getPlannerTrip(userId: string, tripHistoryId: string, routeId: string): Promise<RestoredPlannerTrip | null> {
  if (!Types.ObjectId.isValid(tripHistoryId) || !routeId) return null;
  await connectMongoDB();
  const record = await TripHistory.findOne({ _id: tripHistoryId, userId }).lean() as StoredPlannerTrip | null;
  if (!record) return null;

  const routes: RouteResult[] = (record.routeOptions ?? []).flatMap((route) => {
    const coords = normalizeRouteCoords(route.coords);
    if (!route.routeId || coords.length < 2 || !Number.isFinite(route.rank) || !Number.isFinite(route.distanceKm) || !Number.isFinite(route.durationMin)) return [];
    return [{ id: route.routeId, rank: route.rank, coords, distanceKm: route.distanceKm, durationMin: route.durationMin,
      travelDurationMin: route.travelDurationMin ?? route.durationMin, dwellDurationMin: route.dwellDurationMin ?? 0,
      legs: normalizeRouteLegs(route.legs) }];
  });
  if (!routes.some((route) => route.id === routeId) || !record.origin || !record.destination) return null;
  const country = resolveCountry(record.country);
  const timeZone = getTripTimeZone(record.timeZone, country);
  const scheduledAt = record.departureMode === "scheduled" && record.scheduledAt ? new Date(record.scheduledAt).toISOString() : null;
  const place = (value: StoredPlace) => ({
    label: value.label, lat: value.lat, lng: value.lng,
    ...(typeof value.dwellMinutes === "number" ? { dwellMinutes: value.dwellMinutes } : {}),
  });
  return {
    country, tripHistoryId, selectedRouteId: routeId, routes, scheduledAt, timeZone,
    values: { origin: place(record.origin), destination: place(record.destination), stops: (record.stops ?? []).map(place),
      passengerCount: record.passengerCount ?? 1, departureMode: scheduledAt ? "scheduled" : "now",
      scheduledLocal: scheduledAt ? formatLocalDateTime(scheduledAt, timeZone) : null },
  };
}
