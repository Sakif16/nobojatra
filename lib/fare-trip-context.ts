import "server-only";

import {
  COUNTRY_CONFIG,
  getTripTimeZone,
  hasLiveTraffic,
  resolveCountry,
  type CountryCode,
} from "@/lib/country-config";
import connectMongoDB from "@/lib/mongodb";
import {
  getTrafficForTrip,
  isDeparturePeakHour,
  TrafficServiceError,
  type DepartureOptions,
  type TrafficPoint,
  type TripTrafficResult,
} from "@/lib/traffic-service";
import {
  fetchWeatherForDeparture,
  type NormalizedWeather,
  type WeatherPoint,
} from "@/lib/weather";
import TripHistory from "@/models/TripHistory";

export type StoredLocation = { label?: unknown; lat?: unknown; lng?: unknown };
export type StoredRoute = {
  routeId?: unknown;
  distanceKm?: unknown;
  travelDurationMin?: unknown;
  dwellDurationMin?: unknown;
  durationMin?: unknown;
  coords?: unknown;
  legs?: unknown;
};
export type StoredTripHistory = {
  country?: unknown;
  origin?: StoredLocation;
  destination?: StoredLocation;
  stops?: StoredLocation[];
  passengerCount?: unknown;
  departureMode?: unknown;
  scheduledAt?: unknown;
  timeZone?: unknown;
  routeOptions?: StoredRoute[];
  selectedRoute?: StoredRoute | null;
};
export type MapPoint = { lat: number; lng: number; label: string };
export type RouteLeg = {
  startIndex: number;
  endIndex: number;
  color: string;
  distanceKm: number;
  durationMin: number;
  fromLabel?: string;
  toLabel?: string;
  dwellAfterMin?: number;
};
export type VehicleRateDocument = {
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
export type LatLngTuple = [number, number];
export type FareWeather = NormalizedWeather & {
  // This persisted enum still uses the old name for a fallback in any country.
  source: "route_midpoint" | "dhaka_fallback";
};

export type FareTripContext = {
  trip: StoredTripHistory;
  selectedRoute: StoredRoute;
  country: CountryCode;
  /** The IANA zone at the origin, which the trip's times are shown in. */
  timeZone: string;
  distanceKm: number;
  durationMin: number;
  passengers: number;
  dwellDurationMin: number;
  travelDurationMin: number;
  routeCoords: LatLngTuple[];
  routeMidpoint: WeatherPoint | null;
  departure: DepartureOptions;
  /**
   * Whether the departure is in a peak-hour window. Read off the clock, so it
   * is known even when there is no traffic reading to go with it.
   */
  isPeakHour: boolean;
};

type FareTripLoadResult =
  | { ok: true; context: FareTripContext }
  | { ok: false; status: 404 | 422; message: string };

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPassengerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;
}

export function getLocationLabel(value: unknown, fallback = "Unknown place") {
  if (!value || typeof value !== "object" || !("label" in value)) return fallback;
  const label = value.label;
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

export function toMapPoint(location: StoredLocation | undefined): MapPoint | null {
  const lat = location?.lat;
  const lng = location?.lng;
  if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lng !== "number" || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng, label: getLocationLabel(location) };
}

export function normalizeRouteLegs(legs: unknown): RouteLeg[] {
  if (!Array.isArray(legs)) return [];
  return legs.reduce<RouteLeg[]>((normalized, leg) => {
    if (!leg || typeof leg !== "object") return normalized;
    const candidate = leg as Partial<RouteLeg>;
    if (
      typeof candidate.startIndex !== "number" ||
      typeof candidate.endIndex !== "number" ||
      typeof candidate.color !== "string"
    ) {
      return normalized;
    }
    normalized.push({
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex,
      color: candidate.color,
      distanceKm:
        typeof candidate.distanceKm === "number" && Number.isFinite(candidate.distanceKm)
          ? candidate.distanceKm
          : 0,
      durationMin:
        typeof candidate.durationMin === "number" && Number.isFinite(candidate.durationMin)
          ? candidate.durationMin
          : 0,
      ...(typeof candidate.fromLabel === "string" ? { fromLabel: candidate.fromLabel } : {}),
      ...(typeof candidate.toLabel === "string" ? { toLabel: candidate.toLabel } : {}),
      ...(typeof candidate.dwellAfterMin === "number" && Number.isFinite(candidate.dwellAfterMin)
        ? { dwellAfterMin: candidate.dwellAfterMin }
        : {}),
    });
    return normalized;
  }, []);
}

