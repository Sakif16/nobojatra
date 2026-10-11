import "server-only";
import { isConfigured } from "@/lib/env";

import { ProviderBudgetError, spendProviderBudget } from "@/lib/provider-budget";

const DEFAULT_OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_COORDINATE_PRECISION = 3;
const WEATHER_CACHE_SCHEMA_VERSION = 3;
// A forecast is revised a few times a day, so it can be kept longer than a
// current reading, and one download covers every departure at that point.
const FORECAST_CACHE_TTL_MS = 30 * 60 * 1000;
const FORECAST_STEP_HOURS = 3;
// A departure this close to now is described better by what is outside the
// window than by the next three-hour forecast step.
const CURRENT_READING_HORIZON_MS = 90 * 60 * 1000;
// The forecast ends a little under five days out. A departure up to one step
// past its last entry is still answered by that entry; anything later is not.
const FORECAST_MATCH_TOLERANCE_MS = FORECAST_STEP_HOURS * 60 * 60 * 1000;
const OPENWEATHER_TIMEOUT_MS = 5_000;
const METERS_PER_SECOND_TO_KMH = 3.6;

export type WeatherSeverityBand = "low" | "moderate" | "severe";

export type WeatherPoint = {
  lat: number;
  lng: number;
};

/**
 * Whether a reading is what the weather is now or what it is forecast to be.
 * The two look identical as numbers and mean different things: a current
 * reading says nothing about a trip on Friday, and a forecast is a prediction.
 */
export type WeatherKind = "current" | "forecast";

export type NormalizedWeather = {
  kind: WeatherKind;
  /** The time a forecast is for (ISO); null for a current reading. */
  forecastFor: string | null;
  temperatureCelsius: number;
  precipitationMmPerHour: number;
  windKmh: number;
  visibilityMeters: number | null;
  severityScore: number;
  severityBand: WeatherSeverityBand;
  observedAt: string;
  cachedAt: string;
};

export type WeatherVehicleInput = {
  provider: string;
  vehicleType: string;
};

export type WeatherVehicleRestriction = {
  weatherRestricted: boolean;
  weatherBlocked: boolean;
  restrictionReason: string | null;
};

type WeatherCacheEntry = {
  schemaVersion: number;
  expiresAt: number;
  data: NormalizedWeather;
};

type OpenWeatherPrecipitation = {
  "1h"?: unknown;
  /** Forecast entries report the total over their three-hour step. */
  "3h"?: unknown;
};

type OpenWeatherForecastResponse = {
  list?: OpenWeatherCurrentResponse[];
};

type ForecastCacheEntry = {
  expiresAt: number;
  entries: NormalizedWeather[];
};

type OpenWeatherCurrentResponse = {
  dt?: unknown;
  main?: {
    temp?: unknown;
  };
  visibility?: unknown;
  wind?: {
    speed?: unknown;
  };
  rain?: OpenWeatherPrecipitation;
  snow?: OpenWeatherPrecipitation;
};

const weatherCache = new Map<string, WeatherCacheEntry>();
const forecastCache = new Map<string, ForecastCacheEntry>();

export class WeatherServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherServiceError";
  }
}

function getOpenWeatherApiKey() {
  const value = process.env.OPENWEATHER_API_KEY;
  return isConfigured(value) ? value?.trim() : undefined;
}

function getOpenWeatherBaseUrl() {
  return (
    process.env.OPENWEATHER_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_OPENWEATHER_BASE_URL
  );
}

