import { reportFailure } from "@/lib/error-reporting";
import { withRequestLogging } from "@/lib/error-reporting";
import { auth } from "@/lib/auth";
import { COUNTRY_CONFIG } from "@/lib/country-config";
import { createTripConfirmedAlert } from "@/lib/alerts";
import { estimateFaresForRates } from "@/lib/fare-providers";
import {
  getFareAdjustmentContext,
  getFareTripTraffic,
  getFareTripWeather,
  getLocationLabel,
  loadFareTripContext,
} from "@/lib/fare-trip-context";
import { getWeatherVehicleRestriction } from "@/lib/weather";
import { saveVehicleSelection } from "@/lib/trip-history";
import VehicleRate from "@/models/VehicleRate";
import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { readJsonObject } from "@/lib/request-body";

type SelectRequestBody = {
  tripHistoryId?: unknown;
  routeId?: unknown;
  provider?: unknown;
  vehicleType?: unknown;
};

async function handlePost(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  const parsed = await readJsonObject<SelectRequestBody>(req);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const body = parsed.body;

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

  const loaded = await loadFareTripContext(session.user.id, tripHistoryId, routeId);
  if (!loaded.ok) {
    return NextResponse.json(
      { success: false, message: loaded.message },
      { status: loaded.status },
    );
  }

  const context = loaded.context;
  const {
    trip,
    country,
    distanceKm,
    durationMin,
    passengers,
    dwellDurationMin,
    travelDurationMin,
  } = context;

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

  const { weather, weatherUnavailable } = await getFareTripWeather(context);

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

  const { traffic: trafficResult, trafficUnavailable } = await getFareTripTraffic(context);
  const traffic = trafficResult
    ? {
        congestionIndexPercent: trafficResult.totals.congestionIndexPercent,
        congestionLevel: trafficResult.totals.congestionLevel,
        isPeakHour: trafficResult.isPeakHour,
        durationInTrafficMin:
          Math.round(trafficResult.totals.durationInTrafficSec / 60) + dwellDurationMin,
        baselineDurationMin:
          Math.round(trafficResult.totals.baselineDurationSec / 60) + dwellDurationMin,
      }
    : null;

  const [fareEstimate] = await estimateFaresForRates([rate], {
    distanceKm,
    durationMin,
    adjustmentContext: getFareAdjustmentContext(context, weather, trafficResult),
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
      fareSource: fareEstimate.fareSource,
      fareSourceNote: fareEstimate.fareSourceNote,
    },
    snapshot: {
      weather: weather
        ? {
            source: weather.source,
            kind: weather.kind,
            forecastFor: weather.forecastFor,
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
    return NextResponse.json({ success: false, message: "Could not save this plan." }, { status: 404 });
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
    reportFailure("save_plan_notification", "mongodb", error);
  }

  return NextResponse.json({ success: true, tripHistoryId: saved.id });
}

export const POST = withRequestLogging("save_plan", "planner", handlePost);
