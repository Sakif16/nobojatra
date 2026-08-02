export const DHAKA_BOUNDS = {
  west: 90.3,
  south: 23.65,
  east: 90.55,
  north: 23.9,
} as const;

export const NOMINATIM_DHAKA_VIEWBOX = [
  DHAKA_BOUNDS.west,
  DHAKA_BOUNDS.north,
  DHAKA_BOUNDS.east,
  DHAKA_BOUNDS.south,
].join(",");

export const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2;
export const MAX_AUTOCOMPLETE_RESULTS = 8;
export const MAX_STOPS = 6;
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
  stops: TripLocation[];
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

export function isInsideDhakaBounds(location: Pick<TripLocation, "lat" | "lng">) {
  return (
    location.lat >= DHAKA_BOUNDS.south &&
    location.lat <= DHAKA_BOUNDS.north &&
    location.lng >= DHAKA_BOUNDS.west &&
    location.lng <= DHAKA_BOUNDS.east
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
  }

  if (!destination) {
    errors.destination = "Destination is required.";
  }

  const stopsInput = Array.isArray(payload.stops) ? payload.stops : [];
  const stopErrors: string[] = [];

  if (stopsInput.length > MAX_STOPS) {
    stopErrors.push(`You can add up to ${MAX_STOPS} stops.`);
  }

  const stops = stopsInput.map((stop, index) => {
    const normalizedStop = normalizeTripLocation(stop);
    if (!normalizedStop) {
      stopErrors[index] = "Stop is required.";
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

  if (origin && destination) {
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
      stops: stops.filter((stop): stop is TripLocation => stop !== null),
      passengerCount,
      departureMode: departureMode as DepartureMode,
      ...(scheduledAt ? { scheduledAt } : {}),
      distanceMeters,
    },
  };
}
