/**
 * The gap between a place the user picked and where the route meets the road.
 *
 * A place search returns the middle of a place — of a campus, an airport, a
 * park. The routing provider quietly moves that point to the nearest road a
 * car can use and routes from there. For a shop on a street the two are the
 * same spot. For a campus they can be hundreds of metres apart, with the road
 * outside the wrong gate, and a route drawn to "the university" says nothing
 * about that.
 *
 * This only measures and reports the gap. It does not know where the entrance
 * is, and it adds no walking time: a straight line is not a path.
 */

/**
 * Beyond this the pin is unlikely to be at the kerb. Street addresses mostly
 * sit within 20–50 m of their road; campuses, airports and parks are usually
 * 100 m or more from the nearest drivable one.
 */
export const ACCESS_GAP_THRESHOLD_METERS = 75;

/** One waypoint whose routed point is further from its pin than the threshold. */
export type RouteAccessGap = {
  /** Position in the trip: 0 is the origin, the last is the destination. */
  waypointIndex: number;
  gapMeters: number;
};

function formatGap(meters: number) {
  return meters >= 1000
    ? `${(Math.round(meters / 100) / 10).toFixed(1)} km`
    : `${Math.round(meters / 10) * 10} m`;
}

/** The place's own name, without the address a search result appends to it. */
function shortLabel(label: string | undefined, fallback: string) {
  const name = label?.split(",")[0]?.trim();

  return name || fallback;
}

/**
 * What to tell the user about one gap. `waypointLabels` are the trip's places
 * in order, origin first; the wording depends on which of them it is.
 */
export function describeAccessGap(gap: RouteAccessGap, waypointLabels: Array<string | undefined>) {
  const distance = formatGap(gap.gapMeters);
  const lastIndex = waypointLabels.length - 1;

  if (gap.waypointIndex === 0) {
    const place = shortLabel(waypointLabels[0], "the origin");
    return `The route starts about ${distance} from ${place}. The pin may not be a usable pickup point.`;
  }

  if (gap.waypointIndex >= lastIndex) {
    const place = shortLabel(waypointLabels[lastIndex], "the destination");
    return `The route ends about ${distance} from ${place}. The pin may not be a usable entrance.`;
  }

  const place = shortLabel(waypointLabels[gap.waypointIndex], `stop ${gap.waypointIndex}`);
  return `The route passes about ${distance} from ${place}. The pin may not be a usable stopping point.`;
}

/** Names a waypoint by its position, for messages about the trip as a whole. */
export function describeWaypointRole(waypointIndex: number, waypointCount: number) {
  if (waypointIndex === 0) return "The origin";
  if (waypointIndex >= waypointCount - 1) return "The destination";
  return `Stop ${waypointIndex}`;
}
