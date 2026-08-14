// lib/route-scoring.ts
// The AI Route Scoring Engine (SRS Module 2, Feature 3). Takes fare options
// already computed by the fares pipeline, layers in REAL traffic-adjusted
// duration (from lib/traffic-service.ts, backed by TomTom live traffic) and
// weather risk, then produces a ranked top-3 with pros/cons and a "Best for"
// tag — everything the Route Comparison Display card needs.
import "server-only";
import type { FareSource } from "@/lib/fare-providers";
import type { CongestionLevel } from "@/lib/traffic-service";
// CongestionLevel — reused directly from the real traffic service rather than
// a locally-defined type, so this file can never drift out of sync with what
// TomTom actually returns ("low" | "moderate" | "high" | "severe")

// The three risk tiers shown as the card's colour-coded risk badge
export type RiskBand = "low" | "moderate" | "high";

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
  // Where the fare came from — a live provider quote or the local rate card.
  // Ranking ignores these; they ride along so the card can show provenance.
  fareSource: FareSource;
  fareSourceNote: string | null;
}

// Shape of one option going OUT — everything ScorableOption has, plus the
// scoring engine's additions
export interface RankedOption extends ScorableOption {
  adjustedDurationMin: number;              // real traffic duration × per-vehicle multiplier
  riskBand: RiskBand;                        // combined weather + traffic risk
  bestFor: "Speed" | "Budget" | "Comfort" | null; // which single metric this option wins on
  pros: string[];                            // up to 3 short chips
  cons: string[];                            // up to 2 short chips
  score: number;                             // internal weighted score used only for ranking
}

// Fixed weighting across the three criteria. No per-user priority selector
// exists yet in the UI, so this uses a balanced default — easy to make
// user-configurable later by threading a weights object through from the caller.
const WEIGHTS = { cost: 0.35, time: 0.35, comfort: 0.3 };

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

// Input bundle for the ranking function
interface RankInput {
  options: ScorableOption[];        // all vehicles already computed by the fares route
  baseDurationMin: number;          // real traffic-inclusive duration (car baseline) in minutes
  congestionLevel: CongestionLevel; // from lib/traffic-service.ts, live TomTom reading
  weatherBand: "low" | "moderate" | "severe" | null; // null when weather is unavailable
}

// Main export — scores every eligible, non-weather-blocked option and returns
// the top 3 sorted best-first
export function rankRouteOptions({
  options,
  baseDurationMin,
  congestionLevel,
  weatherBand,
}: RankInput): RankedOption[] {
  // Step 1: drop anything already filtered out upstream (passenger capacity)
  // or hard-blocked by weather — these never make it onto the comparison cards
  const candidates = options.filter((o) => o.eligible && !o.weatherBlocked);

  if (candidates.length === 0) return []; // nothing left to rank

  // Step 2: compute each candidate's traffic-adjusted duration, using the
  // real TomTom reading as the base
  const withDuration = candidates.map((option) => {
    const vehicleClass = getVehicleClass(option.vehicleType);
    const multiplier = DURATION_MULTIPLIERS[vehicleClass][congestionLevel];
    return {
      ...option,
      adjustedDurationMin: Math.round(baseDurationMin * multiplier),
    };
  });

  // Step 3: gather the min/max of each metric across candidates, needed to
  // normalize every option onto the same 0–1 scale
  const fares     = withDuration.map((o) => o.fare.mid);
  const durations = withDuration.map((o) => o.adjustedDurationMin);
  const comforts  = withDuration.map((o) => o.comfortScore);

  const minFare = Math.min(...fares),     maxFare = Math.max(...fares);
  const minDur  = Math.min(...durations), maxDur  = Math.max(...durations);
  const minComf = Math.min(...comforts),  maxComf = Math.max(...comforts);

  // Step 4: score every candidate
  const scored = withDuration.map((option) => {
    const costScore    = normalizeLowerBetter(option.fare.mid, minFare, maxFare);
    const timeScore     = normalizeLowerBetter(option.adjustedDurationMin, minDur, maxDur);
    const comfortScoreN = normalizeHigherBetter(option.comfortScore, minComf, maxComf);

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
      costScore * WEIGHTS.cost +
      timeScore * WEIGHTS.time +
      comfortScoreN * WEIGHTS.comfort -
      riskPenalty * 0.15;

    return { ...option, riskBand, score };
  });

  // Step 5: find the single winner in each individual metric — used to assign
  // the one-per-card "Best for" tag
  const cheapest = scored.reduce((a, b) => (b.fare.mid < a.fare.mid ? b : a));
  const fastest  = scored.reduce((a, b) => (b.adjustedDurationMin < a.adjustedDurationMin ? b : a));
  const comfiest = scored.reduce((a, b) => (b.comfortScore > a.comfortScore ? b : a));

  const maxFareValue = Math.max(...fares); // reused below to flag "higher cost" as a con

  // Step 6: attach the Best-for tag and generate pros/cons chips per candidate
  const withTags: RankedOption[] = scored.map((option) => {
    let bestFor: RankedOption["bestFor"] = null;
    if (option === cheapest) bestFor = "Budget";
    else if (option === fastest) bestFor = "Speed";
    else if (option === comfiest) bestFor = "Comfort";

    const pros: string[] = [];
    const cons: string[] = [];

    if (option === cheapest) pros.push("Cheapest option");
    if (option === fastest) pros.push("Fastest in current traffic");
    if (option.comfortScore >= 4) pros.push("High comfort");
    if (option.riskBand === "low") pros.push("Low overall risk");
    if (!option.weatherRestricted) pros.push("No weather caution");

    if (option.fare.mid === maxFareValue) cons.push("Higher cost than alternatives");
    if (option.weatherRestricted) cons.push(option.restrictionReason ?? "Weather caution advised");
    if (option.riskBand === "high") cons.push("Elevated traffic/weather risk");
    if (option.comfortScore <= 2) cons.push("Lower comfort rating");

    return {
      ...option,
      bestFor,
      // Set + slice de-duplicates then caps the chip count per the SRS's
      // "up to 3 pros / 2 cons" limit
      pros: Array.from(new Set(pros)).slice(0, 3),
      cons: Array.from(new Set(cons)).slice(0, 2),
    };
  });

  // Step 7: sort best-first by composite score, return only the top 3
  return withTags.sort((a, b) => b.score - a.score).slice(0, 3);
}