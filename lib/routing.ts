// Routing via OpenRouteService — free tier: 2,000 requests/day.
// Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions

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
  coords: [number, number][]; // [lat, lng][]
  distanceKm: number;
  durationMin: number;
  legs: RouteLeg[];
};

// Fixed palette for multi-stop legs and alternative routes.
export const ROUTE_COLORS = [
  "#9333ea", // purple (primary route)
  "#0ea5e9", // sky blue
  "#f97316", // orange
  "#22c55e", // green
  "#ec4899", // pink
];

const ORS_BASE = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

export async function fetchRoutes(
  origin: LatLng,
  destination: LatLng,
  stops: LatLng[] = []
): Promise<RouteResult[]> {
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing NEXT_PUBLIC_ORS_API_KEY in .env.local");
  }

  const waypoints = [origin, ...stops, destination];
  const coordinates = waypoints.map((p) => [p.lng, p.lat]);

  const hasStops = stops.length > 0;

  const body: Record<string, unknown> = {
    coordinates,
  };

  // ORS only supports alternative_routes for simple A→B trips (no via points).
  if (!hasStops) {
    body.alternative_routes = {
      target_count: 3,
      weight_factor: 1.6,
      share_factor: 0.6,
    };
  }

  const res = await fetch(ORS_BASE, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Routing request failed: ${res.status} ${text}`);
  }

  const geojson = await res.json();

  const features: Array<{
    geometry: { coordinates: [number, number][] };
    properties: {
      summary: { distance: number; duration: number };
      segments: Array<{ distance: number; duration: number; steps: unknown[] }>;
      way_points: number[];
    };
  }> = geojson.features;

  return features.map((feature, idx) => {
    const coords: [number, number][] = feature.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng]
    );

    let legs: RouteLeg[] = [];

    if (hasStops) {
      // Split into one colored leg per origin→stop→...→destination segment,
      // using way_points (indices into `coords`) to find leg boundaries.
      // way_points gives [startIdx, endIdx] per response overall; ORS returns
      // per-segment distance in properties.segments, matched 1:1 with legs.
      const segs = feature.properties.segments;
      let cursor = 0;
      const totalPoints = coords.length;
      const pointsPerLeg = Math.floor(totalPoints / segs.length);

      segs.forEach((seg, legIdx) => {
        const start = cursor;
        const end =
          legIdx === segs.length - 1 ? totalPoints - 1 : cursor + pointsPerLeg;
        legs.push({
          startIndex: start,
          endIndex: end,
          color: ROUTE_COLORS[legIdx % ROUTE_COLORS.length],
          distanceKm: Math.round((seg.distance / 1000) * 10) / 10,
        });
        cursor = end;
      });
    } else {
      legs = [
        {
          startIndex: 0,
          endIndex: coords.length - 1,
          color: ROUTE_COLORS[idx % ROUTE_COLORS.length],
          distanceKm:
            Math.round((feature.properties.summary.distance / 1000) * 10) /
            10,
        },
      ];
    }

    return {
      id: `route-${idx}`,
      rank: idx + 1,
      coords,
      distanceKm:
        Math.round((feature.properties.summary.distance / 1000) * 10) / 10,
      durationMin: Math.round(feature.properties.summary.duration / 60),
      legs,
    };
  });
}