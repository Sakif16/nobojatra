"use client";

import { useState } from "react";
import PlaceAutocomplete, {
  type SavedPlaceOption,
} from "@/components/map/PlaceAutocomplete";
import { buttonVariants } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/field-styles";
import type { PlaceResult } from "@/lib/geocode";
import type { SavedTripDetail, VehicleOption } from "./types";

/**
 * Creates a named trip.
 *
 * Departure is fixed to "leave now" deliberately. A saved trip exists to be
 * re-evaluated on a schedule, but validateTripInput requires a scheduled time
 * to be in the future — so a trip saved with an absolute departure goes stale
 * the moment it passes, and any later edit then fails validation on a field
 * the user never touched. The API still accepts "scheduled" if that changes.
 */
export default function SavedTripForm({
  savedPlaces,
  vehicles,
  onCreated,
  onCancel,
}: {
  savedPlaces: SavedPlaceOption[];
  vehicles: VehicleOption[];
  onCreated: (trip: SavedTripDetail) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [origin, setOrigin] = useState<PlaceResult | null>(null);
  const [destinationLabel, setDestinationLabel] = useState("");
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [vehicleId, setVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give this trip a name.");
    if (!origin) return setError("Pick an origin from the suggestions.");
    if (!destination) return setError("Pick a destination from the suggestions.");

    setSubmitting(true);

    try {
      const response = await fetch("/api/saved-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          origin,
          destination,
          stops: [],
          passengerCount,
          departureMode: "now",
          preferredVehicleRateId: vehicleId || null,
        }),
      });

      const payload = (await response.json()) as {
        success: boolean;
        trip?: SavedTripDetail;
        message?: string;
      };

      if (!response.ok || !payload.success || !payload.trip) {
        throw new Error(payload.message ?? "Could not save this trip.");
      }

      onCreated(payload.trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this trip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">New saved trip</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="trip-name" className="text-xs font-medium text-muted-foreground">
          Trip name
        </label>
        <input
          id="trip-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="Morning commute"
          className={fieldClassName()}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">From</span>
        <PlaceAutocomplete
          placeholder="Enter location"
          value={originLabel}
          savedPlaces={savedPlaces}
          icon={<span className="block size-2.5 rounded-full border-2 border-foreground" />}
          onChange={(value) => {
            setOriginLabel(value);
            setOrigin(null);
          }}
          onSelect={(place) => {
            setOrigin(place);
            setOriginLabel(place.label);
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">To</span>
        <PlaceAutocomplete
          placeholder="Enter destination"
          value={destinationLabel}
          savedPlaces={savedPlaces}
          icon={<span className="block size-2.5 rounded-full bg-foreground" />}
          onChange={(value) => {
            setDestinationLabel(value);
            setDestination(null);
          }}
          onSelect={(place) => {
            setDestination(place);
            setDestinationLabel(place.label);
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="passengers" className="text-xs font-medium text-muted-foreground">
            Passengers
          </label>
          <input
            id="passengers"
            type="number"
            min={1}
            max={8}
            value={passengerCount}
            onChange={(event) => setPassengerCount(Number(event.target.value))}
            className={fieldClassName()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="vehicle" className="text-xs font-medium text-muted-foreground">
            Vehicle (needed for fare alerts)
          </label>
          <select
            id="vehicle"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            className={fieldClassName()}
          >
            <option value="">No vehicle</option>
            {vehicles
              .filter((vehicle) => vehicle.maxPassengers >= passengerCount)
              .map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.displayName}
                </option>
              ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className={buttonVariants({ size: "md" })}
        >
          {submitting ? "Saving…" : "Save trip"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={buttonVariants({ variant: "outline", size: "md" })}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
