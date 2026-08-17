/**
 * Wire shapes for the saved-trips UI, re-exported from the server module that
 * defines them so the two cannot drift.
 *
 * `export type` is erased at compile time, so this never pulls
 * lib/saved-trips.ts — which is "server-only" — into a client bundle. Same
 * arrangement as components/notifications/types.ts.
 */
export type { SavedTripDetail, SavedTripCondition } from "@/lib/saved-trips";
export type { AlertConditionType, TrafficLevel } from "@/models/SavedTrip";

/** Vehicle choices the server page hands to the create form. */
export type VehicleOption = {
  id: string;
  displayName: string;
  maxPassengers: number;
};
