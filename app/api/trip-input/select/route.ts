import { auth } from "@/lib/auth";
import { COUNTRY_CONFIG, resolveCountry, type CountryCode } from "@/lib/country-config";
import { createTripConfirmedAlert } from "@/lib/alerts";
import { estimateFaresForRates } from "@/lib/fare-providers";
import connectMongoDB from "@/lib/mongodb";
import {
  fetchWeatherForPoint,
  getWeatherVehicleRestriction,
  type WeatherPoint,
} from "@/lib/weather";
import {
  getTrafficForTrip,
  TrafficServiceError,
  type DepartureOptions,
  type TrafficPoint,
} from "@/lib/traffic-service";
import { saveVehicleSelection } from "@/lib/trip-history";
import TripHistory from "@/models/TripHistory";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// Only reached when a route has no usable geometry to take a midpoint from.
function getWeatherFallbackPoint(country: CountryCode): WeatherPoint {
  return COUNTRY_CONFIG[country].fallbackWeatherPoint;
}

// ── Request body ──
type SelectRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
  provider?: unknown;
  vehicleType?: unknown;
};

// ── Stored document shapes — same duplication pattern as
// app/api/fares/route.ts and app/api/best-options/route.ts ──
type StoredRoute = {
  routeId?: unknown;
  distanceKm?: unknown;
  travelDurationMin?: unknown;
  dwellDurationMin?: unknown;
  durationMin?: unknown;
  coords?: unknown;
  legs?: unknown;
};
type StoredTripHistory = {
  country?: unknown;
  origin?: unknown;
  destination?: unknown;
  passengerCount?: unknown;
  departureMode?: unknown;
  scheduledAt?: unknown;
  routeOptions?: StoredRoute[];
  selectedRoute?: StoredRoute | null;
};

type LatLngTuple = [number, number];

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPassengerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;
}

function getLocationLabel(value: unknown, fallback: string) {
  if (typeof value !== "object" || value === null || !("label" in value)) {
    return fallback;
  }

  const label = (value as { label?: unknown }).label;
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

function normalizeRouteCoords(coords: unknown): LatLngTuple[] {
  if (!Array.isArray(coords)) return [];
  return coords.filter((coord): coord is LatLngTuple => {
    if (!Array.isArray(coord) || coord.length < 2) return false;
    const [lat, lng] = coord;
    return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
  });
}

function getRouteDwellDurationMin(route: StoredRoute) {
  if (
    typeof route.dwellDurationMin === "number" &&
    Number.isFinite(route.dwellDurationMin) &&
    route.dwellDurationMin >= 0
  ) {
    return route.dwellDurationMin;
  }

  if (!Array.isArray(route.legs)) {
    return 0;
  }

  return route.legs.reduce((total, leg) => {
    if (!leg || typeof leg !== "object") return total;

    const dwellAfterMin = (leg as { dwellAfterMin?: unknown }).dwellAfterMin;

    return typeof dwellAfterMin === "number" && Number.isFinite(dwellAfterMin)
      ? total + dwellAfterMin
      : total;
  }, 0);
}

function getRouteTravelDurationMin(route: StoredRoute, totalDurationMin: number) {
  if (
    typeof route.travelDurationMin === "number" &&
    Number.isFinite(route.travelDurationMin) &&
    route.travelDurationMin > 0
  ) {
    return route.travelDurationMin;
  }

  return Math.max(1, totalDurationMin - getRouteDwellDurationMin(route));
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
  const segmentDistances = coords.slice(1).map((coord, index) => distanceMeters(coords[index], coord));
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
    const ratio = segmentDistance === 0 ? 0 : (targetDistance - traversed) / segmentDistance;
    return {
      lat: previous[0] + (current[0] - previous[0]) * ratio,
      lng: previous[1] + (current[1] - previous[1]) * ratio,
    };
  }
  const last = coords[coords.length - 1];
  return last ? { lat: last[0], lng: last[1] } : null;
}

