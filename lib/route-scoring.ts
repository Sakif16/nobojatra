import "server-only";
import type { FareAdjustment, FareSource } from "@/lib/fare-providers";
import type { CongestionLevel } from "@/lib/traffic-service";

// The three risk tiers shown as the card's colour-coded risk badge
export type RiskBand = "low" | "moderate" | "high";
/**
 * Which readings a risk band was actually worked out from. A band built from
 * weather alone says nothing about the roads, and one built from neither is
 * not an assessment at all — the UI must label it by this, never as a bare
 * "low risk".
 */
export type RiskBasis = "weather_and_traffic" | "weather" | "traffic" | "none";
export type TravelPriority = "time" | "cost" | "comfort";
type BestForTag = "Speed" | "Budget" | "Comfort";
type MetricScores = { cost: number; time: number; comfort: number };

// Shape of one fare option coming IN from the existing fares computation —
// matches the objects already built in app/api/fares/route.ts
export interface ScorableOption {
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  comfortScore: number;
  eligible: boolean;
  weatherRestricted: boolean;
  weatherBlocked: boolean;
  restrictionReason: string | null;
  fare: { low: number; mid: number; high: number };
  fareSource: FareSource;
  fareSourceNote: string | null;
  fareAdjustment: FareAdjustment | null;
}
export interface RankedOption extends ScorableOption {
  // An estimate, not a reading: the car-route time (with traffic when there is
  // a reading) scaled by a fixed factor for the vehicle class. Nothing measures
  // how long a bike or a CNG actually takes, so the UI labels it as estimated.
  adjustedDurationMin: number;
  riskBand: RiskBand;                        // risk from whichever of weather/traffic was readable
  riskBasis: RiskBasis;                      // which of them that was
  // The metric this option leads the others on, or null when it leads none —
  // including when it is the only option, which leads nothing.
  bestFor: BestForTag | null;
  pros: string[];                            // up to 3 short chips
  cons: string[];                            // up to 2 short chips
  score: number;                             // internal weighted score used only for ranking
}

const DEFAULT_PRIORITY: TravelPriority = "time";

const PRIORITY_WEIGHTS: Record<TravelPriority, MetricScores> = {
  time: { time: 0.7, cost: 0.15, comfort: 0.15 },
  cost: { time: 0.15, cost: 0.7, comfort: 0.15 },
  comfort: { time: 0.15, cost: 0.15, comfort: 0.7 },
};

const BEST_FOR_BY_METRIC: Record<keyof MetricScores, BestForTag> = {
  time: "Speed",
  cost: "Budget",
  comfort: "Comfort",
};

// Duration multiplier table — how much of the real, car-based TomTom traffic
// duration each vehicle class actually experiences. Two-wheelers filter
// through congestion better than cars, so they get a smaller multiplier at
// the same congestion level; CNG sits in between. This is what lets the
// engine prefer bikes over cars specifically because of traffic, and is the
// only place vehicle type touches the real traffic number.
const DURATION_MULTIPLIERS: Record<"two_wheeler" | "cng" | "car", Record<CongestionLevel, number>> = {
  two_wheeler: { low: 1.0, moderate: 0.95, high: 0.88, severe: 0.8 },
  cng:         { low: 1.0, moderate: 1.0,  high: 1.05, severe: 1.12 },
  car:         { low: 1.0, moderate: 1.05, high: 1.15, severe: 1.3 },
};
// Note: two-wheeler multipliers go BELOW 1.0 at high/severe congestion —
// the TomTom duration is a car-route estimate, so a bike genuinely completes
// the same congested route faster than the reported car time.

function getVehicleClass(vehicleType: string): "two_wheeler" | "cng" | "car" {
  if (vehicleType === "bike" || vehicleType === "moto") return "two_wheeler";
  if (vehicleType === "auto") return "cng";
  return "car"; // go, premier, car, xl all behave like a car in traffic
}

// Normalizes a "lower is better" value (fare, duration) to a 0–1 score where
// 1 = best (cheapest/fastest) and 0 = worst in the candidate set
function normalizeLowerBetter(value: number, min: number, max: number): number {
  if (max === min) return 1; // avoid divide-by-zero when every candidate ties
  return (max - value) / (max - min);
}

