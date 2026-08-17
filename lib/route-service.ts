import "server-only";

import { ROUTE_COLORS, type LatLng, type RouteLeg, type RouteResult } from "@/lib/routing";

const ORS_BASE = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const ORS_TIMEOUT_MS = 12_000;
const MAX_ROUTE_SUGGESTIONS = 3;
const DUPLICATE_DISTANCE_TOLERANCE_KM = 0.25;
const DUPLICATE_DURATION_TOLERANCE_MIN = 3;
const DUPLICATE_AVERAGE_POINT_TOLERANCE_METERS = 220;
const DUPLICATE_MAX_POINT_TOLERANCE_METERS = 650;
const ROUTE_SAMPLE_COUNT = 12;

type OrsFeature = {
  geometry: { coordinates: [number, number][] };
  properties: {
    summary: { distance: number; duration: number };
    segments: Array<{ distance: number; duration: number; steps: unknown[] }>;
    way_points: number[];
  };
};

type RouteWaypoint = LatLng & {
  label?: string;
  dwellMinutes?: number;
};

type OrsErrorPayload = {
  error?: string | { message?: string };
  message?: string;
};

export class RouteServiceError extends Error {
  statusCode: number;
  userMessage: string;

  constructor(message: string, statusCode: number, userMessage: string) {
    super(message);
    this.name = "RouteServiceError";
    this.statusCode = statusCode;
    this.userMessage = userMessage;
  }
}

function getOrsApiKey() {
  return process.env.ORS_API_KEY;
}

function getOrsErrorDetail(details: string) {
  try {
    const payload = JSON.parse(details) as OrsErrorPayload;

    if (typeof payload.error === "string") {
      return payload.error;
    }

    if (
      typeof payload.error === "object" &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }

    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    return details;
  }

  return details;
}

function getFriendlyOrsMessage(status: number, detail: string) {
  if (status === 401 || status === 403) {
    return "Routing service credentials need attention.";
  }

  if (status === 404) {
    return "No drivable route was found between these places.";
  }

  if (status === 429) {
    return "Routing is busy right now. Please wait a moment and try again.";
  }

  if (status >= 500) {
    return "Routing service is temporarily unavailable.";
  }

  if (detail.toLowerCase().includes("point")) {
    return "One of the selected places cannot be routed by car.";
  }

  return "Unable to find routes for these places.";
}

function distanceMeters(first: [number, number], second: [number, number]) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(second[0] - first[0]);
  const dLng = toRadians(second[1] - first[1]);
  const lat1 = toRadians(first[0]);
  const lat2 = toRadians(second[0]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function getCumulativeRouteDistances(coords: [number, number][]) {
  const distances = [0];

  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];

    if (!previous || !current) continue;

    distances[index] = distances[index - 1] + distanceMeters(previous, current);
  }

  return distances;
}

function interpolatePoint(
  first: [number, number],
  second: [number, number],
  ratio: number
): [number, number] {
  return [
    first[0] + (second[0] - first[0]) * ratio,
    first[1] + (second[1] - first[1]) * ratio,
  ];
}

function getRoutePointAtDistance(
  coords: [number, number][],
  cumulativeDistances: number[],
  targetDistance: number
): [number, number] | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return coords[0] ?? null;

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    const previousDistance = cumulativeDistances[index - 1];
    const currentDistance = cumulativeDistances[index];

    if (
      previousDistance === undefined ||
      currentDistance === undefined ||
      targetDistance > currentDistance
    ) {
      continue;
    }

    const previous = coords[index - 1];
    const current = coords[index];

    if (!previous || !current) return null;

    const segmentDistance = currentDistance - previousDistance;
    const ratio =
      segmentDistance === 0
        ? 0
        : (targetDistance - previousDistance) / segmentDistance;

    return interpolatePoint(previous, current, ratio);
  }

  return coords[coords.length - 1] ?? null;
}

