// The three condition evaluators, plus the registry that dispatches to them.
//
// Each is a pure function of (condition, context) — no I/O — so the thresholds
// and messages can be reasoned about and tested without touching a provider.
import { TRAFFIC_LEVEL_LABELS } from "@/lib/routing";
import type { TrafficLevel } from "@/models/SavedTrip";
import type {
  ConditionEvaluator,
  ConditionInput,
  EvaluationContext,
  EvaluatorResult,
} from "./types";

/** Weather severity is scored 0–10 by lib/weather.ts (bands at 3.5 and 7). */
export const WEATHER_SEVERITY_MIN = 0;
export const WEATHER_SEVERITY_MAX = 10;
export const DEFAULT_WEATHER_THRESHOLD = 3.5;

export const DEFAULT_TRAFFIC_LEVEL: TrafficLevel = "high";

/** Percent move in either direction. */
export const DEFAULT_FARE_CHANGE_PERCENT = 15;
export const MIN_FARE_CHANGE_PERCENT = 1;
export const MAX_FARE_CHANGE_PERCENT = 100;

const TRAFFIC_LEVEL_ORDER: Record<TrafficLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const evaluateWeatherSeverity: ConditionEvaluator = (
  condition: ConditionInput,
  context: EvaluationContext,
): EvaluatorResult => {
  if (!context.weather) return null;

  const threshold = condition.threshold ?? DEFAULT_WEATHER_THRESHOLD;
  const value = context.weather.severityScore;
  const triggered = value >= threshold;

  const severity =
    context.weather.severityBand === "severe"
      ? "critical"
      : context.weather.severityBand === "moderate"
        ? "warning"
        : "info";

  return {
    triggered,
    value,
    severity,
    title: `Weather worsening on ${context.tripName}`,
    message:
      `Weather severity reached ${round(value)} of 10 (${context.weather.severityBand}) — ` +
      `${round(context.weather.precipitationMmPerHour)} mm/h rain, ` +
      `${Math.round(context.weather.windKmh)} km/h wind.`,
    thresholdLabel: `severity at or above ${round(threshold)}`,
  };
};

const evaluateTrafficLevel: ConditionEvaluator = (
  condition: ConditionInput,
  context: EvaluationContext,
): EvaluatorResult => {
  if (!context.traffic) return null;

  const target = condition.level ?? DEFAULT_TRAFFIC_LEVEL;
  const current = context.traffic.totals.congestionLevel;
  const triggered = TRAFFIC_LEVEL_ORDER[current] >= TRAFFIC_LEVEL_ORDER[target];

  const delayMin = Math.round(
    (context.traffic.totals.durationInTrafficSec -
      context.traffic.totals.baselineDurationSec) /
      60,
  );

  return {
    triggered,
    value: context.traffic.totals.congestionIndexPercent,
    severity: current === "severe" ? "critical" : current === "high" ? "warning" : "info",
    title: `${TRAFFIC_LEVEL_LABELS[current]} on ${context.tripName}`,
    message:
      `Congestion is ${current} (${Math.round(context.traffic.totals.congestionIndexPercent)}% over free-flow)` +
      (delayMin > 0 ? `, about ${delayMin} min slower than usual.` : ".") +
      (context.traffic.isPeakHour ? " Departure falls in Dhaka peak hours." : ""),
    thresholdLabel: `traffic at ${target} or worse`,
  };
};

const evaluateFareChange: ConditionEvaluator = (
  condition: ConditionInput,
  context: EvaluationContext,
): EvaluatorResult => {
  if (!context.fare || !context.baseline) return null;

  // applyFareBand() spreads ±10% around a midpoint, so the average of the
  // stored low/high recovers the midpoint the baseline was captured at.
  const baselineMid = (context.baseline.fareLow + context.baseline.fareHigh) / 2;

  if (baselineMid <= 0) return null;

  const percent = ((context.fare.mid - baselineMid) / baselineMid) * 100;
  const threshold = condition.threshold ?? DEFAULT_FARE_CHANGE_PERCENT;
  const triggered = Math.abs(percent) >= threshold;
  const direction = percent >= 0 ? "up" : "down";

  return {
    triggered,
    value: round(percent),
    // A cheaper trip is good news, so only a rise is worth a warning.
    severity: percent > 0 ? "warning" : "info",
    title: `Fare ${direction} ${Math.abs(round(percent))}% on ${context.tripName}`,
    message:
      `Estimated fare is now ${context.fare.low}–${context.fare.high} BDT, ` +
      `against a baseline of ${context.baseline.fareLow}–${context.baseline.fareHigh} BDT.`,
    thresholdLabel: `±${round(threshold)}% from baseline`,
  };
};

export const CONDITION_EVALUATORS = {
  weather_severity: evaluateWeatherSeverity,
  traffic_level: evaluateTrafficLevel,
  fare_change: evaluateFareChange,
} as const;