// Normalizes a "higher is better" value (comfort) to a 0–1 score
function normalizeHigherBetter(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

/**
 * The share of the score each metric carries for a priority, so the screen can
 * state the rule that produced the order instead of implying something more.
 */
export function getPriorityWeights(priority: TravelPriority | null | undefined): MetricScores {
  return PRIORITY_WEIGHTS[normalizePriority(priority)];
}

function normalizePriority(priority: TravelPriority | null | undefined): TravelPriority {
  return priority && priority in PRIORITY_WEIGHTS ? priority : DEFAULT_PRIORITY;
}

/**
 * The "Best for" tag: a metric this option actually comes top on.
 *
 * It used to name the option's own strongest metric, so the slowest, dearest
 * option still read "Best for Speed" if speed was the least bad thing about
 * it. A tag is now a claim about the comparison: the option has the top value
 * for that metric and at least one other option is worse on it. An option that
 * leads several is tagged with the one the user asked to prioritise.
 */
function getBestForTag(
  leads: Record<keyof MetricScores, boolean>,
  priority: TravelPriority,
): BestForTag | null {
  const preference: Array<keyof MetricScores> = [priority, "time", "cost", "comfort"];
  const metric = preference.find((candidate) => leads[candidate]);

  return metric ? BEST_FOR_BY_METRIC[metric] : null;
}

function compareRankedOptions(
  first: RankedOption,
  second: RankedOption,
  priority: TravelPriority,
) {
  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > 0.0001) {
    return scoreDelta;
  }

  if (priority === "cost") {
    return (
      first.fare.mid - second.fare.mid ||
      first.adjustedDurationMin - second.adjustedDurationMin ||
      second.comfortScore - first.comfortScore
    );
  }

  if (priority === "comfort") {
    return (
      second.comfortScore - first.comfortScore ||
      first.adjustedDurationMin - second.adjustedDurationMin ||
      first.fare.mid - second.fare.mid
    );
  }

  return (
    first.adjustedDurationMin - second.adjustedDurationMin ||
    first.fare.mid - second.fare.mid ||
    second.comfortScore - first.comfortScore
  );
}

// Input bundle for the ranking function
interface RankInput {
  options: ScorableOption[];        // all vehicles already computed by the fares route
  baseDurationMin: number;          // travel + dwell fallback, in minutes
  baseTravelDurationMin?: number;   // real traffic-inclusive driving/riding time only
  dwellDurationMin?: number;        // fixed wait time across vehicles
  congestionLevel: CongestionLevel | null; // live TomTom reading; null when there is none
  weatherBand: "low" | "moderate" | "severe" | null; // null when weather is unavailable
  priority?: TravelPriority | null; // user's profile priority, defaults to time
}

