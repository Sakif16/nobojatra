import "server-only";


const TOMTOM_MATRIX_URL = "https://api.tomtom.com/routing/matrix/2";
const TOMTOM_TIMEOUT_MS = 10_000;


const CONGESTION_CUTOFFS = {
  low: 20,
  moderate: 50,
  high: 100,
};


const DHAKA_PEAK_WINDOWS: Array<{ startMinute: number; endMinute: number }> = [
  { startMinute: 8 * 60, endMinute: 10 * 60 + 30 }, // 8:00 - 10:30
  { startMinute: 17 * 60, endMinute: 20 * 60 + 30 }, // 17:00 - 20:30
];
const DHAKA_NON_PEAK_WEEKDAY = 5; 
const DHAKA_TZ = "Asia/Dhaka";

export type CongestionLevel = "low" | "moderate" | "high" | "severe";

export type TrafficPoint = {
  lat: number;
  lng: number;
};

export type DepartureOptions =
  | { mode: "now" }
  | { mode: "scheduled"; scheduledAt: string };

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

type TomTomMatrixElement = {
  originIndex: number;
  destinationIndex: number;
  routeSummary?: {
    lengthInMeters: number;
    travelTimeInSeconds: number;
    trafficDelayInSeconds: number;
    departureTime: string;
    arrivalTime: string;
  };
  detailedError?: { code?: string; message?: string };
};

type TomTomMatrixResponse = {
  data: TomTomMatrixElement[];
};

export class TrafficServiceError extends Error {
  statusCode: number;
  userMessage: string;

  constructor(message: string, statusCode: number, userMessage: string) {
    super(message);
    this.name = "TrafficServiceError";
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

function getTomTomApiKey() {
  return process.env.TOMTOM_API_KEY;
}

/** Rounds to one decimal place, matching the existing peak-hours endpoint. */
function round1(value: number) {
  return Number(value.toFixed(1));
}

export function calculateCongestionIndex(
  durationInTrafficSec: number,
  baselineDurationSec: number
): number {
  if (baselineDurationSec <= 0) return 0;
  return round1(
    ((durationInTrafficSec - baselineDurationSec) / baselineDurationSec) * 100
  );
}

export function getCongestionLevel(
  congestionIndexPercent: number
): CongestionLevel {
  if (congestionIndexPercent < CONGESTION_CUTOFFS.low) return "low";
  if (congestionIndexPercent < CONGESTION_CUTOFFS.moderate) return "moderate";
  if (congestionIndexPercent < CONGESTION_CUTOFFS.high) return "high";
  return "severe";
}

function getDhakaMinuteOfDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";

  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekdayShort
  );

  return { minuteOfDay: hour * 60 + minute, weekdayIndex };
}

/** Flags whether a departure time falls inside a standard Dhaka rush window. */
export function isDhakaPeakHour(date: Date): boolean {
  const { minuteOfDay, weekdayIndex } = getDhakaMinuteOfDay(date);

  if (weekdayIndex === DHAKA_NON_PEAK_WEEKDAY) return false;

  return DHAKA_PEAK_WINDOWS.some(
    (window) => minuteOfDay >= window.startMinute && minuteOfDay <= window.endMinute
  );
}

function getDepartureDate(departure: DepartureOptions): Date {
  if (departure.mode === "now") return new Date();

  const scheduled = new Date(departure.scheduledAt);
  if (Number.isNaN(scheduled.getTime())) {
    throw new TrafficServiceError(
      "Invalid scheduledAt value.",
      400,
      "Scheduled departure time is invalid."
    );
  }
  return scheduled;
}

function getFriendlyTomTomMessage(status: number) {
  if (status === 401 || status === 403) {
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

  const departureDate = getDepartureDate(departure);


  const origins = points.slice(0, -1).map((p) => ({ point: { latitude: p.lat, longitude: p.lng } }));
  const destinations = points.slice(1).map((p) => ({ point: { latitude: p.lat, longitude: p.lng } }));

  let response: Response;

  try {
    response = await fetch(`${TOMTOM_MATRIX_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origins,
        destinations,
        options: {
          departAt: departureDate.toISOString(),
          routeType: "fastest",
          traffic: "live",
        },
      }),
      signal: AbortSignal.timeout(TOMTOM_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TrafficServiceError(
      error instanceof Error
        ? `TomTom Matrix request failed: ${error.message}`
        : "TomTom Matrix request failed.",
      502,
      "Unable to reach the traffic service."
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new TrafficServiceError(
      `TomTom Matrix returned ${response.status}${details ? `: ${details.slice(0, 200)}` : ""}`,
      502,
      getFriendlyTomTomMessage(response.status)
    );
  }

  let payload: TomTomMatrixResponse;
  try {
    payload = (await response.json()) as TomTomMatrixResponse;
  } catch {
    throw new TrafficServiceError(
      "TomTom Matrix response was not valid JSON.",
      502,
      "Traffic service returned an unexpected response."
    );
  }

  const legCount = points.length - 1;
  const legs: TrafficLegResult[] = [];

  for (let legIndex = 0; legIndex < legCount; legIndex += 1) {
    
    const cell = payload.data.find(
      (el) => el.originIndex === legIndex && el.destinationIndex === legIndex
    );

    if (!cell?.routeSummary) {
      throw new TrafficServiceError(
        `TomTom Matrix has no route for leg ${legIndex}: ${cell?.detailedError?.message ?? "unknown error"}`,
        502,
        "A drivable route could not be found for one of the legs."
      );
    }

    const { lengthInMeters, travelTimeInSeconds, trafficDelayInSeconds } =
      cell.routeSummary;
    const baselineDurationSec = Math.max(
      0,
      travelTimeInSeconds - trafficDelayInSeconds
    );
    const congestionIndexPercent = calculateCongestionIndex(
      travelTimeInSeconds,
      baselineDurationSec
    );

    legs.push({
      legIndex,
      from: points[legIndex],
      to: points[legIndex + 1],
      distanceMeters: lengthInMeters,
      durationInTrafficSec: travelTimeInSeconds,
      baselineDurationSec,
      congestionIndexPercent,
      congestionLevel: getCongestionLevel(congestionIndexPercent),
    });
  }

  return legs;
}


export async function getTrafficForTrip(
  points: TrafficPoint[],
  departure: DepartureOptions
): Promise<TripTrafficResult> {
  const departureDate = getDepartureDate(departure);
  const legs = await fetchLiveTrafficForLegs(points, departure);

  const distanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const durationInTrafficSec = legs.reduce(
    (sum, leg) => sum + leg.durationInTrafficSec,
    0
  );
  const baselineDurationSec = legs.reduce(
    (sum, leg) => sum + leg.baselineDurationSec,
    0
  );
  const congestionIndexPercent = calculateCongestionIndex(
    durationInTrafficSec,
    baselineDurationSec
  );

  return {
    departureTime: departureDate.toISOString(),
    isPeakHour: isDhakaPeakHour(departureDate),
    legs,
    totals: {
      distanceMeters,
      durationInTrafficSec,
      baselineDurationSec,
      congestionIndexPercent,
      congestionLevel: getCongestionLevel(congestionIndexPercent),
    },
  };
}