function getRouteDwellDurationMin(route: StoredRoute) {
  if (
    typeof route.dwellDurationMin === "number" &&
    Number.isFinite(route.dwellDurationMin) &&
    route.dwellDurationMin >= 0
  ) {
    return route.dwellDurationMin;
  }
  return normalizeRouteLegs(route.legs).reduce((total, leg) => total + (leg.dwellAfterMin ?? 0), 0);
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

function normalizeRouteCoords(coords: unknown): LatLngTuple[] {
  if (!Array.isArray(coords)) return [];
  return coords.filter((coord): coord is LatLngTuple => {
    if (!Array.isArray(coord) || coord.length < 2) return false;
    const [lat, lng] = coord;
    return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
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
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRouteMidpoint(coords: LatLngTuple[]): WeatherPoint | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return { lat: coords[0][0], lng: coords[0][1] };
  const segmentDistances = coords.slice(1).map((coord, index) => distanceMeters(coords[index], coord));
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  if (totalDistance === 0) {
    const middle = coords[Math.floor(coords.length / 2)];
    return { lat: middle[0], lng: middle[1] };
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
  return { lat: last[0], lng: last[1] };
}

function getDepartureOptions(trip: StoredTripHistory): DepartureOptions {
  if (trip.departureMode === "scheduled" && (trip.scheduledAt instanceof Date || typeof trip.scheduledAt === "string")) {
    const parsed = new Date(trip.scheduledAt);
    if (!Number.isNaN(parsed.getTime())) {
      return { mode: "scheduled", scheduledAt: parsed.toISOString() };
    }
  }
  return { mode: "now" };
}

function sampleTrafficPoints(coords: LatLngTuple[]): TrafficPoint[] | null {
  const sampleCount = Math.min(10, coords.length);
  if (sampleCount < 2) return null;
  const points: TrafficPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const coordinateIndex = Math.round((index * (coords.length - 1)) / (sampleCount - 1));
    const coordinate = coords[coordinateIndex];
    if (coordinate) points.push({ lat: coordinate[0], lng: coordinate[1] });
  }
  return points.length >= 2 ? points : null;
}

export async function loadFareTripContext(
  userId: string,
  tripHistoryId: string,
  routeId: string,
): Promise<FareTripLoadResult> {
  await connectMongoDB();
  const trip = (await TripHistory.findOne({ _id: tripHistoryId, userId }).lean()) as StoredTripHistory | null;
  if (!trip) return { ok: false, status: 404, message: "Trip history was not found." };

  const routeOptions = Array.isArray(trip.routeOptions) ? trip.routeOptions : [];
  const selectedRoute =
    routeOptions.find((route) => route.routeId === routeId) ??
    (trip.selectedRoute?.routeId === routeId ? trip.selectedRoute : null);
  if (!selectedRoute) return { ok: false, status: 404, message: "Route was not found for this trip." };

  const distanceKm = selectedRoute.distanceKm;
  const durationMin = selectedRoute.durationMin;
  const passengers = trip.passengerCount;
  if (
    !isFinitePositiveNumber(distanceKm) ||
    !isFinitePositiveNumber(durationMin) ||
    !isValidPassengerCount(passengers)
  ) {
    return { ok: false, status: 422, message: "Stored trip route is missing fare metrics." };
  }

  const routeCoords = normalizeRouteCoords(selectedRoute.coords);
  const country = resolveCountry(trip.country);
  const departure = getDepartureOptions(trip);
  const start = routeCoords[0]
    ? { lat: routeCoords[0][0], lng: routeCoords[0][1] }
    : toMapPoint(trip.origin);
  return {
    ok: true,
    context: {
      trip,
      selectedRoute,
      country,
      timeZone: getTripTimeZone(trip.timeZone, country),
      distanceKm,
      durationMin,
      passengers,
      dwellDurationMin: getRouteDwellDurationMin(selectedRoute),
      travelDurationMin: getRouteTravelDurationMin(selectedRoute, durationMin),
      routeCoords,
      routeMidpoint: getRouteMidpoint(routeCoords),
      departure,
      isPeakHour: isDeparturePeakHour(start, departure, country),
    },
  };
}

export async function getFareTripWeather(context: FareTripContext) {
  const source = context.routeMidpoint ? "route_midpoint" : "dhaka_fallback";
  const point = context.routeMidpoint ?? COUNTRY_CONFIG[context.country].fallbackWeatherPoint;
  try {
    // The current reading for a trip leaving now, the forecast for one
    // scheduled later.
    const reading = await fetchWeatherForDeparture(point, context.departure);
    return {
      weather: { source, ...reading } as FareWeather,
      weatherUnavailable: false,
    };
  } catch (error) {
    console.warn("Weather lookup failed:", error);
    return { weather: null, weatherUnavailable: true };
  }
}

export async function getFareTripTraffic(context: FareTripContext): Promise<{
  traffic: TripTrafficResult | null;
  trafficUnavailable: boolean;
}> {
  // Not an outage, so nothing to request and nothing to log.
  if (!hasLiveTraffic(context.country)) return { traffic: null, trafficUnavailable: true };
  const points = sampleTrafficPoints(context.routeCoords);
  if (!points) return { traffic: null, trafficUnavailable: true };
  try {
    const traffic = await getTrafficForTrip(points, context.departure, context.country);
    return { traffic, trafficUnavailable: false };
  } catch (error) {
    if (error instanceof TrafficServiceError) {
      console.warn("Traffic lookup failed:", error.message);
    } else {
      console.warn("Traffic lookup failed:", error);
    }
    return { traffic: null, trafficUnavailable: true };
  }
}

/**
 * What a fare is adjusted for. A missing traffic reading leaves the congestion
 * level null — no adjustment, rather than an assumed "low" — while the
 * peak-hour flag still applies, because it never depended on the reading.
 *
 * Only a current weather reading adjusts a fare. A forecast is shown to the
 * user and changes no price: it is a prediction for a trip days away.
 */
export function getFareAdjustmentContext(
  context: FareTripContext,
  weather: FareWeather | null,
  traffic: TripTrafficResult | null,
) {
  return {
    weather: weather?.kind === "forecast" ? null : weather,
    traffic: {
      congestionLevel: traffic?.totals.congestionLevel ?? null,
      isPeakHour: context.isPeakHour,
    },
  };
}