// Main export — scores every eligible, non-weather-blocked option and returns
// the top 3 sorted best-first
export function rankRouteOptions({
  options,
  baseDurationMin,
  baseTravelDurationMin,
  dwellDurationMin = 0,
  congestionLevel,
  weatherBand,
  priority,
}: RankInput): RankedOption[] {
  const normalizedPriority = normalizePriority(priority);
  const weights = PRIORITY_WEIGHTS[normalizedPriority];

  // Step 1: drop anything already filtered out upstream (passenger capacity)
  // or hard-blocked by weather — these never make it onto the comparison cards
  const candidates = options.filter((o) => o.eligible && !o.weatherBlocked);

  if (candidates.length === 0) return []; // nothing left to rank

  // compute each candidate's traffic-adjusted duration, using the
  // real TomTom reading as the base
  const withDuration = candidates.map((option) => {
    const vehicleClass = getVehicleClass(option.vehicleType);
    // With no traffic reading there is nothing to scale by: every vehicle
    // keeps the car-route time rather than the "low congestion" row.
    const multiplier = congestionLevel
      ? DURATION_MULTIPLIERS[vehicleClass][congestionLevel]
      : 1;
    const travelDurationMin =
      typeof baseTravelDurationMin === "number" && Number.isFinite(baseTravelDurationMin)
        ? baseTravelDurationMin
        : Math.max(1, baseDurationMin - dwellDurationMin);

    return {
      ...option,
      adjustedDurationMin: Math.round(travelDurationMin * multiplier + dwellDurationMin),
    };
  });

  // gather the min/max of each metric across candidates, needed to
  // normalize every option onto the same 0–1 scale
  const fares     = withDuration.map((o) => o.fare.mid);
  const durations = withDuration.map((o) => o.adjustedDurationMin);
  const comforts  = withDuration.map((o) => o.comfortScore);

  const minFare = Math.min(...fares),     maxFare = Math.max(...fares);
  const minDur  = Math.min(...durations), maxDur  = Math.max(...durations);
  const minComf = Math.min(...comforts),  maxComf = Math.max(...comforts);

  const riskBasis: RiskBasis =
    weatherBand && congestionLevel
      ? "weather_and_traffic"
      : weatherBand
        ? "weather"
        : congestionLevel
          ? "traffic"
          : "none";

  // score every candidate
  const scored = withDuration.map((option) => {
    const metricScores: MetricScores = {
      cost: normalizeLowerBetter(option.fare.mid, minFare, maxFare),
      time: normalizeLowerBetter(option.adjustedDurationMin, minDur, maxDur),
      comfort: normalizeHigherBetter(option.comfortScore, minComf, maxComf),
    };

    // Risk points build up from two independent sources — weather and real
    // traffic congestion — weighted differently per vehicle class
    // (two-wheelers are more exposed to weather but less exposed to
    // congestion-related delay risk, and vice versa for cars)
    const isTwoWheeler = option.vehicleType === "bike" || option.vehicleType === "moto";
    let riskPoints = 0;

    if (weatherBand === "severe") riskPoints += isTwoWheeler ? 3 : 1;
    else if (weatherBand === "moderate") riskPoints += isTwoWheeler ? 1.5 : 0.5;

    if (congestionLevel === "severe") riskPoints += isTwoWheeler ? 0.5 : 1.5;
    else if (congestionLevel === "high") riskPoints += isTwoWheeler ? 0.3 : 1;
    else if (congestionLevel === "moderate") riskPoints += 0.3;

    // Converts the raw risk point total into the 3-tier badge shown in the UI
    const riskBand: RiskBand = riskPoints >= 2.5 ? "high" : riskPoints >= 1 ? "moderate" : "low";

    // Small penalty subtracted from the composite score — keeps risk as a
    // tiebreaker rather than letting it dominate cost/time/comfort
    const riskPenalty = riskPoints / 5;

    const score =
      metricScores.cost * weights.cost +
      metricScores.time * weights.time +
      metricScores.comfort * weights.comfort -
      riskPenalty * 0.15;

    return { ...option, riskBand, riskBasis, score };
  });

  // A comparative claim needs something to compare with and a real difference.
  // One option alone is not the cheapest of anything, and when every fare is
  // equal none of them is either cheapest or dearest.
  const faresDiffer = maxFare > minFare;
  const durationsDiffer = maxDur > minDur;
  const comfortsDiffer = maxComf > minComf;

  // attach the Best-for tag and generate pros/cons chips per candidate
  const withTags: RankedOption[] = scored.map((option) => {
    const pros: string[] = [];
    const cons: string[] = [];
    const leads = {
      cost: faresDiffer && option.fare.mid === minFare,
      time: durationsDiffer && option.adjustedDurationMin === minDur,
      comfort: comfortsDiffer && option.comfortScore === maxComf,
    };

    if (leads.cost) pros.push("Lowest estimated fare");
    if (leads.time) pros.push("Shortest estimated time");
    if (leads.comfort) pros.push("Most comfortable option");
    if (option.comfortScore >= 4) pros.push("High comfort");
    // Only a band built from both readings can vouch for the whole trip.
    if (option.riskBand === "low" && riskBasis === "weather_and_traffic") {
      pros.push("Low weather/traffic score");
    } else if (option.riskBand === "low" && riskBasis === "weather") {
      pros.push("Low weather score");
    }
    // "No caution" is a statement about the weather, so it needs a reading.
    if (weatherBand && !option.weatherRestricted) pros.push("No weather caution");

    if (faresDiffer && option.fare.mid === maxFare) cons.push("Highest estimated fare");
    if (option.weatherRestricted) cons.push(option.restrictionReason ?? "Weather caution advised");
    if (option.riskBand === "high") {
      cons.push(
        riskBasis === "weather"
          ? "Elevated weather risk"
          : riskBasis === "traffic"
            ? "Elevated traffic risk"
            : "Elevated traffic/weather risk",
      );
    }
    if (option.comfortScore <= 2) cons.push("Lower comfort rating");

    return {
      ...option,
      bestFor: getBestForTag(leads, normalizedPriority),
      // Set + slice de-duplicates then caps the chip count per the SRS's
      // "up to 3 pros / 2 cons" limit
      pros: Array.from(new Set(pros)).slice(0, 3),
      cons: Array.from(new Set(cons)).slice(0, 2),
    };
  });

  // sort best-first by composite score, then use priority-specific tie-breaks
  // so equal-duration/equal-score cases still feel aligned with the selected
  // Speed/Budget/Comfort mode.
  return withTags
    .sort((a, b) => compareRankedOptions(a, b, normalizedPriority))
    .slice(0, 3);
}
