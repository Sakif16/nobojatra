import type { PlaceResult } from "@/lib/geocode";
import type { SavedTripDetail } from "./types";

export function savedTripRequest(input: {
  name: string;
  origin: PlaceResult;
  destination: PlaceResult;
  passengerCount: number;
  initialTrip?: SavedTripDetail | null;
}) {
  const { name, origin, destination, passengerCount, initialTrip } = input;
  return {
    name: name.trim(), origin, destination, passengerCount,
    stops: initialTrip?.stops ?? [],
    ...(initialTrip ? { expectedUpdatedAt: initialTrip.updatedAt } : {}),
  };
}
