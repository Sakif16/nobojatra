export const FARE_CURRENCY = "BDT";
export const FARE_CURRENCY_SYMBOL = "৳";

/**
 * These are estimates, never quotes. Providers price dynamically — surge,
 * promotions, tolls, waiting time — and none of that is visible to us, so a
 * single number would imply a precision we do not have.
 *
 * The band is deliberately asymmetric: real fares rarely land below the meter
 * rate, but congestion and surge push the top out a long way.
 */
export const FARE_ESTIMATE_LOWER_MULTIPLIER = 0.9;
export const FARE_ESTIMATE_UPPER_MULTIPLIER = 1.3;

/** Fares are quoted in whole taka; rounding to 5 avoids false precision. */
const FARE_ROUNDING_STEP = 5;

export type VehicleRateInput = {
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  speedFactor?: number;
};

export type FareEstimate = {
  low: number;
  high: number;
  currency: string;
};

function roundToStep(value: number) {
  return Math.max(
    FARE_ROUNDING_STEP,
    Math.round(value / FARE_ROUNDING_STEP) * FARE_ROUNDING_STEP,
  );
}

/**
 * Duration for a specific vehicle. The routing service only ever returns a
 * driving-car time, so each vehicle scales it — otherwise every option would
 * show the same ETA and a "fastest" sort would be meaningless.
 */
export function estimateDurationMin(
  drivingDurationMin: number,
  speedFactor = 1,
) {
  return Math.max(1, Math.round(drivingDurationMin * speedFactor));
}

export function estimateFare(
  rate: VehicleRateInput,
  distanceKm: number,
  drivingDurationMin: number,
): FareEstimate {
  const durationMin = estimateDurationMin(
    drivingDurationMin,
    rate.speedFactor ?? 1,
  );

  const metered =
    rate.baseFare + rate.perKmRate * distanceKm + rate.perMinRate * durationMin;
  const fare = Math.max(metered, rate.minimumFare);

  return {
    low: roundToStep(fare * FARE_ESTIMATE_LOWER_MULTIPLIER),
    high: roundToStep(fare * FARE_ESTIMATE_UPPER_MULTIPLIER),
    currency: FARE_CURRENCY,
  };
}

export function formatFareRange(estimate: Pick<FareEstimate, "low" | "high">) {
  if (estimate.low === estimate.high) {
    return `${FARE_CURRENCY_SYMBOL}${estimate.low}`;
  }

  return `${FARE_CURRENCY_SYMBOL}${estimate.low} – ${estimate.high}`;
}
