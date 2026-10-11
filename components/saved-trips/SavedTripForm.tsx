"use client";

import { useState } from "react";
import PlaceAutocomplete, {
  type SavedPlaceOption,
} from "@/components/map/PlaceAutocomplete";
import { buttonVariants } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/field-styles";
import type { PlaceResult } from "@/lib/geocode";
import { MAX_PASSENGER_COUNT, MIN_PASSENGER_COUNT } from "@/lib/trip-input";
import { clampPassengerCount } from "@/lib/vehicle-capacity";
import type { SavedTripDetail } from "./types";
import { readJson } from "@/lib/read-json";
import StatusMessage from "@/components/ui/status-message";

/**
 * Creates a named trip: a name, two places and a party size.
 *
 * There is no departure time and no vehicle. Both are chosen in the planner
 * when the trip is planned, so a saved trip never goes stale.
 */
export default function SavedTripForm({
  savedPlaces,
  onCreated,
  onCancel,
}: {
  savedPlaces: SavedPlaceOption[];
  onCreated: (trip: SavedTripDetail) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [origin, setOrigin] = useState<PlaceResult | null>(null);
  const [destinationLabel, setDestinationLabel] = useState("");
  const [destination, setDestination] = useState<PlaceResult | null>(null);
  // The field keeps what was typed, so it can be emptied while editing; the
  // count the form acts on is always inside the allowed range.
  const [passengerInput, setPassengerInput] = useState("1");
  const passengerCount = clampPassengerCount(passengerInput);
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
        }),
      });

      const payload = await readJson<{
        success: boolean;
        trip?: SavedTripDetail;
        message?: string;
      }>(response);

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
            min={MIN_PASSENGER_COUNT}
            max={MAX_PASSENGER_COUNT}
            value={passengerInput}
            onChange={(event) => setPassengerInput(event.target.value)}
            onBlur={() => setPassengerInput(String(passengerCount))}
            className={fieldClassName()}
          />
        </div>
      </div>

      {error && <StatusMessage size="sm">{error}</StatusMessage>}

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
