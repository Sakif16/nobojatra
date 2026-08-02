import type { PlaceResult } from "@/lib/geocode";

const PENDING_TRIP_KEY = "nobojatra:pending-trip";

export type PendingTrip = {
  origin: PlaceResult;
  destination: PlaceResult;
  stops: PlaceResult[];
  passengerCount: number;
  departureMode: "now" | "scheduled";
  scheduledAt: string | null;
};

function isPlaceResult(value: unknown): value is PlaceResult {
  if (typeof value !== "object" || value === null) return false;

  const place = value as Record<string, unknown>;

  return (
    typeof place.label === "string" &&
    typeof place.lat === "number" &&
    Number.isFinite(place.lat) &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lng)
  );
}

function isPendingTrip(value: unknown): value is PendingTrip {
  if (typeof value !== "object" || value === null) return false;

  const trip = value as Record<string, unknown>;

  return (
    isPlaceResult(trip.origin) &&
    isPlaceResult(trip.destination) &&
    Array.isArray(trip.stops) &&
    trip.stops.every(isPlaceResult) &&
    typeof trip.passengerCount === "number" &&
    (trip.departureMode === "now" || trip.departureMode === "scheduled")
  );
}

/**
 * Anonymous visitors can search for places but not fetch routes — that endpoint
 * requires a session. Rather than throwing away what they typed, we stash the
 * trip and replay it once they land back on the home page with an account.
 *
 * sessionStorage (not a query string) keeps the payload off the URL and out of
 * server logs, and it survives the client-side nav through signup.
 */
export function savePendingTrip(trip: PendingTrip) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(PENDING_TRIP_KEY, JSON.stringify(trip));
  } catch {
    // Private browsing or a full quota — losing the handoff is not fatal.
  }
}

/** Reads and clears the stashed trip, so a replay never happens twice. */
export function takePendingTrip(): PendingTrip | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_TRIP_KEY);
    if (!raw) return null;

    window.sessionStorage.removeItem(PENDING_TRIP_KEY);

    const parsed: unknown = JSON.parse(raw);
    return isPendingTrip(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

