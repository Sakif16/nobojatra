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
import { getWeatherVehicleRestriction } from "@/lib/weather";
import {
  getPriorityWeights,
  rankRouteOptions,
  type ScorableOption,
  type TravelPriority,
} from "@/lib/route-scoring";
import connectMongoDB from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";

type FareRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
};

const TRAVEL_PRIORITIES = new Set<TravelPriority>(["time", "cost", "comfort"]);

function toTravelPriority(value: unknown): TravelPriority {
  return typeof value === "string" && TRAVEL_PRIORITIES.has(value as TravelPriority)
    ? (value as TravelPriority)
    : "time";
}

async function handlePost(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = await readJsonObject<FareRequestBody>(req);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const body = parsed.body;

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
  const [loaded, profile] = await Promise.all([
    loadFareTripContext(session.user.id, tripHistoryId, routeId),
    UserProfile.findOne({ userId: session.user.id })
      .select("defaultTravelPriority")
      .lean() as Promise<{ defaultTravelPriority?: unknown } | null>,
  ]);
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
    durationMin,
    passengers,
    dwellDurationMin,
    travelDurationMin,
    routeCoords,
    routeMidpoint,
  } = context;
  const [{ weather, weatherUnavailable }, { traffic, trafficUnavailable }] =
    await Promise.all([getFareTripWeather(context), getFareTripTraffic(context)]);
  const rates = (await VehicleRate.find({
    country,
    isActive: true,
  }).lean()) as VehicleRateDocument[];
  // One shared calculator prices every rate. Live provider lookups run
  // concurrently under a bound and each one is isolated, so a Pathao outage
  // degrades those two cards to a rate-card estimate instead of taking down
  // the Uber and CNG results with it.
  const fareEstimates = await estimateFaresForRates(rates, {
    distanceKm,
    durationMin,
    adjustmentContext: getFareAdjustmentContext(context, weather, traffic),
  });
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
      fareAdjustment: fareEstimate.fareAdjustment,
    });
  }

  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.fare.low - b.fare.low;
  });

  // The "Best overall" order. It used to be a page of its own
  // (/ranked-options) that priced the same options again; now it is worked
  // out here from the same estimates and sent with them. The profile's
  // travel priority sets the weights, and the scoring uses the live traffic
  // time where there is one. Options that cannot be used are not ranked.
  const scoringPriority = toTravelPriority(profile?.defaultTravelPriority);
  const ranked = rankRouteOptions({
    options: results satisfies ScorableOption[],
    baseDurationMin: traffic
      ? traffic.totals.durationInTrafficSec / 60 + dwellDurationMin
      : durationMin,
    baseTravelDurationMin: traffic
      ? traffic.totals.durationInTrafficSec / 60
      : travelDurationMin,
    dwellDurationMin,
    congestionLevel: traffic?.totals.congestionLevel ?? null,
    weatherBand: weather?.severityBand ?? null,
    priority: scoringPriority,
  });
  const rankingByKey = new Map(
    ranked.map((option, index) => [
      `${option.provider}-${option.vehicleType}`,
      {
        rank: index + 1,
        score: option.score,
        adjustedDurationMin: option.adjustedDurationMin,
        riskBand: option.riskBand,
        riskBasis: option.riskBasis,
        bestFor: option.bestFor,
        pros: option.pros,
        cons: option.cons,
      },
    ]),
  );
  const rankedResults = results.map((result) => ({
    ...result,
    ranking: rankingByKey.get(`${result.provider}-${result.vehicleType}`) ?? null,
  }));

  return NextResponse.json({
    success: true,
    // The country this trip was planned in — drives which currency the fare
    // panel renders and which service area it names.
    country,
    trip: {
      tripHistoryId,
      routeId,
      originLabel: getLocationLabel(trip.origin),
      destinationLabel: getLocationLabel(trip.destination),
      distanceKm,
      travelDurationMin,
      dwellDurationMin,
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
        travelDurationMin,
        dwellDurationMin,
        durationMin,
      },
    },
    weather,
    weatherUnavailable,
    timeZone: context.timeZone,
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
    results: rankedResults,
    scoringPriority,
    scoringWeights: getPriorityWeights(scoringPriority),
  });
}

export const POST = withRequestLogging("fare", "planner", handlePost);
