import { MAX_PASSENGER_COUNT, MIN_PASSENGER_COUNT } from "@/lib/trip-input";

/**
 * A passenger count from a number field, held inside the range a trip allows.
 * An empty or non-numeric field reads as the minimum, never as zero.
 */
export function clampPassengerCount(value: unknown) {
  const count = Math.trunc(Number(value));

  if (!Number.isFinite(count)) return MIN_PASSENGER_COUNT;

  return Math.min(MAX_PASSENGER_COUNT, Math.max(MIN_PASSENGER_COUNT, count));
}
