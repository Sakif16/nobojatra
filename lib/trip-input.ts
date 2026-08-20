import {
  DEFAULT_COUNTRY,
  getCountryConfig,
  getNominatimViewbox,
  type CountryCode,
} from "@/lib/country-config";

/**
 * The service area is no longer one fixed box. Each country in ./country-config
 * carries its own bounds and name, and every check below takes the country the
 * trip is being planned in.
 *
 * The Bangladesh entry keeps the original rectangle covering all 13 districts
 * of Dhaka Division, and the original reasoning still holds for it: it is
 * deliberately a rectangle rather than the division's true outline, because
 * Nominatim's viewbox only accepts a rectangle and validating against a tighter
 * polygon would let someone pick a suggestion that then failed to validate.
 * Some spill into neighbouring divisions is unavoidable — Tangail reaches as
 * far north as Mymensingh city, Gopalganj as far south-west as Khulna — and
 * erring wide never blocks a genuine in-division trip.
 */
export function isInsideServiceArea(
  location: Pick<TripLocation, "lat" | "lng">,
  country: CountryCode = DEFAULT_COUNTRY,
) {
  const bounds = getCountryConfig(country).bounds;

  return (
    location.lat >= bounds.south &&
    location.lat <= bounds.north &&
    location.lng >= bounds.west &&
    location.lng <= bounds.east
  );
}

export function outsideServiceAreaMessage(
  field: string,
  country: CountryCode = DEFAULT_COUNTRY,
) {
  return `${field} must be inside the ${getCountryConfig(country).serviceAreaName} service area.`;
}

export function getServiceAreaName(country: CountryCode = DEFAULT_COUNTRY) {
  return getCountryConfig(country).serviceAreaName;
}

/** Re-exported so callers do not need to reach into country-config directly. */
export function getNominatimServiceAreaViewbox(country: CountryCode = DEFAULT_COUNTRY) {
  return getNominatimViewbox(country);
}

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
  country: CountryCode = DEFAULT_COUNTRY,
): TripValidationResult {
  const errors: TripValidationErrors = {};
  const origin = normalizeTripLocation(payload.origin);
  const destination = normalizeTripLocation(payload.destination);

  if (!origin) {
    errors.origin = "Origin is required.";
  } else if (!isInsideServiceArea(origin, country)) {
    errors.origin = outsideServiceAreaMessage("Origin", country);
  }

  if (!destination) {
    errors.destination = "Destination is required.";
  } else if (!isInsideServiceArea(destination, country)) {
    errors.destination = outsideServiceAreaMessage("Destination", country);
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
    } else if (!isInsideServiceArea(normalizedStop, country)) {
      stopErrors[index] = outsideServiceAreaMessage(`Stop ${index + 1}`, country);
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
