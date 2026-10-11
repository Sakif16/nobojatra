
import "server-only";

import {
  getCountryConfig,
  hasLiveTraffic,
  liveTrafficUnavailableMessage,
  type CountryCode,
} from "@/lib/country-config";
import {
  budgetReachedMessage,
  ProviderBudgetError,
  spendProviderBudget,
} from "@/lib/provider-budget";
import { getLocalClock, parseInstant } from "@/lib/trip-time";
import { resolveTripTimeZone } from "@/lib/trip-time-zone";

// The fields of TomTom's calculateRoute response that this module reads.
// Everything is optional because the response is checked before use.
type TomTomRouteResponse = {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number;
      travelTimeInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
    };
  }>;
};

const TOMTOM_ROUTING_URL =
  "https://api.tomtom.com/routing/1/calculateRoute";

const TOMTOM_TIMEOUT_MS = 10_000;

const CONGESTION_CUTOFFS = {
  low: 20,
  moderate: 50,
  high: 100,
};

export type CongestionLevel =
  | "low"
  | "moderate"
  | "high"
  | "severe";

export type TrafficPoint = {
  lat: number;
  lng: number;
};

export type DepartureOptions =
  | {
      mode: "now";
    }
  | {
      mode: "scheduled";
      scheduledAt: string;
    };

export type TrafficLegResult = {
  legIndex: number;

  from: TrafficPoint;

  to: TrafficPoint;

  distanceMeters: number;

  durationInTrafficSec: number;

  baselineDurationSec: number;

  congestionIndexPercent: number;

  congestionLevel: CongestionLevel;
};

export type TripTrafficResult = {
  departureTime: string;

  isPeakHour: boolean;

  /**
   * The country whose peak-hour windows `isPeakHour` was judged against.
   * Carried on the result so the UI can name it — a stored trip keeps the
   * country it was planned in, which is not necessarily the viewer's current
   * one.
   */
  country: CountryCode;

  /**
   * The IANA zone at the start of the trip, which the departure was read in
   * before being tested against those windows.
   */
  timeZone: string;

  legs: TrafficLegResult[];

  totals: {
    distanceMeters: number;

    durationInTrafficSec: number;

    baselineDurationSec: number;

    congestionIndexPercent: number;

    congestionLevel: CongestionLevel;
  };
};

export class TrafficServiceError extends Error {
  statusCode: number;

  userMessage: string;

  constructor(
    message: string,
    statusCode: number,
    userMessage: string
  ) {
    super(message);

    this.name = "TrafficServiceError";

    this.statusCode = statusCode;

    this.userMessage = userMessage;
  }
}

/**
 * Gets the TomTom API key from environment variables.
 */
function getTomTomApiKey(): string | undefined {
  return process.env.TOMTOM_API_KEY;
}

/**
 * Rounds a number to one decimal place.
 */
function round1(value: number): number {
  return Number(value.toFixed(1));
}

/**
 * Calculates congestion percentage.
 *
 * Example:
 *
 * traffic duration = 900 sec
 * baseline duration = 600 sec
 *
 * congestion =
 * ((900 - 600) / 600) * 100
 *
 * = 50%
 */
export function calculateCongestionIndex(
  durationInTrafficSec: number,
  baselineDurationSec: number
): number {
  if (baselineDurationSec <= 0) {
    return 0;
  }

  return round1(
    ((durationInTrafficSec - baselineDurationSec) /
      baselineDurationSec) *
      100
  );
}

/**
 * Converts congestion percentage into a congestion level.
 */
export function getCongestionLevel(
  congestionIndexPercent: number
): CongestionLevel {
  if (
    congestionIndexPercent <
    CONGESTION_CUTOFFS.low
  ) {
    return "low";
  }

  if (
    congestionIndexPercent <
    CONGESTION_CUTOFFS.moderate
  ) {
    return "moderate";
  }

  if (
    congestionIndexPercent <
    CONGESTION_CUTOFFS.high
  ) {
    return "high";
  }

  return "severe";
}

/**
 * Whether a departure falls inside one of a country's peak-hour windows.
 *
 * The windows are local times, so the instant is read in the trip's own zone
 * before it is tested. The country says which windows apply; the zone says
 * what the clock at the pickup point reads. Both are required rather than
 * defaulted: this used to be `isDhakaPeakHour(date)` for every trip in every
 * country, and then one zone per country, which judged a Los Angeles departure
 * on New York's clock. A default would let either bug back in the moment a new
 * caller forgot an argument.
 */
