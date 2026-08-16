// Shared types for the alert evaluator.
//
// Lives under lib/alert-evaluator/ rather than lib/alerts/ so it cannot be
// confused with lib/alerts.ts, which is the storage layer this writes through.
import type { AlertSeverity } from "@/lib/alerts";
import type { FareSource } from "@/lib/fare-providers";
import type { TripTrafficResult } from "@/lib/traffic-service";
import type { TripLocation } from "@/lib/trip-input";
import type { NormalizedWeather } from "@/lib/weather";
import type { AlertConditionType, TrafficLevel } from "@/models/SavedTrip";

/**
 * Everything the three evaluators need, gathered once per trip.
 *
 * Each provider field is independently nullable: a weather outage must not
 * stop a traffic condition from being judged. A null field means "unknown",
 * which is different from "false" — see EvaluatorResult.
 */
export type EvaluationContext = {
  tripName: string;
  distanceKm: number;
  /** Fresh duration from this run's routing call, not the stored snapshot. */
  durationMin: number;
  weather: NormalizedWeather | null;
  traffic: TripTrafficResult | null;
  fare: { low: number; mid: number; high: number; source: FareSource } | null;
  baseline: { fareLow: number; fareHigh: number; durationMin: number } | null;
};

/** The subset of a stored condition an evaluator reads. */
export type ConditionInput = {
  type: AlertConditionType;
  threshold: number | null;
  level: TrafficLevel | null;
};

/**
 * `null` means the evaluator could not judge — the provider it depends on was
 * unavailable, or the trip lacks the data the condition needs.
 *
 * This is deliberately distinct from `{ triggered: false }`. Treating an
 * outage as "not triggered" would clear the condition's lastState, and the
 * next successful run would then re-fire an alert the user has already seen.
 */
export type EvaluatorResult = {
  triggered: boolean;
  /** The measured value that was compared against the threshold. */
  value: number;
  title: string;
  message: string;
  severity: AlertSeverity;
  thresholdLabel: string;
} | null;

export type ConditionEvaluator = (
  condition: ConditionInput,
  context: EvaluationContext,
) => EvaluatorResult;

/** The stored shape the evaluator reads and mutates. */
export type SavedTripCondition = {
  _id: unknown;
  type: AlertConditionType;
  threshold?: number | null;
  level?: TrafficLevel | null;
  isActive?: boolean;
  lastState?: boolean;
  lastTriggeredAt?: Date | null;
};

export type SavedTripDocument = {
  _id: unknown;
  userId: string;
  name: string;
  origin: TripLocation;
  destination: TripLocation;
  stops: TripLocation[];
  departureMode: "now" | "scheduled";
  scheduledAt: Date | null;
  preferredVehicle: { vehicleRateId: unknown } | null;
  route: { distanceKm: number; durationMin: number; coords: [number, number][] } | null;
  baseline: { fareLow: number; fareHigh: number; durationMin: number } | null;
  conditions: SavedTripCondition[];
  isActive?: boolean;
  lastEvaluatedAt?: Date | null;
  save: () => Promise<unknown>;
};

export type TripEvaluationSummary = {
  savedTripId: string;
  tripName: string;
  conditionsEvaluated: number;
  conditionsSkipped: number;
  alertsCreated: number;
  /** Why a provider was unavailable, when one was. */
  notes: string[];
};
