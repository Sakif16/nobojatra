import { formatTripDateTime } from "@/lib/trip-time";

/**
 * How a weather reading is described on screen. Kept apart from ./weather,
 * which is server-only, so every card words it the same way.
 */
export type WeatherReadingKind = "current" | "forecast";

type Reading = {
  kind?: WeatherReadingKind | null;
  forecastFor?: string | null;
};

/**
 * Says which of the two a reading is. A plan saved before the kind was
 * recorded was always a current reading.
 */
export function getWeatherReadingLabel(reading: Reading, timeZone: string) {
  if (reading.kind === "forecast" && reading.forecastFor) {
    return `Forecast for ${formatTripDateTime(reading.forecastFor, timeZone, { year: false })}`;
  }

  return "Current conditions";
}

/** What a forecast does and does not change, for the screens that show one. */
export const FORECAST_ADVISORY =
  "A forecast is a prediction and can change before you leave. It is shown for information: it does not change fares or remove any vehicle.";

/**
 * What the severity figure is. Shown next to it because the number looks more
 * authoritative than the rule behind it: a weighted blend in which heavy rain
 * with calm wind and clear visibility only rates "moderate".
 */
export const WEATHER_SEVERITY_LIMITS =
  "Severity is a rough blend of rain, wind and visibility, not a safety assessment. Flooding, lightning and road closures are not considered, and heavy rain on its own rates as moderate.";