function sampleRoutePoints(coords: [number, number][]) {
  if (coords.length <= 1) {
    return coords;
  }

  const cumulativeDistances = getCumulativeRouteDistances(coords);
  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0;

  if (totalDistance === 0) {
    return [coords[0]].filter((coord): coord is [number, number] =>
      Boolean(coord)
    );
  }

  return Array.from({ length: ROUTE_SAMPLE_COUNT }, (_, index) => {
    const targetDistance = (index * totalDistance) / (ROUTE_SAMPLE_COUNT - 1);
    return getRoutePointAtDistance(coords, cumulativeDistances, targetDistance);
  }).filter((coord): coord is [number, number] => Boolean(coord));
}

function areDuplicateRoutes(first: RouteResult, second: RouteResult) {
  const distanceDelta = Math.abs(first.distanceKm - second.distanceKm);
  const durationDelta = Math.abs(first.durationMin - second.durationMin);

  if (
    distanceDelta > DUPLICATE_DISTANCE_TOLERANCE_KM ||
    durationDelta > DUPLICATE_DURATION_TOLERANCE_MIN
  ) {
    return false;
  }

  const firstSamples = sampleRoutePoints(first.coords);
  const secondSamples = sampleRoutePoints(second.coords);
  const sampleCount = Math.min(firstSamples.length, secondSamples.length);

  if (sampleCount === 0) {
    return false;
  }

  const pointDistances = Array.from({ length: sampleCount }, (_, index) =>
    distanceMeters(firstSamples[index], secondSamples[index])
  );
  const averageDistance =
    pointDistances.reduce((sum, distance) => sum + distance, 0) / sampleCount;
  const maxDistance = Math.max(...pointDistances);

  return (
    averageDistance <= DUPLICATE_AVERAGE_POINT_TOLERANCE_METERS &&
    maxDistance <= DUPLICATE_MAX_POINT_TOLERANCE_METERS
  );
}

function getRouteMetricSignature(route: RouteResult) {
  return `${route.distanceKm.toFixed(1)}:${route.durationMin}`;
}

function limitUniqueRoutes(routes: RouteResult[]) {
  const uniqueRoutes: RouteResult[] = [];
  const metricSignatures = new Set<string>();

  for (const route of routes) {
    const metricSignature = getRouteMetricSignature(route);
    const isDuplicate =
      metricSignatures.has(metricSignature) ||
      uniqueRoutes.some((uniqueRoute) => areDuplicateRoutes(route, uniqueRoute));

    if (!isDuplicate) {
      uniqueRoutes.push(route);
      metricSignatures.add(metricSignature);
    }

    if (uniqueRoutes.length >= MAX_ROUTE_SUGGESTIONS) {
      break;
    }
  }

  return uniqueRoutes.map((route, index) => {
    const primaryColor = ROUTE_COLORS[index % ROUTE_COLORS.length];

    return {
      ...route,
      id: `route-${index}`,
      rank: index + 1,
      legs:
        route.legs.length === 1
          ? [{ ...route.legs[0], color: primaryColor }]
          : route.legs,
    };
  });
}

function roundKm(meters: number) {
  return Math.round((meters / 1000) * 10) / 10;
}

function roundMinutes(seconds: number) {
  return Math.max(1, Math.round(seconds / 60));
}

function clampRouteIndex(value: number, maxIndex: number) {
  return Math.max(0, Math.min(maxIndex, value));
}

function getWaypointIndices(feature: OrsFeature, segmentCount: number, maxIndex: number) {
  const wayPoints = feature.properties.way_points;

  if (!Array.isArray(wayPoints) || wayPoints.length < segmentCount + 1) {
    return null;
  }

  const normalized = wayPoints
    .slice(0, segmentCount + 1)
    .map((point) => clampRouteIndex(Math.round(point), maxIndex));

  return normalized.every((point, pointIndex) => {
    const previous = normalized[pointIndex - 1];
    return pointIndex === 0 || previous === undefined || point >= previous;
  })
    ? normalized
    : null;
}

