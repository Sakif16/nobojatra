
import "server-only";

const TOMTOM_ROUTING_URL =
  "https://api.tomtom.com/routing/1/calculateRoute";

const TOMTOM_TIMEOUT_MS = 10_000;

const CONGESTION_CUTOFFS = {
  low: 20,
  moderate: 50,
  high: 100,
};

const DHAKA_PEAK_WINDOWS: Array<{
  startMinute: number;
  endMinute: number;
}> = [
  {
    startMinute: 8 * 60,
    endMinute: 10 * 60 + 30,
  }, // 08:00 - 10:30

  {
    startMinute: 17 * 60,
    endMinute: 20 * 60 + 30,
  }, // 17:00 - 20:30
];

const DHAKA_NON_PEAK_WEEKDAY = 5; // Friday

const DHAKA_TZ = "Asia/Dhaka";

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
 * Gets the current Dhaka time information.
 */
function getDhakaMinuteOfDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,

    hour: "2-digit",

    minute: "2-digit",

    weekday: "short",

    hour12: false,
  }).formatToParts(date);

  const hour = Number(
    parts.find(
      (part) => part.type === "hour"
    )?.value ?? "0"
  );

  const minute = Number(
    parts.find(
      (part) => part.type === "minute"
    )?.value ?? "0"
  );

  const weekdayShort =
    parts.find(
      (part) => part.type === "weekday"
    )?.value ?? "";

  const weekdayIndex = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ].indexOf(weekdayShort);

  return {
    minuteOfDay: hour * 60 + minute,

    weekdayIndex,
  };
}

/**
 * Determines whether a departure time falls
 * inside one of the configured Dhaka peak-hour windows.
 */
export function isDhakaPeakHour(
  date: Date
): boolean {
  const {
    minuteOfDay,
    weekdayIndex,
  } = getDhakaMinuteOfDay(date);

  // Friday is considered non-peak.
  if (
    weekdayIndex ===
    DHAKA_NON_PEAK_WEEKDAY
  ) {
    return false;
  }

  return DHAKA_PEAK_WINDOWS.some(
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

  const scheduled = new Date(
    departure.scheduledAt
  );

  if (Number.isNaN(scheduled.getTime())) {
    throw new TrafficServiceError(
      "Invalid scheduledAt value.",
      400,
      "Scheduled departure time is invalid."
    );
  }

  return scheduled;
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
    let data: any;

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
  departure: DepartureOptions
): Promise<TripTrafficResult> {
  /*
   * Determine actual departure date.
   */
  const departureDate =
    getDepartureDate(departure);

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

    isPeakHour:
      isDhakaPeakHour(
        departureDate
      ),

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