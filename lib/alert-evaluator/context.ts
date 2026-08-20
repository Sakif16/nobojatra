// Gathers the provider data one saved trip's conditions are judged against.
//
// The route is re-resolved on every run rather than read from the stored
// snapshot. That is what makes the fare condition mechanically able to fire:
// the Pathao endpoint prices on distance and duration, so a fare can only move
// if the duration does, and the duration only moves if we ask for it again.
import { resolveCountry } from "@/lib/country-config";
import "server-only";

import { estimateFaresForRates } from "@/lib/fare-providers";
import dbConnect from "@/lib/mongodb";
import { fetchRouteSuggestions } from "@/lib/route-service";
import { getTrafficSampleIndices } from "@/lib/routing";
import {
  getTrafficForTrip,
  type DepartureOptions,
  type TrafficPoint,
} from "@/lib/traffic-service";
import { fetchWeatherForPoint, type NormalizedWeather } from "@/lib/weather";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import type { EvaluationContext, SavedTripDocument } from "./types";

type RateColumns = {
  provider: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
};

export type BuiltContext = {
  context: EvaluationContext;
  /** Fresh route snapshot for the caller to persist. */
  route: {
    routeId: string;
    distanceKm: number;
    durationMin: number;
    coords: [number, number][];
    legs: unknown[];
    resolvedAt: Date;
  };
  notes: string[];
};

function toDepartureOptions(trip: SavedTripDocument): DepartureOptions {
  if (trip.departureMode === "scheduled" && trip.scheduledAt) {
    return { mode: "scheduled", scheduledAt: new Date(trip.scheduledAt).toISOString() };
  }

  return { mode: "now" };
}

function getMidpoint(coords: [number, number][]) {
  const point = coords[Math.floor(coords.length / 2)];
  return point ? { lat: point[0], lng: point[1] } : null;
}

/** Route coordinates thinned to the handful of points the traffic API takes. */
function getTrafficPoints(coords: [number, number][]): TrafficPoint[] | null {
  const points = getTrafficSampleIndices({ coords })
    .map((index) => coords[index])
    .filter(Boolean)
    .map(([lat, lng]) => ({ lat, lng }));

  return points.length >= 2 ? points : null;
}

async function loadRateColumns(vehicleRateId: unknown): Promise<RateColumns | null> {
  const id = String(vehicleRateId ?? "");

  if (!Types.ObjectId.isValid(id)) return null;

  await dbConnect();

  // Read live rate columns rather than the denormalized snapshot, so an edit
  // to the rate table is reflected the next time the trip is priced.
  return (await VehicleRate.findOne({
    _id: id,
    isActive: true,
  })
    .select("provider vehicleType baseFare perKmRate perMinRate minimumFare")
    .lean()) as RateColumns | null;
}

/**
 * Resolves the route, then gathers traffic, weather, and fare concurrently.
 *
 * Every provider is isolated: a failure records a note and leaves that slice of
 * the context null, which the evaluators read as "unknown" and skip. Routing is
 * the exception — without a route there is nothing to evaluate — so it throws.
 */
export async function buildEvaluationContext(
  trip: SavedTripDocument,
): Promise<BuiltContext> {
  const notes: string[] = [];

  const routes = await fetchRouteSuggestions(
    trip.origin,
    trip.destination,
    trip.stops ?? [],
  );
  const best = routes[0];

  if (!best) {
    throw new Error(`No route found for saved trip ${String(trip._id)}`);
  }

  const departure = toDepartureOptions(trip);
  const trafficPoints = getTrafficPoints(best.coords);
  const midpoint = getMidpoint(best.coords) ?? trip.origin;

  const [traffic, weather, rate] = await Promise.all([
    trafficPoints
      ? getTrafficForTrip(trafficPoints, departure).catch((error: unknown) => {
          notes.push(
            `Traffic unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
          );
          return null;
        })
      : Promise.resolve(null),

    fetchWeatherForPoint({ lat: midpoint.lat, lng: midpoint.lng }).catch(
      (error: unknown) => {
        notes.push(
          `Weather unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
        );
        return null as NormalizedWeather | null;
      },
    ),

    (async () => {
      if (!trip.preferredVehicle) return null;

      const rate = await loadRateColumns(trip.preferredVehicle.vehicleRateId);

      if (!rate) {
        notes.push("Fare unavailable: preferred vehicle is no longer active.");
        return null;
      }

      return rate;
    })().catch((error: unknown) => {
      notes.push(
        `Fare unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return null;
    }),
  ]);

  let fare: EvaluationContext["fare"] = null;

  if (rate) {
    try {
      const [estimate] = await estimateFaresForRates([rate], {
        distanceKm: best.distanceKm,
        durationMin: best.durationMin,
        adjustmentContext: {
          weather,
          traffic: traffic
            ? {
                congestionLevel: traffic.totals.congestionLevel,
                isPeakHour: traffic.isPeakHour,
              }
            : null,
        },
      });

      fare = {
        low: estimate.fare.low,
        mid: estimate.fare.mid,
        high: estimate.fare.high,
        source: estimate.fareSource,
      };
    } catch (error) {
      notes.push(
        `Fare unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return {
    context: {
      tripName: trip.name,
      country: resolveCountry(trip.country),
      distanceKm: best.distanceKm,
      durationMin: best.durationMin,
      weather,
      traffic,
      fare,
      baseline: trip.baseline ?? null,
    },
    route: {
      routeId: best.id,
      distanceKm: best.distanceKm,
      durationMin: best.durationMin,
      coords: best.coords,
      legs: best.legs,
      resolvedAt: new Date(),
    },
    notes,
  };
}
