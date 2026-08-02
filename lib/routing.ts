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

/**
 * Route and leg colors. These have to work on two very different surfaces —
 * drawn as polylines over light OpenStreetMap tiles, and as small legend dots
 * on the dark card background — so they sit at a mid lightness rather than
 * tracking the theme tokens, which are tuned for one surface each.
 *
 * Amber leads because it echoes the theme's primary; the rest are spaced far
 * enough apart in hue to stay tellable apart at 5px on a busy map. Indexes 3
 * and 4 only appear on trips with four or more legs.
 */
export const ROUTE_COLORS = [
  "#d97706", // amber
  "#0d9488", // teal
  "#be123c", // rose
  "#4f46e5", // indigo
  "#65a30d", // lime
];

/**
 * Waypoint markers stay monochrome so the color channel belongs to the routes
 * alone. Position is carried by the label instead: A, numbered stops, then B.
 */
export const MARKER_COLOR = "#1c1917";

/** Non-selected alternatives, faded back behind the active route. */
export const INACTIVE_ROUTE_COLOR = "#9ca3af";

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

/**
 * The routes endpoint re-validates the trip server-side and stores it in trip
 * history, both of which require a label — so a bare lat/lng pair is rejected.
 */
export type RoutePoint = {
  lat: number;
  lng: number;
  label: string;
};

/** Pulls the real reason out of a failed response instead of a generic string. */
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
