import { auth } from "@/lib/auth";
import { estimateFaresForRates } from "@/lib/fare-providers";
import connectMongoDB from "@/lib/mongodb";
import {
  fetchWeatherForPoint,
  getWeatherVehicleRestriction,
  type NormalizedWeather,
  type WeatherPoint,
} from "@/lib/weather";
import TripHistory from "@/models/TripHistory";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const DHAKA_WEATHER_FALLBACK: WeatherPoint = { lat: 23.8103, lng: 90.4125 };

type FareRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
};

type StoredLocation = {
  label?: unknown;
  lat?: unknown;
  lng?: unknown;
};

type StoredRoute = {
  routeId?: unknown;
  distanceKm?: unknown;
  durationMin?: unknown;
  coords?: unknown;
  legs?: unknown;
};

type StoredTripHistory = {
  origin?: StoredLocation;
  destination?: StoredLocation;
  stops?: StoredLocation[];
  passengerCount?: unknown;
  routeOptions?: StoredRoute[];
  selectedRoute?: StoredRoute | null;
};

/** Shape the fares page needs to draw the same map the dashboard drew. */
type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

type RouteLeg = {
  startIndex: number;
  endIndex: number;
  color: string;
  distanceKm: number;
};

type VehicleRateDocument = {
  provider: string;
  vehicleType: string;
  displayName: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  maxPassengers: number;
  comfortScore: number;
};

type LatLngTuple = [number, number];

type WeatherSource = "route_midpoint" | "dhaka_fallback";

type FareWeather = NormalizedWeather & {
  source: WeatherSource;
};

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPassengerCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 8
  );
}

function getLocationLabel(location: StoredLocation | undefined) {
  return typeof location?.label === "string" && location.label.trim()
    ? location.label
    : "Unknown place";
}

function toMapPoint(location: StoredLocation | undefined): MapPoint | null {
  const lat = location?.lat;
  const lng = location?.lng;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    return null;
  }

  return { lat, lng, label: getLocationLabel(location) };
}

function normalizeRouteLegs(legs: unknown): RouteLeg[] {
  if (!Array.isArray(legs)) return [];

  return legs.filter((leg): leg is RouteLeg => {
    if (!leg || typeof leg !== "object") return false;
    const candidate = leg as Partial<RouteLeg>;
    return (
      typeof candidate.startIndex === "number" &&
      typeof candidate.endIndex === "number" &&
      typeof candidate.color === "string"
    );
  });
}

function normalizeRouteCoords(coords: unknown): LatLngTuple[] {
  if (!Array.isArray(coords)) return [];

  return coords.filter((coord): coord is LatLngTuple => {
    if (!Array.isArray(coord) || coord.length < 2) return false;
    const [lat, lng] = coord;
    return (
      typeof lat === "number" &&
      Number.isFinite(lat) &&
      typeof lng === "number" &&
      Number.isFinite(lng)
    );
  });
}

function distanceMeters(first: LatLngTuple, second: LatLngTuple) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(second[0] - first[0]);
  const dLng = toRadians(second[1] - first[1]);
  const lat1 = toRadians(first[0]);
  const lat2 = toRadians(second[0]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function getRouteMidpoint(coords: LatLngTuple[]) {
  if (coords.length === 0) return null;
  if (coords.length === 1) {
    const [lat, lng] = coords[0];
    return { lat, lng };
  }

  const segmentDistances = coords.slice(1).map((coord, index) =>
    distanceMeters(coords[index], coord),
  );
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);

  if (totalDistance === 0) {
    const middle = coords[Math.floor(coords.length / 2)];
    return middle ? { lat: middle[0], lng: middle[1] } : null;
  }

  const targetDistance = totalDistance / 2;
  let traversed = 0;

  for (let index = 1; index < coords.length; index += 1) {
    const segmentDistance = segmentDistances[index - 1] ?? 0;

    if (traversed + segmentDistance < targetDistance) {
      traversed += segmentDistance;
      continue;
    }

    const previous = coords[index - 1];
    const current = coords[index];
    const ratio =
      segmentDistance === 0 ? 0 : (targetDistance - traversed) / segmentDistance;

    return {
      lat: previous[0] + (current[0] - previous[0]) * ratio,
      lng: previous[1] + (current[1] - previous[1]) * ratio,
    };
  }

  const last = coords[coords.length - 1];
  return last ? { lat: last[0], lng: last[1] } : null;
}