function getWaypointLabel(waypoint: RouteWaypoint | undefined, fallback: string) {
  if (!waypoint) return fallback;

  const label = waypoint.label ?? waypoint.name;
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

function getStopDwellMinutes(stop: RouteWaypoint | undefined) {
  if (
    stop &&
    typeof stop.dwellMinutes === "number" &&
    Number.isFinite(stop.dwellMinutes) &&
    stop.dwellMinutes > 0
  ) {
    return Math.round(stop.dwellMinutes);
  }

  return 0;
}

function mapOrsFeatureToRoute(
  feature: OrsFeature,
  index: number,
  waypoints: RouteWaypoint[],
) {
  const coords: [number, number][] = feature.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng]
  );

  const maxIndex = Math.max(0, coords.length - 1);
  const segments =
    feature.properties.segments.length > 0
      ? feature.properties.segments
      : [
          {
            distance: feature.properties.summary.distance,
            duration: feature.properties.summary.duration,
            steps: [],
          },
        ];
  const waypointIndices = getWaypointIndices(feature, segments.length, maxIndex);
  const hasStops = waypoints.length > 2;

  const legs: RouteLeg[] = segments.map((segment, legIndex) => {
    const fallbackStart = Math.round((legIndex * maxIndex) / segments.length);
    const fallbackEnd = Math.round(((legIndex + 1) * maxIndex) / segments.length);
    const startIndex = waypointIndices?.[legIndex] ?? fallbackStart;
    const endIndex = waypointIndices?.[legIndex + 1] ?? fallbackEnd;
    const dwellAfterMin =
      legIndex < waypoints.length - 2
        ? getStopDwellMinutes(waypoints[legIndex + 1])
        : 0;

    return {
      startIndex: clampRouteIndex(startIndex, maxIndex),
      endIndex: Math.max(
        clampRouteIndex(startIndex, maxIndex),
        clampRouteIndex(endIndex, maxIndex),
      ),
      color: hasStops
        ? ROUTE_COLORS[legIndex % ROUTE_COLORS.length]
        : ROUTE_COLORS[index % ROUTE_COLORS.length],
      distanceKm: roundKm(segment.distance),
      durationMin: roundMinutes(segment.duration),
      fromLabel: getWaypointLabel(waypoints[legIndex], `Point ${legIndex + 1}`),
      toLabel: getWaypointLabel(waypoints[legIndex + 1], `Point ${legIndex + 2}`),
      dwellAfterMin,
    };
  });

  const travelDurationMin = roundMinutes(feature.properties.summary.duration);
  const dwellDurationMin = legs.reduce(
    (total, leg) => total + (leg.dwellAfterMin ?? 0),
    0,
  );

  return {
    id: `route-${index}`,
    rank: index + 1,
    coords,
    distanceKm: roundKm(feature.properties.summary.distance),
    travelDurationMin,
    dwellDurationMin,
    durationMin: travelDurationMin + dwellDurationMin,
    legs,
  };
}

export async function fetchRouteSuggestions(
  origin: LatLng,
  destination: LatLng,
  stops: RouteWaypoint[] = []
) {
  const apiKey = getOrsApiKey();

  if (!apiKey) {
    throw new RouteServiceError(
      "Missing ORS_API_KEY in .env.local",
      503,
      "Routing service is not configured."
    );
  }

  const waypoints: RouteWaypoint[] = [origin, ...stops, destination];
  const coordinates = waypoints.map((p) => [p.lng, p.lat]);
  const hasStops = stops.length > 0;
  const body: Record<string, unknown> = {
    coordinates,
  };

  if (!hasStops) {
    body.alternative_routes = {
      target_count: MAX_ROUTE_SUGGESTIONS,
      weight_factor: 1.6,
      share_factor: 0.6,
    };
  }

  let response: Response;

  try {
    response = await fetch(ORS_BASE, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ORS_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RouteServiceError(
      error instanceof Error ? error.message : "OpenRouteService request failed",
      503,
      "Routing service is temporarily unavailable."
    );
  }

  if (!response.ok) {
    const details = await response.text();
    const detail = getOrsErrorDetail(details);

    throw new RouteServiceError(
      `Routing request failed: ${response.status} ${detail}`,
      response.status === 429 ? 429 : 502,
      getFriendlyOrsMessage(response.status, detail)
    );
  }

  const geojson = (await response.json()) as { features?: OrsFeature[] };
  const routes = (geojson.features ?? []).map((feature, index) =>
    mapOrsFeatureToRoute(feature, index, waypoints)
  );

  return limitUniqueRoutes(routes);
}
