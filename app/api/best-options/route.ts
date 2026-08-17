import { auth } from "@/lib/auth";
import { estimateFaresForRates } from "@/lib/fare-providers";
import connectMongoDB from "@/lib/mongodb";
import {
  fetchWeatherForPoint,
  getWeatherVehicleRestriction,
  type NormalizedWeather,
  type WeatherPoint,
} from "@/lib/weather";
import {
  getTrafficForTrip,
  TrafficServiceError,
  type DepartureOptions,
  type TrafficPoint,
  type TripTrafficResult,
} from "@/lib/traffic-service";
import { rankRouteOptions, type ScorableOption, type TravelPriority } from "@/lib/route-scoring";
import TripHistory from "@/models/TripHistory";
import UserProfile from "@/models/UserProfile";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const DHAKA_WEATHER_FALLBACK: WeatherPoint = { lat: 23.8103, lng: 90.4125 };
const DEFAULT_TRAVEL_PRIORITY: TravelPriority = "time";
const TRAVEL_PRIORITIES = new Set<TravelPriority>(["time", "cost", "comfort"]);

// ── Request body shape ──
type BestOptionsRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
  priority?: unknown;
};

// ── Stored document shapes (mirrors app/api/fares/route.ts, plus departure
// fields which fares/route.ts doesn't need but this route does, to build the
// TomTom departAt time) ──
type StoredLocation = { label?: unknown; lat?: unknown; lng?: unknown };
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
  origin?: StoredLocation;
  destination?: StoredLocation;
  stops?: StoredLocation[];
  passengerCount?: unknown;
  departureMode?: unknown;
  scheduledAt?: unknown;
  routeOptions?: StoredRoute[];
  selectedRoute?: StoredRoute | null;
};

type MapPoint = { lat: number; lng: number; label: string };
type RouteLeg = {
  startIndex: number;
  endIndex: number;
  color: string;
  distanceKm: number;
  durationMin: number;
  fromLabel?: string;
  toLabel?: string;
  dwellAfterMin?: number;
};
type LatLngTuple = [number, number];

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

type StoredUserProfile = {
  defaultTravelPriority?: unknown;
};

type WeatherSource = "route_midpoint" | "dhaka_fallback";
type FareWeather = NormalizedWeather & { source: WeatherSource };

// ── Helper functions — identical logic to app/api/fares/route.ts ──

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPassengerCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8;
}

function toTravelPriority(value: unknown): TravelPriority | null {
  return typeof value === "string" && TRAVEL_PRIORITIES.has(value as TravelPriority)
    ? (value as TravelPriority)
    : null;
}

function getLocationLabel(location: StoredLocation | undefined) {
  return typeof location?.label === "string" && location.label.trim()
    ? location.label
    : "Unknown place";
}

function toMapPoint(location: StoredLocation | undefined): MapPoint | null {
  const lat = location?.lat;
  const lng = location?.lng;
  if (typeof lat !== "number" || !Number.isFinite(lat) || typeof lng !== "number" || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng, label: getLocationLabel(location) };
}