export function isPeakHour(
  date: Date,
  country: CountryCode,
  timeZone: string
): boolean {
  const { peakWindows, nonPeakWeekdays } = getCountryConfig(country);
  const { minuteOfDay, weekdayIndex } = getLocalClock(date, timeZone);

  if (nonPeakWeekdays.includes(weekdayIndex)) {
    return false;
  }

  return peakWindows.some(
    (window) =>
      minuteOfDay >= window.startMinute &&
      minuteOfDay <= window.endMinute
  );
}

/**
 * Converts DepartureOptions into a JavaScript Date.
 */
function getDepartureDate(
  departure: DepartureOptions
): Date {
  if (departure.mode === "now") {
    return new Date();
  }

  // An instant with its own offset, never a bare local time: `new Date` would
  // read that in the server's zone.
  const scheduled = parseInstant(
    departure.scheduledAt
  );

  if (!scheduled) {
    throw new TrafficServiceError(
      "Invalid scheduledAt value.",
      400,
      "Scheduled departure time is invalid."
    );
  }

  return scheduled;
}

/**
 * Whether a trip's departure falls in a peak-hour window, read on the clock
 * where the trip starts.
 *
 * This needs no traffic data, so it is available in every country — including
 * those with no live traffic, where the peak-hour fare adjustment still
 * applies.
 */
export function isDeparturePeakHour(
  start: TrafficPoint | null,
  departure: DepartureOptions,
  country: CountryCode
): boolean {
  const timeZone = start
    ? resolveTripTimeZone(start, country)
    : getCountryConfig(country).timeZone;

  return isPeakHour(getDepartureDate(departure), country, timeZone);
}

/**
 * Converts TomTom HTTP status codes into
 * user-friendly messages.
 */
function getFriendlyTomTomMessage(
  status: number
): string {
  if (
    status === 401 ||
    status === 403
  ) {
    return "Traffic service credentials need attention.";
  }

  if (status === 429) {
    return "Traffic lookups are busy right now. Please try again shortly.";
  }

  if (status >= 500) {
    return "Traffic service is temporarily unavailable.";
  }

  return "Unable to fetch live traffic for this route.";
}

/**
 * Fetches live traffic information for every
 * consecutive pair of route points.
 *
 * Example:
 *
 * A -> B -> C -> D
 *
 * Requests:
 *
 * A -> B
 * B -> C
 * C -> D
 */