async function getFareWeather(routeMidpoint: WeatherPoint | null) {
  const source: WeatherSource = routeMidpoint ? "route_midpoint" : "dhaka_fallback";
  const point = routeMidpoint ?? DHAKA_WEATHER_FALLBACK;

  try {
    const weather = await fetchWeatherForPoint(point);

    return {
      weather: {
        source,
        ...weather,
      } satisfies FareWeather,
      weatherUnavailable: false,
    };
  } catch (error) {
    console.warn("Weather lookup failed:", error);

    return {
      weather: null,
      weatherUnavailable: true,
    };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  let body: FareRequestBody;

  try {
    body = (await req.json()) as FareRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const tripHistoryId =
    typeof body.tripHistoryId === "string" ? body.tripHistoryId.trim() : "";
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";

  if (!Types.ObjectId.isValid(tripHistoryId) || !routeId) {
    return NextResponse.json(
      { success: false, message: "A valid tripHistoryId and routeId are required." },
      { status: 400 },
    );
  }

  await connectMongoDB();

  const trip = (await TripHistory.findOne({
    _id: tripHistoryId,
    userId: session.user.id,
  }).lean()) as StoredTripHistory | null;

  if (!trip) {
    return NextResponse.json(
      { success: false, message: "Trip history was not found." },
      { status: 404 },
    );
  }

  const routeOptions = Array.isArray(trip.routeOptions) ? trip.routeOptions : [];
  const selectedRoute =
    routeOptions.find((route) => route.routeId === routeId) ??
    (trip.selectedRoute?.routeId === routeId ? trip.selectedRoute : null);

  if (!selectedRoute) {
    return NextResponse.json(
      { success: false, message: "Route was not found for this trip." },
      { status: 404 },
    );
  }

  const distanceKm = selectedRoute.distanceKm;
  const durationMin = selectedRoute.durationMin;
  const passengers = trip.passengerCount;

  if (
    !isFinitePositiveNumber(distanceKm) ||
    !isFinitePositiveNumber(durationMin) ||
    !isValidPassengerCount(passengers)
  ) {
    return NextResponse.json(
      { success: false, message: "Stored trip route is missing fare metrics." },
      { status: 422 },
    );
  }

  const routeCoords = normalizeRouteCoords(selectedRoute.coords);
  const routeMidpoint = getRouteMidpoint(routeCoords);
  const { weather, weatherUnavailable } = await getFareWeather(routeMidpoint);
  const rates = (await VehicleRate.find({
    isActive: true,
  }).lean()) as VehicleRateDocument[];
  // One shared calculator prices every rate. Live provider lookups run
  // concurrently under a bound and each one is isolated, so a Pathao outage
  // degrades those two cards to a rate-card estimate instead of taking down
  // the Uber and CNG results with it.
  const fareEstimates = await estimateFaresForRates(rates, { distanceKm, durationMin });
  const results = [];

  for (const [index, rate] of rates.entries()) {
    const eligible = passengers <= rate.maxPassengers;
    const fareEstimate = fareEstimates[index];

    const weatherRestriction = weather
      ? getWeatherVehicleRestriction(
          {
            provider: rate.provider,
            vehicleType: rate.vehicleType,
          },
          weather,
        )
      : {
          weatherRestricted: false,
          weatherBlocked: false,
          restrictionReason: null,
        };

    results.push({
      provider: rate.provider,
      vehicleType: rate.vehicleType,
      displayName: rate.displayName,
      maxPassengers: rate.maxPassengers,
      comfortScore: rate.comfortScore,
      eligible,
      weatherRestricted: weatherRestriction.weatherRestricted,
      weatherBlocked: weatherRestriction.weatherBlocked,
      restrictionReason: weatherRestriction.restrictionReason,
      fare: fareEstimate.fare,
      // Provenance travels with the estimate so the client can tell a live
      // quote apart from a fallback one.
      fareSource: fareEstimate.fareSource,
      fareSourceNote: fareEstimate.fareSourceNote,
    });
  }

  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.fare.low - b.fare.low;
  });

  return NextResponse.json({
    success: true,
    trip: {
      tripHistoryId,
      routeId,
      originLabel: getLocationLabel(trip.origin),
      destinationLabel: getLocationLabel(trip.destination),
      distanceKm,
      durationMin,
      passengers,
      routeMidpoint,
    },
    // Waypoints and geometry so the fares page can redraw the selected route
    // without re-running the routing request.
    map: {
      origin: toMapPoint(trip.origin),
      destination: toMapPoint(trip.destination),
      stops: (Array.isArray(trip.stops) ? trip.stops : [])
        .map(toMapPoint)
        .filter((stop): stop is MapPoint => stop !== null),
      route: {
        id: routeId,
        coords: routeCoords,
        legs: normalizeRouteLegs(selectedRoute.legs),
        distanceKm,
        durationMin,
      },
    },
    weather,
    weatherUnavailable,
    results,
  });
}
