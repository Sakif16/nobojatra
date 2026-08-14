// lib/fare-providers.ts
// The single fare calculator for every vehicle the app prices. Both
// /api/fares and /api/best-options call estimateFaresForRates() so the two
// pages can no longer disagree about what a ride costs.
//
// Fallback policy (deliberate, applies to every external provider here):
// a provider failure NEVER fails the request and NEVER drops the option.
// When Pathao cannot be reached, is misconfigured, or answers with something
// unusable, that vehicle falls back to its seeded rate card and the estimate
// is returned with fareSource: "rate_card" plus a human-readable reason. The
// caller passes both fields through to the client, so a degraded estimate is
// visible rather than silently indistinguishable from a live one.
import "server-only";

const PATHAO_TIMEOUT_MS = 6_000;
/** Upper bound on simultaneous outbound provider requests per fare request. */
const PROVIDER_CONCURRENCY = 4;
/** ±10% spread applied around every mid-point fare. */
const FARE_BAND = 0.1;

export type FareBand = {
  low: number;
  mid: number;
  high: number;
};

/**
 * "pathao_api" — a live upstream quote.
 * "rate_card"  — computed locally from the seeded VehicleRate document.
 */
export type FareSource = "pathao_api" | "rate_card";

/** The subset of a VehicleRate document fare maths needs. */
export type FareRateCard = {
  provider: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
};

export type FareTripMetrics = {
  distanceKm: number;
  durationMin: number;
};

export type FareEstimate = {
  fare: FareBand;
  fareSource: FareSource;
  /** Why the live provider was not used. `null` whenever fareSource is live. */
  fareSourceNote: string | null;
};

type PathaoVehicle = "bike" | "car" | "cng";

type PathaoEstimateResponse = {
  estimatedFare?: unknown;
  currency?: unknown;
};

export class FareProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FareProviderError";
  }
}

export function applyFareBand(mid: number): FareBand {
  return {
    low: Math.round(mid * (1 - FARE_BAND)),
    mid: Math.round(mid),
    high: Math.round(mid * (1 + FARE_BAND)),
  };
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** The local formula: base + distance + time, floored at the minimum fare. */
export function calculateRateCardFare(
  rate: FareRateCard,
  { distanceKm, durationMin }: FareTripMetrics,
): FareBand {
  const mid =
    rate.baseFare + distanceKm * rate.perKmRate + durationMin * rate.perMinRate;

  return applyFareBand(Math.max(mid, rate.minimumFare));
}

/**
 * Pathao prices two of the vehicle classes this app sells. `cng` rows belong
 * to the standalone `cng` provider and are priced from the rate card, so only
 * bike maps to a two-wheeler quote; everything else Pathao operates is a car.
 */
function toPathaoVehicle(vehicleType: string): PathaoVehicle {
  return vehicleType === "bike" ? "bike" : "car";
}

function getPathaoBaseUrl() {
  return process.env.PATHAO_FARE_API?.replace(/\/$/, "");
}

/**
 * One live Pathao quote. Throws FareProviderError on every failure mode —
 * missing config, network error, timeout, non-2xx, malformed JSON, or a body
 * without a usable fare — so callers have a single thing to catch.
 */
export async function fetchPathaoFare(
  vehicle: PathaoVehicle,
  { distanceKm, durationMin }: FareTripMetrics,
): Promise<number> {
  const baseUrl = getPathaoBaseUrl();

  if (!baseUrl) {
    throw new FareProviderError("PATHAO_FARE_API is not set.");
  }

  if (!isFinitePositiveNumber(distanceKm) || !isFinitePositiveNumber(durationMin)) {
    throw new FareProviderError("Pathao request needs a positive distance and duration.");
  }

  const url = new URL(`${baseUrl}/estimate`);
  url.searchParams.set("vehicle", vehicle);
  url.searchParams.set("city", "dhaka");
  url.searchParams.set("distance_km", distanceKm.toFixed(3));
  url.searchParams.set("duration_min", durationMin.toFixed(3));

  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PATHAO_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new FareProviderError(
      error instanceof Error
        ? `Pathao request failed: ${error.message}`
        : "Pathao request failed.",
    );
  }

  if (!response.ok) {
    throw new FareProviderError(`Pathao returned ${response.status}.`);
  }

  let payload: PathaoEstimateResponse;

  try {
    payload = (await response.json()) as PathaoEstimateResponse;
  } catch {
    throw new FareProviderError("Pathao response was not valid JSON.");
  }

  if (!isFinitePositiveNumber(payload.estimatedFare)) {
    throw new FareProviderError("Pathao response is missing estimatedFare.");
  }

  // Fares render as BDT throughout the app; a quote in anything else would be
  // wrong rather than merely unavailable, so treat it as a provider failure.
  if (typeof payload.currency === "string" && payload.currency.toUpperCase() !== "BDT") {
    throw new FareProviderError(`Pathao quoted an unsupported currency (${payload.currency}).`);
  }

  return payload.estimatedFare;
}

/** Runs `task` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  task: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);

  return results;
}

async function estimateOneFare(
  rate: FareRateCard,
  trip: FareTripMetrics,
): Promise<FareEstimate> {
  const rateCardFare = calculateRateCardFare(rate, trip);

  if (rate.provider !== "pathao") {
    return { fare: rateCardFare, fareSource: "rate_card", fareSourceNote: null };
  }

  try {
    const mid = await fetchPathaoFare(toPathaoVehicle(rate.vehicleType), trip);

    return { fare: applyFareBand(mid), fareSource: "pathao_api", fareSourceNote: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Pathao request failed.";
    console.warn(`Pathao estimate failed for ${rate.vehicleType}: ${reason}`);

    return {
      fare: rateCardFare,
      fareSource: "rate_card",
      fareSourceNote: "Live Pathao pricing was unavailable; showing a rate-card estimate.",
    };
  }
}

/**
 * Prices every rate for one trip. Results are index-aligned with `rates`, each
 * provider is isolated from the others, and the live lookups run concurrently
 * under a fixed bound instead of one-at-a-time.
 */
export function estimateFaresForRates(
  rates: FareRateCard[],
  trip: FareTripMetrics,
): Promise<FareEstimate[]> {
  return mapWithConcurrency(rates, PROVIDER_CONCURRENCY, (rate) =>
    estimateOneFare(rate, trip),
  );
}
