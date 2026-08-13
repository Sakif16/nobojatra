export type LatLng = { lat: number; lng: number; name?: string };

export type RouteLeg = {
  startIndex: number;
  endIndex: number;
  color: string;
  distanceKm: number;
};

export type RouteResult = {
  id: string;
  rank: number;
  coords: [number, number][];
  distanceKm: number;
  durationMin: number;
  legs: RouteLeg[];
};


export const ROUTE_COLORS = [
  "#d97706", // amber
  "#0d9488", // teal
  "#be123c", // rose
  "#4f46e5", // indigo
  "#65a30d", // lime
];


export const MARKER_COLOR = "#1c1917";


export const INACTIVE_ROUTE_COLOR = "#9ca3af";

export type FetchRoutesResult = {
  routes: RouteResult[];
  tripHistoryId: string | null;
};

export type TrafficPoint = { lat: number; lng: number };
export type TrafficLevel = "low" | "moderate" | "high" | "severe";
export type TrafficLegResult = {
  legIndex: number;
  distanceMeters: number;
  durationInTrafficSec: number;
  baselineDurationSec: number;
  congestionIndexPercent: number;
  congestionLevel: TrafficLevel;
};
export type TripTrafficResult = {
  departureTime: string;
  isPeakHour: boolean;
  legs: TrafficLegResult[];
  totals: Omit<TrafficLegResult, "legIndex" | "distanceMeters"> & {
    distanceMeters: number;
  };
};

/** Matches the badge colors already used for the traffic summary panel
 * (emerald/amber/orange/red), just as line-friendly hex values. */
export const TRAFFIC_LEVEL_COLORS: Record<TrafficLevel, string> = {
  low: "#059669",
  moderate: "#d97706",
  high: "#ea580c",
  severe: "#dc2626",
};

export const TRAFFIC_LEVEL_LABELS: Record<TrafficLevel, string> = {
  low: "Light traffic",
  moderate: "Moderate traffic",
  high: "Heavy traffic",
  severe: "Severe traffic",
};

/**
 * Picks the same evenly-spaced coordinate indices used to sample a route
 * down to at most `maxSamples` points before sending it to the traffic
 * service. Shared by the fetch side (which turns the indices into lat/lng
 * points) and the map side (which slices route.coords at these same
 * indices), so a TripTrafficResult's legs always line up with the polyline
 * segments they describe.
 */
export function getTrafficSampleIndices(
  route: Pick<RouteResult, "coords">,
  maxSamples = 10
): number[] {
  const sampleCount = Math.min(maxSamples, route.coords.length);
  if (sampleCount < 2) return [];

  return Array.from({ length: sampleCount }, (_, index) =>
    Math.round((index * (route.coords.length - 1)) / (sampleCount - 1))
  );
}

type RoutesApiResponse =
  | {
      success: true;
      data:
        | RouteResult[]
        | {
            routes: RouteResult[];
            tripHistoryId?: string | null;
          };
    }
  | {
      success: false;
      message?: string;
      errors?: Record<string, unknown>;
    };

type FetchRoutesOptions = {
  passengerCount?: number;
  departureMode?: "now" | "scheduled";
  scheduledAt?: string | null;
};

export async function fetchTripTraffic(
  origin: TrafficPoint,
  destination: TrafficPoint,
  stops: TrafficPoint[] = [],
  options: FetchRoutesOptions = {}
): Promise<TripTrafficResult> {
  const response = await fetch("/api/traffic/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin,
      destination,
      stops,
      departureMode: options.departureMode ?? "now",
      scheduledAt: options.scheduledAt ?? null,
    }),
  });
  const payload = (await response.json()) as
    | { success: true; data: TripTrafficResult }
    | { success: false; message?: string };

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.success ? "Unable to fetch live traffic." : payload.message
    );
  }

  return payload.data;
}


export type RoutePoint = {
  lat: number;
  lng: number;
  label: string;
};


function getRoutesErrorMessage(payload: RoutesApiResponse) {
  if (payload.success) return "Unable to find routes.";
  if (payload.message) return payload.message;

  for (const value of Object.values(payload.errors ?? {})) {
    if (typeof value === "string" && value) return value;

    if (Array.isArray(value)) {
      const firstError = value.find(
        (entry): entry is string => typeof entry === "string" && entry.length > 0
      );
      if (firstError) return firstError;
    }
  }

  return "Unable to find routes.";
}

export async function fetchRoutes(
  origin: RoutePoint,
  destination: RoutePoint,
  stops: RoutePoint[] = [],
  options: FetchRoutesOptions = {}
): Promise<FetchRoutesResult> {
  const response = await fetch("/api/trip-input/routes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      origin,
      destination,
      stops,
      passengerCount: options.passengerCount ?? 1,
      departureMode: options.departureMode ?? "now",
      scheduledAt: options.scheduledAt ?? undefined,
    }),
  });

  const payload = (await response.json()) as RoutesApiResponse;

  if (!response.ok || !payload.success) {
    throw new Error(getRoutesErrorMessage(payload));
  }

  if (Array.isArray(payload.data)) {
    return {
      routes: payload.data,
      tripHistoryId: null,
    };
  }

  return {
    routes: payload.data.routes,
    tripHistoryId: payload.data.tripHistoryId ?? null,
  };
}

export async function updateTripHistorySelectedRoute(
  tripHistoryId: string,
  routeId: string
) {
  const response = await fetch(`/api/trip-input/history/${tripHistoryId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ routeId }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message ?? "Unable to update selected route.");
  }
}