function isValidWeatherPoint(point: WeatherPoint) {
  return (
    Number.isFinite(point.lat) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    Number.isFinite(point.lng) &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function getCacheKey({ lat, lng }: WeatherPoint) {
  return [
    lat.toFixed(WEATHER_COORDINATE_PRECISION),
    lng.toFixed(WEATHER_COORDINATE_PRECISION),
  ].join(":");
}

function cleanupWeatherCache(now: number) {
  for (const [key, entry] of weatherCache.entries()) {
    if (entry.expiresAt <= now) {
      weatherCache.delete(key);
    }
  }
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCompleteNormalizedWeather(value: NormalizedWeather) {
  return (
    Number.isFinite(value.temperatureCelsius) &&
    Number.isFinite(value.precipitationMmPerHour) &&
    Number.isFinite(value.windKmh) &&
    Number.isFinite(value.severityScore) &&
    (value.visibilityMeters === null || Number.isFinite(value.visibilityMeters))
  );
}

function getPrecipitationMmPerHour(value: OpenWeatherPrecipitation | undefined) {
  const lastHour = toFiniteNumber(value?.["1h"]);

  if (lastHour !== null) return Math.max(0, lastHour);

  // A forecast step gives one total for its three hours; the severity score
  // is written for an hourly rate.
  const overStep = toFiniteNumber(value?.["3h"]);

  return overStep === null ? 0 : Math.max(0, overStep / FORECAST_STEP_HOURS);
}

function clampSeverityScore(score: number) {
  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

export function getPrecipitationSeverityScore(mmPerHour: number) {
  if (mmPerHour <= 0) return 0;
  if (mmPerHour <= 2) return 2;
  if (mmPerHour <= 7.5) return 5;
  if (mmPerHour <= 15) return 8;
  return 10;
}

export function getWindSeverityScore(kmh: number) {
  if (kmh < 15) return 0;
  if (kmh <= 30) return 3;
  if (kmh <= 45) return 6;
  return 9;
}

export function getVisibilitySeverityScore(visibilityMeters: number | null) {
  if (visibilityMeters === null) return 0;
  if (visibilityMeters > 5000) return 0;
  if (visibilityMeters >= 2000) return 3;
  if (visibilityMeters >= 1000) return 6;
  return 9;
}

export function getWeatherSeverityBand(score: number): WeatherSeverityBand {
  if (score >= 7) return "severe";
  if (score >= 3.5) return "moderate";
  return "low";
}

export function calculateWeatherSeverity({
  precipitationMmPerHour,
  windKmh,
  visibilityMeters,
}: Pick<
  NormalizedWeather,
  "precipitationMmPerHour" | "windKmh" | "visibilityMeters"
>) {
  const precipitationScore = getPrecipitationSeverityScore(
    precipitationMmPerHour,
  );
  const windScore = getWindSeverityScore(windKmh);
  const visibilityScore = getVisibilitySeverityScore(visibilityMeters);
  const severityScore = clampSeverityScore(
    precipitationScore * 0.5 + windScore * 0.3 + visibilityScore * 0.2,
  );

  return {
    severityScore,
    severityBand: getWeatherSeverityBand(severityScore),
  };
}

function isTwoWheeler({ vehicleType }: WeatherVehicleInput) {
  return vehicleType === "bike" || vehicleType === "moto";
}

function isCng({ provider, vehicleType }: WeatherVehicleInput) {
  return provider === "cng" || vehicleType === "auto";
}

function noWeatherRestriction(): WeatherVehicleRestriction {
  return {
    weatherRestricted: false,
    weatherBlocked: false,
    restrictionReason: null,
  };
}

/**
 * What the weather means for one vehicle.
 *
 * A current reading can take a vehicle off the list: it describes the trip
 * about to be made. A forecast cannot. It is a prediction for a trip days
 * away, so it only ever adds a caution, worded as a forecast, and leaves the
 * choice with the user.
 *
 * The wording stays general on purpose. The score behind it is a blend of
 * rain, wind and visibility, not a judgement about safety.
 */
export function getWeatherVehicleRestriction(
  vehicle: WeatherVehicleInput,
  weather: Pick<NormalizedWeather, "severityScore" | "severityBand"> & { kind?: WeatherKind },
): WeatherVehicleRestriction {
  const restriction = getCurrentWeatherRestriction(vehicle, weather);

  if (weather.kind !== "forecast" || !restriction.weatherRestricted) {
    return restriction;
  }

  return {
    weatherRestricted: true,
    weatherBlocked: false,
    restrictionReason: restriction.weatherBlocked
      ? "Severe weather is forecast for this departure. This vehicle may not be suitable."
      : "Rain, wind, or low visibility is forecast for this departure.",
  };
}

function getCurrentWeatherRestriction(
  vehicle: WeatherVehicleInput,
  weather: Pick<NormalizedWeather, "severityScore" | "severityBand">,
): WeatherVehicleRestriction {
  if (isTwoWheeler(vehicle)) {
    if (weather.severityBand === "severe") {
      return {
        weatherRestricted: true,
        weatherBlocked: true,
        restrictionReason: "Bike services are blocked due to severe weather.",
      };
    }

    if (weather.severityBand === "moderate") {
      return {
        weatherRestricted: true,
        weatherBlocked: false,
        restrictionReason:
          "Rain, wind, or low visibility may affect two-wheelers.",
      };
    }

    return noWeatherRestriction();
  }

  if (isCng(vehicle)) {
    if (weather.severityScore >= 9) {
      return {
        weatherRestricted: true,
        weatherBlocked: true,
        restrictionReason: "CNG is blocked due to extreme weather conditions.",
      };
    }

    return noWeatherRestriction();
  }

  if (weather.severityBand === "severe") {
    return {
      weatherRestricted: true,
      weatherBlocked: false,
      restrictionReason: "Severe weather may affect travel time and availability.",
    };
  }

  return noWeatherRestriction();
}

function normalizeWeatherResponse(
  payload: OpenWeatherCurrentResponse,
  cachedAt: Date,
  kind: WeatherKind = "current",
): NormalizedWeather {
  const windMetersPerSecond = toFiniteNumber(payload.wind?.speed);
  const temperatureCelsius = toFiniteNumber(payload.main?.temp);
  const visibilityMeters = toFiniteNumber(payload.visibility);
  const observedUnixSeconds = toFiniteNumber(payload.dt);

  if (temperatureCelsius === null) {
    throw new WeatherServiceError("OpenWeatherMap response is missing temperature.");
  }

  if (windMetersPerSecond === null) {
    throw new WeatherServiceError("OpenWeatherMap response is missing wind speed.");
  }

  const entryTime = observedUnixSeconds
    ? new Date(observedUnixSeconds * 1000).toISOString()
    : null;

  const normalized = {
    kind,
    // For a forecast entry `dt` is the time it is for, not when it was read.
    forecastFor: kind === "forecast" ? entryTime : null,
    temperatureCelsius: Math.round(temperatureCelsius * 10) / 10,
    precipitationMmPerHour:
      getPrecipitationMmPerHour(payload.rain) +
      getPrecipitationMmPerHour(payload.snow),
    windKmh: Math.round(windMetersPerSecond * METERS_PER_SECOND_TO_KMH * 10) / 10,
    visibilityMeters:
      visibilityMeters !== null && visibilityMeters >= 0 ? visibilityMeters : null,
    observedAt:
      kind === "current" && entryTime ? entryTime : cachedAt.toISOString(),
    cachedAt: cachedAt.toISOString(),
  };

  return {
    ...normalized,
    ...calculateWeatherSeverity(normalized),
  };
}

export async function fetchWeatherForPoint(
  point: WeatherPoint,
): Promise<NormalizedWeather> {
  if (!isValidWeatherPoint(point)) {
    throw new WeatherServiceError("Weather point coordinates are invalid.");
  }

  const now = Date.now();
  cleanupWeatherCache(now);

  const cacheKey = getCacheKey(point);
  const cached = weatherCache.get(cacheKey);

  if (
    cached &&
    cached.schemaVersion === WEATHER_CACHE_SCHEMA_VERSION &&
    cached.expiresAt > now &&
    isCompleteNormalizedWeather(cached.data)
  ) {
    return cached.data;
  }

  const apiKey = getOpenWeatherApiKey();

  if (!apiKey) {
    throw new WeatherServiceError("OPENWEATHER_API_KEY is not set.");
  }

  const url = new URL(`${getOpenWeatherBaseUrl()}/weather`);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");

  // A spent budget reads as weather being unavailable, which every caller
  // already shows as such.
  try {
    await spendProviderBudget("openweather");
  } catch (error) {
    if (!(error instanceof ProviderBudgetError)) throw error;

    throw new WeatherServiceError(error.message);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(OPENWEATHER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WeatherServiceError(
      error instanceof Error
        ? `OpenWeatherMap request failed: ${error.message}`
        : "OpenWeatherMap request failed.",
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new WeatherServiceError(
      `OpenWeatherMap returned ${response.status}${
        details ? `: ${details.slice(0, 160)}` : ""
      }`,
    );
  }

  let payload: OpenWeatherCurrentResponse;

  try {
    payload = (await response.json()) as OpenWeatherCurrentResponse;
  } catch {
    throw new WeatherServiceError("OpenWeatherMap response was not valid JSON.");
  }

  const weather = normalizeWeatherResponse(payload, new Date(now));

  weatherCache.set(cacheKey, {
    schemaVersion: WEATHER_CACHE_SCHEMA_VERSION,
    expiresAt: now + WEATHER_CACHE_TTL_MS,
    data: weather,
  });

  return weather;
}

async function fetchForecastEntries(point: WeatherPoint, now: number) {
  for (const [key, entry] of forecastCache.entries()) {
    if (entry.expiresAt <= now) forecastCache.delete(key);
  }

  const cacheKey = getCacheKey(point);
  const cached = forecastCache.get(cacheKey);

  if (cached) return cached.entries;

  const apiKey = getOpenWeatherApiKey();

  if (!apiKey) {
    throw new WeatherServiceError("OPENWEATHER_API_KEY is not set.");
  }

  const url = new URL(`${getOpenWeatherBaseUrl()}/forecast`);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");

  try {
    await spendProviderBudget("openweather");
  } catch (error) {
    if (!(error instanceof ProviderBudgetError)) throw error;

    throw new WeatherServiceError(error.message);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(OPENWEATHER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new WeatherServiceError(
      error instanceof Error
        ? `OpenWeatherMap forecast request failed: ${error.message}`
        : "OpenWeatherMap forecast request failed.",
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new WeatherServiceError(
      `OpenWeatherMap forecast returned ${response.status}${
        details ? `: ${details.slice(0, 160)}` : ""
      }`,
    );
  }

  let payload: OpenWeatherForecastResponse;

  try {
    payload = (await response.json()) as OpenWeatherForecastResponse;
  } catch {
    throw new WeatherServiceError("OpenWeatherMap forecast was not valid JSON.");
  }

  const fetchedAt = new Date(now);
  const entries = (Array.isArray(payload.list) ? payload.list : []).flatMap((entry) => {
    try {
      const weather = normalizeWeatherResponse(entry, fetchedAt, "forecast");
      return weather.forecastFor ? [weather] : [];
    } catch {
      // One malformed step does not spoil the rest of the forecast.
      return [];
    }
  });

  forecastCache.set(cacheKey, { expiresAt: now + FORECAST_CACHE_TTL_MS, entries });

  return entries;
}

/**
 * The forecast for one moment at a point: the three-hour step nearest to it.
 * Throws when the moment is beyond what the forecast covers.
 */
export async function fetchForecastForPoint(
  point: WeatherPoint,
  at: Date,
  now = Date.now(),
): Promise<NormalizedWeather> {
  if (!isValidWeatherPoint(point)) {
    throw new WeatherServiceError("Weather point coordinates are invalid.");
  }

  const entries = await fetchForecastEntries(point, now);
  const target = at.getTime();
  let nearest: NormalizedWeather | null = null;
  let nearestGap = Infinity;

  for (const entry of entries) {
    const gap = Math.abs(new Date(entry.forecastFor as string).getTime() - target);

    if (gap < nearestGap) {
      nearest = entry;
      nearestGap = gap;
    }
  }

  if (!nearest || nearestGap > FORECAST_MATCH_TOLERANCE_MS) {
    throw new WeatherServiceError("No forecast is available for that departure time.");
  }

  return nearest;
}

/**
 * The weather that describes a trip: the current reading for one leaving now
 * or within the next hour and a half, and the forecast for one scheduled
 * later. A current reading says nothing useful about a departure on Friday.
 */
export async function fetchWeatherForDeparture(
  point: WeatherPoint,
  departure: { mode: "now" } | { mode: "scheduled"; scheduledAt: string },
  now = Date.now(),
): Promise<NormalizedWeather> {
  if (departure.mode === "now") return fetchWeatherForPoint(point);

  const scheduledAt = new Date(departure.scheduledAt);

  if (
    Number.isNaN(scheduledAt.getTime()) ||
    scheduledAt.getTime() - now <= CURRENT_READING_HORIZON_MS
  ) {
    return fetchWeatherForPoint(point);
  }

  return fetchForecastForPoint(point, scheduledAt, now);
}
