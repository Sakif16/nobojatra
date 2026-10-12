import { withRequestLogging } from "@/lib/error-reporting";
import { auth } from "@/lib/auth";
import { estimateFaresForRates } from "@/lib/fare-providers";
import {
  getFareAdjustmentContext,
  getFareTripTraffic,
  getFareTripWeather,
  getLocationLabel,
  loadFareTripContext,
  normalizeRouteLegs,
  toMapPoint,
  type MapPoint,
  type VehicleRateDocument,
} from "@/lib/fare-trip-context";
import connectMongoDB from "@/lib/mongodb";
import {
  getPriorityWeights,
  rankRouteOptions,
  type ScorableOption,
  type TravelPriority,
} from "@/lib/route-scoring";
import { getWeatherVehicleRestriction } from "@/lib/weather";
import UserProfile from "@/models/UserProfile";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";

const DEFAULT_TRAVEL_PRIORITY: TravelPriority = "time";
const TRAVEL_PRIORITIES = new Set<TravelPriority>(["time", "cost", "comfort"]);

type BestOptionsRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
  priority?: unknown;
};

type StoredUserProfile = { defaultTravelPriority?: unknown };

function toTravelPriority(value: unknown): TravelPriority | null {
  return typeof value === "string" && TRAVEL_PRIORITIES.has(value as TravelPriority)
    ? (value as TravelPriority)
    : null;
}

async function handlePost(req: NextRequest) {
  // Step 1: require a session — same guard as /api/fares
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  // Step 2: parse and validate the request body
  const parsed = await readJsonObject<BestOptionsRequestBody>(req);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const body = parsed.body;

  const tripHistoryId = typeof body.tripHistoryId === "string" ? body.tripHistoryId.trim() : "";
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";

  if (!Types.ObjectId.isValid(tripHistoryId) || !routeId) {
    return NextResponse.json(
      { success: false, message: "A valid tripHistoryId and routeId are required." },
      { status: 400 },
    );
  }

  await connectMongoDB();
  const [loaded, profile] = await Promise.all([
    loadFareTripContext(session.user.id, tripHistoryId, routeId),
    UserProfile.findOne({ userId: session.user.id }).select("defaultTravelPriority").lean() as Promise<StoredUserProfile | null>,
  ]);

  const travelPriority =
    toTravelPriority(body.priority) ??
    toTravelPriority(profile?.defaultTravelPriority) ??
    DEFAULT_TRAVEL_PRIORITY;

  if (!loaded.ok) {
    return NextResponse.json(
      { success: false, message: loaded.message },
      { status: loaded.status },
    );
  }

  const context = loaded.context;
  const {
    trip,
    selectedRoute,
    country,
    distanceKm,
    durationMin: storedDurationMin,
    passengers,
    dwellDurationMin,
    travelDurationMin,
    routeCoords,
  } = context;
  const { weather, weatherUnavailable } = await getFareTripWeather(context);
  const { traffic, trafficUnavailable } = await getFareTripTraffic(context);

  // The car-baseline duration used for scoring: live TomTom duration when
  // available, otherwise the ORS estimate stored on the trip. This is the
  // number every vehicle's adjustedDurationMin gets computed from.
  const baseDurationMinForScoring = traffic
    ? traffic.totals.durationInTrafficSec / 60 + dwellDurationMin
    : storedDurationMin;
  const baseTravelDurationMinForScoring = traffic
    ? traffic.totals.durationInTrafficSec / 60
    : travelDurationMin;

  // Null when there is no reading — an outage, or a country with no live
  // traffic. The ranking then leaves traffic out rather than scoring the trip
  // as if the roads were clear.
  const congestionLevel = traffic?.totals.congestionLevel ?? null;

  // Step 7: compute a fare + eligibility + weather-restriction entry for every
  // active vehicle — same math as /api/fares
  const rates = (await VehicleRate.find({ country, isActive: true }).lean()) as VehicleRateDocument[];
  // Same shared calculator /api/fares uses, so a vehicle costs the same on
  // both pages. Provider failures fall back to the rate card rather than
  // dropping the option, so the ranked set no longer shrinks during a Pathao
  // outage while the fares page still lists those vehicles.
  const fareEstimates = await estimateFaresForRates(rates, {
    distanceKm,
    durationMin: storedDurationMin,
    adjustmentContext: getFareAdjustmentContext(context, weather, traffic),
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
    // Drives which currency the comparison UI renders.
    country,
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
    timeZone: context.timeZone,
    scoringPriority: travelPriority,
    // The whole ranking rule, for the screen to state alongside the order.
    scoringWeights: getPriorityWeights(travelPriority),
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

export const POST = withRequestLogging("ranking", "planner", handlePost);
