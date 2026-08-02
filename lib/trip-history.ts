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
