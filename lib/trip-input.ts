/**
 * The service area: a bounding box covering all 13 districts of Dhaka Division
 * — Dhaka, Gazipur, Kishoreganj, Manikganj, Munshiganj, Narayanganj, Narsingdi,
 * Tangail, Faridpur, Gopalganj, Madaripur, Rajbari and Shariatpur.
 *
 * This one box drives three things: the Nominatim `viewbox` that restricts
 * autocomplete results, the server-side check in validateTripInput, and the
 * client-side guard on "Use Current Location". Changing it moves all three.
 *
 * It is deliberately a rectangle, not the division's true outline. Nominatim's
 * viewbox only accepts a rectangle, and validating against a tighter polygon
 * would let someone pick a suggestion that then failed to validate.
 *
 * Some spill into neighbouring divisions is unavoidable: Tangail reaches as far
 * north as Mymensingh city, and Gopalganj as far south and west as Khulna, so
 * no rectangle containing the division can exclude them. Mymensingh, Comilla,
 * Brahmanbaria, Chandpur, Khulna, Magura and Narail all fall inside. Erring
 * wide keeps autocomplete and validation consistent and never blocks a genuine
 * in-division trip. Swap in a point-in-polygon test if that becomes a problem.
 */
export const SERVICE_AREA_BOUNDS = {
  west: 89.3,
  south: 22.8,
  east: 91.2,
  north: 24.8,
} as const;

export const SERVICE_AREA_NAME = "Dhaka Division";

export function outsideServiceAreaMessage(field: string) {
  return `${field} must be inside the ${SERVICE_AREA_NAME} service area.`;
}

export const NOMINATIM_SERVICE_AREA_VIEWBOX = [
  SERVICE_AREA_BOUNDS.west,
  SERVICE_AREA_BOUNDS.north,
  SERVICE_AREA_BOUNDS.east,
  SERVICE_AREA_BOUNDS.south,
].join(",");

export const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2;
export const MAX_AUTOCOMPLETE_RESULTS = 8;
export const MAX_STOPS = 6;
export const DEFAULT_STOP_DWELL_MINUTES = 5;
export const MIN_STOP_DWELL_MINUTES = 0;
export const MAX_STOP_DWELL_MINUTES = 60;
export const MIN_TRIP_DISTANCE_METERS = 500;
export const MIN_PASSENGER_COUNT = 1;
export const MAX_PASSENGER_COUNT = 8;
export const SCHEDULE_WINDOW_DAYS = 7;

export type TripLocation = {
  id?: string;
  label: string;
  lat: number;
  lng: number;
};

export type TripStop = TripLocation & {
  dwellMinutes: number;
};

export type DepartureMode = "now" | "scheduled";

export type TripValidationPayload = {
  origin?: unknown;
  destination?: unknown;
  stops?: unknown;
  passengerCount?: unknown;
  departureMode?: unknown;
  scheduledAt?: unknown;
};

export type TripValidationErrors = {
  origin?: string;
  destination?: string;
  stops?: string[];
  passengerCount?: string;
  departureMode?: string;
  scheduledAt?: string;
};

export type ValidatedTripInput = {
  origin: TripLocation;
  destination: TripLocation;
  stops: TripStop[];
  passengerCount: number;
  departureMode: DepartureMode;
  scheduledAt?: string;
  distanceMeters: number;
};

export type TripValidationResult =
  | { success: true; data: ValidatedTripInput }
  | { success: false; errors: TripValidationErrors };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function isValidLatitude(value: unknown) {
  const lat = toFiniteNumber(value);
  return lat !== null && lat >= -90 && lat <= 90;
}

export function isValidLongitude(value: unknown) {
  const lng = toFiniteNumber(value);
  return lng !== null && lng >= -180 && lng <= 180;
}

export function isInsideServiceArea(
  location: Pick<TripLocation, "lat" | "lng">,
) {
  return (
    location.lat >= SERVICE_AREA_BOUNDS.south &&
    location.lat <= SERVICE_AREA_BOUNDS.north &&
    location.lng >= SERVICE_AREA_BOUNDS.west &&
    location.lng <= SERVICE_AREA_BOUNDS.east
  );
}

export function normalizeTripLocation(value: unknown): TripLocation | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = typeof value.label === "string" ? value.label.trim() : "";
  const lat = toFiniteNumber(value.lat);
  const lng = toFiniteNumber(value.lng);

  if (!label || lat === null || lng === null || !isValidLatitude(lat) || !isValidLongitude(lng)) {
    return null;
  }

  return {
    ...(typeof value.id === "string" && value.id.trim() ? { id: value.id.trim() } : {}),
    label,
    lat,
    lng,
  };
}

