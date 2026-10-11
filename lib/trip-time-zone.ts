import "server-only";

import tzlookup from "tz-lookup";

import { getCountryConfig, type CountryCode } from "@/lib/country-config";

/**
 * Which IANA zone a trip is in, from where it starts.
 *
 * This is server-only because tz-lookup carries its zone map in the module:
 * importing it from ./trip-input would ship that map to every browser that
 * loads the planner form. The validator takes this function as an argument
 * instead.
 *
 * tz-lookup is a coarse grid, not a border survey. It places real Bangladeshi
 * towns in India (Khagrachari, Kurigram, Benapole), Enniskillen in Ireland and
 * Blaine, Washington in Canada — and it is no closer on the other side, where
 * Dundalk reads as the UK. So its answer is only ever used to choose between a
 * country's own zones. It must not be used to decide whether a point is inside
 * the service area: no distance margin separates Khagrachari from Dublin.
 */

type Point = { lat: number; lng: number };

/** Rings searched, nearest first, when a point reads as a neighbour's zone. */
const NEARBY_RING_KM = [5, 10, 20, 40, 80];
const RING_BEARINGS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
const KM_PER_DEGREE = 111.32;

function lookUpZone(lat: number, lng: number) {
  try {
    return tzlookup(lat, lng);
  } catch {
    // tz-lookup throws on coordinates outside the globe.
    return null;
  }
}

export function resolveTripTimeZone(origin: Point, country: CountryCode): string {
  const { timeZone, timeZones } = getCountryConfig(country);

  // Nothing to choose between, so the coarse lookup cannot help or hurt.
  if (timeZones.length === 1) {
    return timeZone;
  }

  const direct = lookUpZone(origin.lat, origin.lng);

  if (direct && timeZones.includes(direct)) {
    return direct;
  }

  // A border town that reads as the neighbour's zone belongs to the nearest of
  // this country's zones, not to the country default: Blaine is on Pacific
  // time, three hours from the Eastern default.
  const kmPerLngDegree =
    KM_PER_DEGREE * Math.max(0.01, Math.cos((origin.lat * Math.PI) / 180));

  for (const ringKm of NEARBY_RING_KM) {
    for (const bearingDeg of RING_BEARINGS_DEG) {
      const bearing = (bearingDeg * Math.PI) / 180;
      const nearby = lookUpZone(
        origin.lat + (ringKm / KM_PER_DEGREE) * Math.cos(bearing),
        origin.lng + (ringKm / kmPerLngDegree) * Math.sin(bearing),
      );

      if (nearby && timeZones.includes(nearby)) {
        return nearby;
      }
    }
  }

  return timeZone;
}