function normalizeRouteLegs(legs: unknown): RouteLeg[] {
  if (!Array.isArray(legs)) return [];
  return legs.reduce<RouteLeg[]>((normalized, leg) => {
    if (!leg || typeof leg !== "object") return normalized;
    const candidate = leg as Partial<RouteLeg>;

    if (
      typeof candidate.startIndex === "number" &&
      typeof candidate.endIndex === "number" &&
      typeof candidate.color === "string"
    ) {
      normalized.push({
        startIndex: candidate.startIndex,
        endIndex: candidate.endIndex,
        color: candidate.color,
        distanceKm:
          typeof candidate.distanceKm === "number" &&
          Number.isFinite(candidate.distanceKm)
            ? candidate.distanceKm
            : 0,
        durationMin:
          typeof candidate.durationMin === "number" &&
          Number.isFinite(candidate.durationMin)
            ? candidate.durationMin
            : 0,
        ...(typeof candidate.fromLabel === "string"
          ? { fromLabel: candidate.fromLabel }
          : {}),
        ...(typeof candidate.toLabel === "string"
          ? { toLabel: candidate.toLabel }
          : {}),
        ...(typeof candidate.dwellAfterMin === "number" &&
        Number.isFinite(candidate.dwellAfterMin)
          ? { dwellAfterMin: candidate.dwellAfterMin }
          : {}),
      });
    }

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

  return normalizeRouteLegs(route.legs).reduce(
    (total, leg) => total + (leg.dwellAfterMin ?? 0),
    0,
  );
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

async function getRouteWeather(routeMidpoint: WeatherPoint | null) {
  const source: WeatherSource = routeMidpoint ? "route_midpoint" : "dhaka_fallback";
  const point = routeMidpoint ?? DHAKA_WEATHER_FALLBACK;
  try {
    const weather = await fetchWeatherForPoint(point);
    return { weather: { source, ...weather } satisfies FareWeather, weatherUnavailable: false };
  } catch (error) {
    console.warn("Weather lookup failed:", error);
    return { weather: null, weatherUnavailable: true };
  }
}

// Builds the DepartureOptions the traffic service expects, from whatever the
// trip was originally saved with. Falls back to "now" if scheduledAt is
// missing or invalid — matches the fallback style used everywhere else in
// this route (weather falls back to Dhaka centre the same way).
function getDepartureOptions(trip: StoredTripHistory): DepartureOptions {
  if (trip.departureMode === "scheduled" && typeof trip.scheduledAt === "string") {
    const parsed = new Date(trip.scheduledAt);
    if (!Number.isNaN(parsed.getTime())) {
      return { mode: "scheduled", scheduledAt: parsed.toISOString() };
    }
  }
  return { mode: "now" };
}

// Samples up to 10 evenly-spaced points along the route geometry to send to
// the TomTom Matrix API as leg boundaries — identical sampling strategy to
// getTrafficPointsForRoute() in MapDashboardSection.tsx, so the number this
// page shows is computed the same way as the one on the dashboard.
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

// Fetches real live traffic for the route. Non-blocking on failure — mirrors
// how weather failures are handled — so a TomTom outage degrades to "no
// traffic-based ranking adjustment" rather than a 500.
async function getRouteTraffic(
  coords: LatLngTuple[],
  departure: DepartureOptions,
): Promise<{ traffic: TripTrafficResult | null; trafficUnavailable: boolean }> {
  const points = sampleTrafficPoints(coords);

  if (!points) {
    return { traffic: null, trafficUnavailable: true };
  }

  try {
    const traffic = await getTrafficForTrip(points, departure);
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

// ── Main handler ──
export async function POST(req: NextRequest) {
  // Step 1: require a session — same guard as /api/fares
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  // Step 2: parse and validate the request body
  let body: BestOptionsRequestBody;
  try {
    body = (await req.json()) as BestOptionsRequestBody;
  } catch {
    return NextResponse.json({ success: false, message: "Request body must be valid JSON." }, { status: 400 });
  }

  const tripHistoryId = typeof body.tripHistoryId === "string" ? body.tripHistoryId.trim() : "";
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";

  if (!Types.ObjectId.isValid(tripHistoryId) || !routeId) {
    return NextResponse.json(
      { success: false, message: "A valid tripHistoryId and routeId are required." },
      { status: 400 },
    );
  }

  await connectMongoDB();

  // Step 3: load the trip and scoring preference for this user. The trip query
  // stays owner-scoped, which prevents reading someone else's trip. A request
  // priority overrides the profile default for interactive re-scoring.
  const [trip, profile] = (await Promise.all([
    TripHistory.findOne({
      _id: tripHistoryId,
      userId: session.user.id,
    }).lean(),
    UserProfile.findOne({ userId: session.user.id }).select("defaultTravelPriority").lean(),
  ])) as [StoredTripHistory | null, StoredUserProfile | null];

  const travelPriority =
    toTravelPriority(body.priority) ??
    toTravelPriority(profile?.defaultTravelPriority) ??
    DEFAULT_TRAVEL_PRIORITY;

  if (!trip) {
    return NextResponse.json({ success: false, message: "Trip history was not found." }, { status: 404 });
  }

  // Step 4: find the specific route the user picked, inside that trip
  const routeOptions = Array.isArray(trip.routeOptions) ? trip.routeOptions : [];
  const selectedRoute =
    routeOptions.find((route) => route.routeId === routeId) ??
    (trip.selectedRoute?.routeId === routeId ? trip.selectedRoute : null);

  if (!selectedRoute) {
    return NextResponse.json({ success: false, message: "Route was not found for this trip." }, { status: 404 });
  }

  const distanceKm = selectedRoute.distanceKm;
  const storedDurationMin = selectedRoute.durationMin;
  const passengers = trip.passengerCount;

  if (!isFinitePositiveNumber(distanceKm) || !isFinitePositiveNumber(storedDurationMin) || !isValidPassengerCount(passengers)) {
    return NextResponse.json(
      { success: false, message: "Stored trip route is missing fare metrics." },
      { status: 422 },
    );
  }

  const dwellDurationMin = getRouteDwellDurationMin(selectedRoute);
  const travelDurationMin = getRouteTravelDurationMin(selectedRoute, storedDurationMin);

  const routeCoords = normalizeRouteCoords(selectedRoute.coords);
  const routeMidpoint = getRouteMidpoint(routeCoords);

  // Step 5: fetch weather at the route's midpoint (same approach as fares)
  const { weather, weatherUnavailable } = await getRouteWeather(routeMidpoint);

  // Step 6: fetch REAL live traffic for this route from TomTom
  const departure = getDepartureOptions(trip);
  const { traffic, trafficUnavailable } = await getRouteTraffic(routeCoords, departure);

  // The car-baseline duration used for scoring: live TomTom duration when
  // available, otherwise the ORS estimate stored on the trip. This is the
  // number every vehicle's adjustedDurationMin gets computed from.
  const baseDurationMinForScoring = traffic
    ? traffic.totals.durationInTrafficSec / 60 + dwellDurationMin
    : storedDurationMin;
  const baseTravelDurationMinForScoring = traffic
    ? traffic.totals.durationInTrafficSec / 60
    : travelDurationMin;

  // Falls back to "low" only when traffic genuinely couldn't be read, so a
  // TomTom outage doesn't silently inflate every option's risk score
  const congestionLevel = traffic?.totals.congestionLevel ?? "low";

  // Step 7: compute a fare + eligibility + weather-restriction entry for every
  // active vehicle — same math as /api/fares
  const rates = (await VehicleRate.find({ isActive: true }).lean()) as VehicleRateDocument[];
  // Same shared calculator /api/fares uses, so a vehicle costs the same on
  // both pages. Provider failures fall back to the rate card rather than
  // dropping the option, so the ranked set no longer shrinks during a Pathao
  // outage while the fares page still lists those vehicles.
  const fareEstimates = await estimateFaresForRates(rates, {
    distanceKm,
    durationMin: storedDurationMin,
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
  const scorable: ScorableOption[] = [];

  for (const [index, rate] of rates.entries()) {
    const eligible = passengers <= rate.maxPassengers;
    const fareEstimate = fareEstimates[index];

    const weatherRestriction = weather
      ? getWeatherVehicleRestriction({ provider: rate.provider, vehicleType: rate.vehicleType }, weather)
      : { weatherRestricted: false, weatherBlocked: false, restrictionReason: null };

    scorable.push({
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
      fareSource: fareEstimate.fareSource,
      fareSourceNote: fareEstimate.fareSourceNote,
      fareAdjustment: fareEstimate.fareAdjustment,
    });
  }

  // Step 8: run the scoring engine — the actual "AI Route Scoring Engine" the
  // SRS describes, producing the ranked top 3. Bikes get hard-excluded above
  // (via weatherBlocked) on severe weather; here they get rewarded relative
  // to cars when congestionLevel is high/severe.
  const rankedOptions = rankRouteOptions({
    options: scorable,
    baseDurationMin: baseDurationMinForScoring,
    baseTravelDurationMin: baseTravelDurationMinForScoring,
    dwellDurationMin,
    congestionLevel,
    weatherBand: weather?.severityBand ?? null,
    priority: travelPriority,
  });

  // Step 9: respond with everything the Route Comparison Display page needs —
  // trip context, map geometry, weather (for the dismissible banner), the
  // real traffic reading (for the risk badges + banner), and the ranked cards
  return NextResponse.json({
    success: true,
    trip: {
      tripHistoryId,
      routeId,
      originLabel: getLocationLabel(trip.origin),
      destinationLabel: getLocationLabel(trip.destination),
      distanceKm,
      travelDurationMin,
      dwellDurationMin,
      durationMin: storedDurationMin,
      passengers,
    },
    map: {
      origin: toMapPoint(trip.origin),
      destination: toMapPoint(trip.destination),
      stops: (Array.isArray(trip.stops) ? trip.stops : []).map(toMapPoint).filter((s): s is MapPoint => s !== null),
      route: {
        id: routeId,
        coords: routeCoords,
        legs: normalizeRouteLegs(selectedRoute.legs),
        distanceKm,
        travelDurationMin,
        dwellDurationMin,
        durationMin: storedDurationMin,
      },
    },
    weather,
    weatherUnavailable,
    scoringPriority: travelPriority,
    // Flattened for the client — only the totals, not the per-leg breakdown,
    // since the banner shows one trip-level reading, not a leg-by-leg table
    congestion: traffic
      ? {
          congestionIndexPercent: traffic.totals.congestionIndexPercent,
          congestionLevel: traffic.totals.congestionLevel,
          isPeakHour: traffic.isPeakHour,
          durationInTrafficMin: Math.round(traffic.totals.durationInTrafficSec / 60),
          baselineDurationMin: Math.round(traffic.totals.baselineDurationSec / 60),
        }
      : null,
    trafficUnavailable,
    options: rankedOptions,
    lastUpdated: new Date().toISOString(), // powers the "last updated" timestamp shown next to Refresh
  });
}
