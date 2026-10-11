import { MAX_PASSENGER_COUNT, MIN_PASSENGER_COUNT } from "@/lib/trip-input";

/**
 * Whether a vehicle seats a party, and what a form should do when it stops
 * doing so. Shared so the picker and the server cannot disagree about which
 * vehicles are on offer for a passenger count.
 */

type Seated = { maxPassengers: number };

export function seatsPassengers(vehicle: Seated, passengerCount: number) {
  return vehicle.maxPassengers >= passengerCount;
}

/**
 * A passenger count from a number field, held inside the range a trip allows.
 * An empty or non-numeric field reads as the minimum, never as zero.
 */
export function clampPassengerCount(value: unknown) {
  const count = Math.trunc(Number(value));

  if (!Number.isFinite(count)) return MIN_PASSENGER_COUNT;

  return Math.min(MAX_PASSENGER_COUNT, Math.max(MIN_PASSENGER_COUNT, count));
}

/**
 * The selected vehicle's id if it still seats the party, otherwise no
 * selection.
 *
 * A picker that only lists vehicles big enough must also let go of a selection
 * that drops out of the list: left alone, the hidden vehicle is still submitted
 * and the server rejects it for a reason the user cannot see or fix.
 */
export function keepVehicleIfItFits<T extends Seated & { id: string }>(
  vehicleId: string,
  vehicles: T[],
  passengerCount: number,
) {
  const selected = vehicles.find((vehicle) => vehicle.id === vehicleId);

  return selected && seatsPassengers(selected, passengerCount) ? vehicleId : "";
}