function normalizeStopDwellMinutes(value: unknown) {
  const dwellMinutes = value === undefined ? DEFAULT_STOP_DWELL_MINUTES : Number(value);

  if (
    !Number.isInteger(dwellMinutes) ||
    dwellMinutes < MIN_STOP_DWELL_MINUTES ||
    dwellMinutes > MAX_STOP_DWELL_MINUTES
  ) {
    return null;
  }

  return dwellMinutes;
}

export function normalizeTripStop(value: unknown): TripStop | null {
  const location = normalizeTripLocation(value);

  if (!location || !isRecord(value)) {
    return null;
  }

  const dwellMinutes = normalizeStopDwellMinutes(value.dwellMinutes);

  if (dwellMinutes === null) {
    return null;
  }

  return {
    ...location,
    dwellMinutes,
  };
}

export function calculateDistanceMeters(
  first: Pick<TripLocation, "lat" | "lng">,
  second: Pick<TripLocation, "lat" | "lng">,
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(second.lat - first.lat);
  const dLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
}

export function getScheduleWindow(now = new Date()) {
  return {
    min: now,
    max: new Date(now.getTime() + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  };
}

export function validateTripInput(
  payload: TripValidationPayload,
  now = new Date(),
): TripValidationResult {
  const errors: TripValidationErrors = {};
  const origin = normalizeTripLocation(payload.origin);
  const destination = normalizeTripLocation(payload.destination);

  if (!origin) {
    errors.origin = "Origin is required.";
  } else if (!isInsideServiceArea(origin)) {
    errors.origin = outsideServiceAreaMessage("Origin");
  }

  if (!destination) {
    errors.destination = "Destination is required.";
  } else if (!isInsideServiceArea(destination)) {
    errors.destination = outsideServiceAreaMessage("Destination");
  }

  const stopsInput = Array.isArray(payload.stops) ? payload.stops : [];
  const stopErrors: string[] = [];

  if (stopsInput.length > MAX_STOPS) {
    stopErrors.push(`You can add up to ${MAX_STOPS} stops.`);
  }

  const stops = stopsInput.map((stop, index) => {
    const normalizedStop = normalizeTripStop(stop);
    if (!normalizedStop) {
      stopErrors[index] = `Stop is required and wait time must be ${MIN_STOP_DWELL_MINUTES}-${MAX_STOP_DWELL_MINUTES} minutes.`;
    } else if (!isInsideServiceArea(normalizedStop)) {
      stopErrors[index] = outsideServiceAreaMessage(`Stop ${index + 1}`);
    }
    return normalizedStop;
  });

  if (stopErrors.length > 0) {
    errors.stops = stopErrors;
  }

  const passengerCount = Number(payload.passengerCount);

  if (
    !Number.isInteger(passengerCount) ||
    passengerCount < MIN_PASSENGER_COUNT ||
    passengerCount > MAX_PASSENGER_COUNT
  ) {
    errors.passengerCount = `Passenger count must be between ${MIN_PASSENGER_COUNT} and ${MAX_PASSENGER_COUNT}.`;
  }

  const departureMode = payload.departureMode === "scheduled" ? "scheduled" : payload.departureMode;

  if (departureMode !== "now" && departureMode !== "scheduled") {
    errors.departureMode = "Departure mode must be leave now or scheduled.";
  }

  let scheduledAt: string | undefined;

  if (departureMode === "scheduled") {
    if (typeof payload.scheduledAt !== "string" || !payload.scheduledAt) {
      errors.scheduledAt = "Scheduled departure time is required.";
    } else {
      const scheduledDate = new Date(payload.scheduledAt);
      const { max } = getScheduleWindow(now);

      if (Number.isNaN(scheduledDate.getTime())) {
        errors.scheduledAt = "Scheduled departure time is invalid.";
      } else if (scheduledDate <= now) {
        errors.scheduledAt = "Scheduled departure time must be in the future.";
      } else if (scheduledDate > max) {
        errors.scheduledAt = `Scheduled departure time must be within the next ${SCHEDULE_WINDOW_DAYS} days.`;
      } else {
        scheduledAt = scheduledDate.toISOString();
      }
    }
  }

  let distanceMeters = 0;

  // Skip when either endpoint already failed, so a "same place" or "too short"
  // message cannot overwrite the more specific service-area one.
  if (origin && destination && !errors.origin && !errors.destination) {
    distanceMeters = calculateDistanceMeters(origin, destination);

    if (distanceMeters === 0) {
      errors.destination = "Origin and destination cannot be the same.";
    } else if (distanceMeters < MIN_TRIP_DISTANCE_METERS) {
      errors.destination = `Trip distance must be at least ${MIN_TRIP_DISTANCE_METERS} meters.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      origin: origin as TripLocation,
      destination: destination as TripLocation,
      stops: stops.filter((stop): stop is TripStop => stop !== null),
      passengerCount,
      departureMode: departureMode as DepartureMode,
      ...(scheduledAt ? { scheduledAt } : {}),
      distanceMeters,
    },
  };
}
