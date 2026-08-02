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
  "#9333ea",
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#ec4899",
];

export type FetchRoutesResult = {
  routes: RouteResult[];
  tripHistoryId: string | null;
};

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

export async function fetchRoutes(
  origin: LatLng,
  destination: LatLng,
  stops: LatLng[] = [],
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
    throw new Error(
      payload.success
        ? "Unable to find routes."
        : payload.message ?? "Unable to find routes."
    );
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