export async function fetchLiveTrafficForLegs(
  points: TrafficPoint[],
  departure: DepartureOptions
): Promise<TrafficLegResult[]> {
  if (points.length < 2) {
    throw new TrafficServiceError(
      "At least an origin and destination are required.",
      400,
      "A route needs at least two points."
    );
  }

  const apiKey = getTomTomApiKey();

  if (!apiKey) {
    throw new TrafficServiceError(
      "TOMTOM_API_KEY is not set.",
      500,
      "Traffic service is not configured."
    );
  }

  const departureDate =
    getDepartureDate(departure);

  /*
   * One provider call per leg. The whole trip is counted before the first
   * call, so a trip is either read in full or not started.
   */
  try {
    await spendProviderBudget(
      "tomtom_routing",
      points.length - 1
    );
  } catch (error) {
    if (!(error instanceof ProviderBudgetError)) throw error;

    throw new TrafficServiceError(
      error.message,
      429,
      budgetReachedMessage("live traffic")
    );
  }

  const legs: TrafficLegResult[] = [];

  /*
   * Process each consecutive pair of points.
   */
  for (
    let legIndex = 0;
    legIndex < points.length - 1;
    legIndex++
  ) {
    const from = points[legIndex];

    const to = points[legIndex + 1];

    /*
     * Build TomTom Calculate Route URL.
     *
     * Example:
     *
     * https://api.tomtom.com/routing/1/calculateRoute/
     * 23.8103,90.4125:23.7806,90.4070/json
     */
    const url =
      `${TOMTOM_ROUTING_URL}/` +
      `${from.lat},${from.lng}:` +
      `${to.lat},${to.lng}/json` +
      `?traffic=true` +
      `&computeTravelTimeFor=all` +
      `&routeType=fastest` +
      `&travelMode=car` +
      `&departAt=${encodeURIComponent(
        departureDate.toISOString()
      )}` +
      `&key=${encodeURIComponent(apiKey)}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: "GET",

        signal: AbortSignal.timeout(
          TOMTOM_TIMEOUT_MS
        ),

        cache: "no-store",
      });
    } catch (error) {
      console.error(
        "TomTom Calculate Route request failed:",
        error
      );

      throw new TrafficServiceError(
        error instanceof Error
          ? `Unable to contact TomTom: ${error.message}`
          : "Unable to contact TomTom.",

        502,

        "Unable to reach the traffic service."
      );
    }

    /*
     * Handle HTTP errors.
     */
    if (!response.ok) {
      const details =
        await response.text().catch(
          () => ""
        );

      console.error(
        "TomTom Routing API Error:",
        {
          status: response.status,

          details,

          legIndex,

          from,

          to,
        }
      );

      throw new TrafficServiceError(
        `TomTom Routing API returned ${response.status}: ${details}`,

        response.status,

        getFriendlyTomTomMessage(
          response.status
        )
      );
    }

    /*
     * Parse JSON response.
     */
    let data: TomTomRouteResponse;

    try {
      data = await response.json();
    } catch (error) {
      console.error(
        "TomTom response JSON parse failed:",
        error
      );

      throw new TrafficServiceError(
        "TomTom response was not valid JSON.",

        502,

        "Traffic service returned an invalid response."
      );
    }

    /*
     * Get the first route returned by TomTom.
     */
    const summary =
      data?.routes?.[0]?.summary;

    if (!summary) {
      console.error(
        "TomTom route summary missing:",
        {
          legIndex,

          from,

          to,

          response: data,
        }
      );

      throw new TrafficServiceError(
        "TomTom route summary missing.",

        502,

        "Traffic service returned an invalid route response."
      );
    }

    /*
     * Distance.
     */
    const distanceMeters =
      Number(summary.lengthInMeters) || 0;

    /*
     * TomTom's best-estimate travel time.
     *
     * According to TomTom, travelTimeInSeconds
     * includes traffic delay.
     */
    const durationInTrafficSec =
      Number(
        summary.travelTimeInSeconds
      ) || 0;

    /*
     * TomTom gives us the no-traffic travel time
     * when computeTravelTimeFor=all is used.
     *
     * This is our baseline/free-flow duration.
     */
    const baselineDurationSec =
      Number(
        summary.noTrafficTravelTimeInSeconds
      ) ||
      Math.max(
        0,

        durationInTrafficSec -
          (Number(
            summary.trafficDelayInSeconds
          ) || 0)
      );

    /*
     * Calculate congestion.
     */
    const congestionIndexPercent =
      calculateCongestionIndex(
        durationInTrafficSec,

        baselineDurationSec
      );

    /*
     * Convert percentage into a level.
     */
    const congestionLevel =
      getCongestionLevel(
        congestionIndexPercent
      );

    /*
     * Store the leg result.
     */
    legs.push({
      legIndex,

      from,

      to,

      distanceMeters,

      durationInTrafficSec,

      baselineDurationSec,

      congestionIndexPercent,

      congestionLevel,
    });
  }

  return legs;
}

/**
 * Gets traffic information for the entire trip.
 */
export async function getTrafficForTrip(
  points: TrafficPoint[],
  departure: DepartureOptions,
  country: CountryCode
): Promise<TripTrafficResult> {
  /*
   * Determine actual departure date.
   */
  /*
   * No provider call where there is nothing live to read. TomTom would answer
   * with a route and no delay, which every caller would take for light
   * traffic.
   */
  if (!hasLiveTraffic(country)) {
    throw new TrafficServiceError(
      `No live traffic coverage in ${country}.`,
      422,
      liveTrafficUnavailableMessage(country)
    );
  }

  const departureDate =
    getDepartureDate(departure);

  /*
   * Peak hours are judged on the clock where the trip starts.
   */
  const timeZone = points[0]
    ? resolveTripTimeZone(points[0], country)
    : getCountryConfig(country).timeZone;

  /*
   * Get traffic information for
   * every route leg.
   */
  const legs =
    await fetchLiveTrafficForLegs(
      points,
      departure
    );

  /*
   * Total distance.
   */
  const distanceMeters =
    legs.reduce(
      (sum, leg) =>
        sum + leg.distanceMeters,

      0
    );

  /*
   * Total traffic travel time.
   */
  const durationInTrafficSec =
    legs.reduce(
      (sum, leg) =>
        sum +
        leg.durationInTrafficSec,

      0
    );

  /*
   * Total baseline/free-flow time.
   */
  const baselineDurationSec =
    legs.reduce(
      (sum, leg) =>
        sum +
        leg.baselineDurationSec,

      0
    );

  /*
   * Overall congestion percentage.
   */
  const congestionIndexPercent =
    calculateCongestionIndex(
      durationInTrafficSec,

      baselineDurationSec
    );

  /*
   * Return complete trip result.
   */
  return {
    departureTime:
      departureDate.toISOString(),

    isPeakHour: isPeakHour(
      departureDate,
      country,
      timeZone
    ),

    country,

    timeZone,

    legs,

    totals: {
      distanceMeters,

      durationInTrafficSec,

      baselineDurationSec,

      congestionIndexPercent,

      congestionLevel:
        getCongestionLevel(
          congestionIndexPercent
        ),
    },
  };
}