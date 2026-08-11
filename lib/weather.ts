import "server-only";

const DEFAULT_OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_COORDINATE_PRECISION = 3;
const WEATHER_CACHE_SCHEMA_VERSION = 2;
const OPENWEATHER_TIMEOUT_MS = 5_000;
const METERS_PER_SECOND_TO_KMH = 3.6;

export type WeatherSeverityBand = "low" | "moderate" | "severe";

export type WeatherPoint = {
  lat: number;
  lng: number;
};

export type NormalizedWeather = {
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

export class WeatherServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherServiceError";
  }
}

function getOpenWeatherApiKey() {
  return process.env.OPENWEATHER_API_KEY;
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
  return Math.max(0, toFiniteNumber(value?.["1h"]) ?? 0);
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

export function getWeatherVehicleRestriction(
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

  const normalized = {
    temperatureCelsius: Math.round(temperatureCelsius * 10) / 10,
    precipitationMmPerHour:
      getPrecipitationMmPerHour(payload.rain) +
      getPrecipitationMmPerHour(payload.snow),
    windKmh: Math.round(windMetersPerSecond * METERS_PER_SECOND_TO_KMH * 10) / 10,
    visibilityMeters:
      visibilityMeters !== null && visibilityMeters >= 0 ? visibilityMeters : null,
    observedAt: observedUnixSeconds
      ? new Date(observedUnixSeconds * 1000).toISOString()
      : cachedAt.toISOString(),
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