function getDepartureOptions(trip: StoredTripHistory): DepartureOptions {
  if (trip.departureMode === "scheduled" && typeof trip.scheduledAt === "string") {
    const parsed = new Date(trip.scheduledAt);
    if (!Number.isNaN(parsed.getTime())) {
      return { mode: "scheduled", scheduledAt: parsed.toISOString() };
    }
  }
  return { mode: "now" };
}

// Same sampling strategy as app/api/best-options/route.ts, so the traffic
// reading stamped on the summary matches what the user saw on that page.
function sampleTrafficPoints(coords: LatLngTuple[]): TrafficPoint[] | null {
  const sampleCount = Math.min(10, coords.length);
  if (sampleCount < 2) return null;
  const points: TrafficPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const coordinateIndex = Math.round((index * (coords.length - 1)) / Math.max(1, sampleCount - 1));
    const coordinate = coords[coordinateIndex];
    if (coordinate) points.push({ lat: coordinate[0], lng: coordinate[1] });
  }
  return points.length >= 2 ? points : null;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  let body: SelectRequestBody;
  try {
    body = (await req.json()) as SelectRequestBody;
  } catch {
    return NextResponse.json({ success: false, message: "Request body must be valid JSON." }, { status: 400 });
  }

  const tripHistoryId = typeof body.tripHistoryId === "string" ? body.tripHistoryId.trim() : "";
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const vehicleType = typeof body.vehicleType === "string" ? body.vehicleType.trim() : "";

  if (!Types.ObjectId.isValid(tripHistoryId) || !routeId || !provider || !vehicleType) {
    return NextResponse.json(
      { success: false, message: "tripHistoryId, routeId, provider, and vehicleType are required." },
      { status: 400 },
    );
  }

  await connectMongoDB();

  const trip = (await TripHistory.findOne({
    _id: tripHistoryId,
    userId: session.user.id,
  }).lean()) as StoredTripHistory | null;

  if (!trip) {
    return NextResponse.json({ success: false, message: "Trip history was not found." }, { status: 404 });
  }

  const routeOptions = Array.isArray(trip.routeOptions) ? trip.routeOptions : [];
  const selectedRoute =
    routeOptions.find((route) => route.routeId === routeId) ??
    (trip.selectedRoute?.routeId === routeId ? trip.selectedRoute : null);

  if (!selectedRoute) {
    return NextResponse.json({ success: false, message: "Route was not found for this trip." }, { status: 404 });
  }

  const distanceKm = selectedRoute.distanceKm;
  const durationMin = selectedRoute.durationMin;
  const passengers = trip.passengerCount;

  if (!isFinitePositiveNumber(distanceKm) || !isFinitePositiveNumber(durationMin) || !isValidPassengerCount(passengers)) {
    return NextResponse.json({ success: false, message: "Stored trip route is missing fare metrics." }, { status: 422 });
  }

  const dwellDurationMin = getRouteDwellDurationMin(selectedRoute);
  const travelDurationMin = getRouteTravelDurationMin(selectedRoute, durationMin);

  // The country comes off the trip, not the profile. It is also load-bearing
  // for this lookup: the same provider/vehicleType pair exists in every market
  // the app serves, so without it this findOne would return an arbitrary
  // country's rate card and price the trip in the wrong currency.
  const country = resolveCountry(trip.country);

  const rate = await VehicleRate.findOne({ country, provider, vehicleType, isActive: true }).lean();
  if (!rate) {
    return NextResponse.json({ success: false, message: "That vehicle is not available." }, { status: 404 });
  }

  if (passengers > rate.maxPassengers) {
    return NextResponse.json(
      { success: false, message: `This vehicle only seats ${rate.maxPassengers} passenger(s).` },
      { status: 422 },
    );
  }

  const routeCoords = normalizeRouteCoords(selectedRoute.coords);
  const routeMidpoint = getRouteMidpoint(routeCoords);
  const weatherPoint = routeMidpoint ?? getWeatherFallbackPoint(country);
  const weatherSource: "route_midpoint" | "dhaka_fallback" = routeMidpoint ? "route_midpoint" : "dhaka_fallback";

  // Weather snapshot — mirrors app/api/fares/route.ts's fallback policy: a
  // provider outage degrades to "unavailable", it never fails the request.
  let weather: (Awaited<ReturnType<typeof fetchWeatherForPoint>> & { source: typeof weatherSource }) | null = null;
  let weatherUnavailable = false;
  try {
    const reading = await fetchWeatherForPoint(weatherPoint);
    weather = { ...reading, source: weatherSource };
  } catch (error) {
    console.warn("Weather snapshot failed:", error);
    weatherUnavailable = true;
  }

  if (weather) {
    const restriction = getWeatherVehicleRestriction({ provider, vehicleType }, weather);
    if (restriction.weatherBlocked) {
      return NextResponse.json(
        {
          success: false,
          message: restriction.restrictionReason ?? "This vehicle is blocked by current weather.",
        },
        { status: 422 },
      );
    }
  }

  // Traffic snapshot — same non-blocking-on-failure policy.
  let traffic: {
    congestionIndexPercent: number;
    congestionLevel: "low" | "moderate" | "high" | "severe";
    isPeakHour: boolean;
    durationInTrafficMin: number;
    baselineDurationMin: number;
  } | null = null;
  let trafficUnavailable = false;
  const trafficPoints = sampleTrafficPoints(routeCoords);
  if (trafficPoints) {
    try {
      const result = await getTrafficForTrip(
        trafficPoints,
        getDepartureOptions(trip),
        country,
      );
      traffic = {
        congestionIndexPercent: result.totals.congestionIndexPercent,
        congestionLevel: result.totals.congestionLevel,
        isPeakHour: result.isPeakHour,
        durationInTrafficMin:
          Math.round(result.totals.durationInTrafficSec / 60) + dwellDurationMin,
        baselineDurationMin:
          Math.round(result.totals.baselineDurationSec / 60) + dwellDurationMin,
      };
    } catch (error) {
      if (error instanceof TrafficServiceError) {
        console.warn("Traffic snapshot failed:", error.message);
      } else {
        console.warn("Traffic snapshot failed:", error);
      }
      trafficUnavailable = true;
    }
  } else {
    trafficUnavailable = true;
  }

  const [fareEstimate] = await estimateFaresForRates([rate], {
    distanceKm,
    durationMin,
    adjustmentContext: { weather, traffic },
  });
  const estimatedDurationMin = traffic
    ? traffic.durationInTrafficMin
    : travelDurationMin + dwellDurationMin;

  const saved = await saveVehicleSelection({
    userId: session.user.id,
    tripHistoryId,
    routeId,
    vehicle: {
      vehicleRateId: rate._id ? String(rate._id) : null,
      provider: rate.provider,
      vehicleType: rate.vehicleType,
      displayName: rate.displayName,
      maxPassengers: rate.maxPassengers,
      estimatedFareLow: fareEstimate.fare.low,
      estimatedFareHigh: fareEstimate.fare.high,
      estimatedDurationMin,
      currency: COUNTRY_CONFIG[country].currency,
    },
    snapshot: {
      weather: weather
        ? {
            source: weather.source,
            temperatureCelsius: weather.temperatureCelsius,
            precipitationMmPerHour: weather.precipitationMmPerHour,
            windKmh: weather.windKmh,
            visibilityMeters: weather.visibilityMeters,
            severityScore: weather.severityScore,
            severityBand: weather.severityBand,
          }
        : null,
      weatherUnavailable,
      traffic,
      trafficUnavailable,
    },
  });

  if (!saved) {
    return NextResponse.json({ success: false, message: "Could not confirm this trip." }, { status: 404 });
  }

  try {
    await createTripConfirmedAlert({
      userId: session.user.id,
      tripHistoryId: saved.id,
      originLabel: getLocationLabel(trip.origin, "your origin"),
      destinationLabel: getLocationLabel(trip.destination, "your destination"),
      vehicleLabel: rate.displayName,
      fareLow: fareEstimate.fare.low,
      fareHigh: fareEstimate.fare.high,
      currency: COUNTRY_CONFIG[country].currency,
    });
  } catch (error) {
    console.error("Trip confirmation notification failed:", error);
  }

  return NextResponse.json({ success: true, tripHistoryId: saved.id });
}
