export const FARE_CURRENCY = "BDT";
export const FARE_CURRENCY_SYMBOL = "$";

export const FARE_ESTIMATE_LOWER_MULTIPLIER = 0.9;
export const FARE_ESTIMATE_UPPER_MULTIPLIER = 1.3;

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
