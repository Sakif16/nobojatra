"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Camera, LocateFixed, Minus, Plus, X } from "lucide-react";
import PlaceAutocomplete, { type SavedPlaceOption } from "./PlaceAutocomplete";
import ImageLocationModal from "./ImageLocationModal";
import type { PlaceResult } from "@/lib/geocode";
import { reverseGeocode } from "@/lib/geocode";
import {
  DEFAULT_STOP_DWELL_MINUTES,
  MAX_STOP_DWELL_MINUTES,
  MIN_STOP_DWELL_MINUTES,
  getServiceAreaName,
  isInsideServiceArea,
} from "@/lib/trip-input";
import { useCountry } from "@/components/country/CountryProvider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RouteStopValue = PlaceResult & {
  dwellMinutes?: number;
};

export type RouteFormValues = {
  origin: PlaceResult;
  destination: PlaceResult;
  stops: RouteStopValue[];
  passengerCount: number;
  departureMode: "now" | "scheduled";
  scheduledAt: string | null;
};

type StopField = {
  label: string;
  place: PlaceResult | null;
  dwellMinutes: number;
};

type Props = {
  onSubmit: (values: RouteFormValues) => void;
  loading?: boolean;
  submitLabel?: string;
  loadingLabel?: string;
  /** Comes from the signed-in user's saved travel defaults. */
  defaultPassengerCount?: number;
  /** Replays a trip picked from a "Plan Again" card. */
  initialValues?: RouteFormValues | null;
  /** Home/Work/custom shortcuts shown when origin or destination is empty. */
  savedPlaces?: SavedPlaceOption[];
};

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 8;
const MAX_STOPS = 6;
const SCHEDULE_WINDOW_DAYS = 7;

// Stretches to the field's own height rather than hard-coding one, so the
// button stays square with the input if the field padding ever changes.
const cameraButtonClassName =
  "flex w-11 flex-shrink-0 items-center justify-center rounded-xl border border-input bg-secondary/60 text-muted-foreground transition-colors hover:border-ring hover:bg-secondary hover:text-foreground";

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

export default function RouteFinderForm({
  onSubmit,
  loading,
  submitLabel = "Find Best Route",
  loadingLabel = "Finding routes…",
  defaultPassengerCount = 2,
  initialValues,
  savedPlaces,
}: Props) {
  const country = useCountry();
  const [originLabel, setOriginLabel] = useState(
    initialValues?.origin.label ?? ""
  );
  const [origin, setOrigin] = useState<PlaceResult | null>(
    initialValues?.origin ?? null
  );

  const [destinationLabel, setDestinationLabel] = useState(
    initialValues?.destination.label ?? ""
  );
  const [destination, setDestination] = useState<PlaceResult | null>(
    initialValues?.destination ?? null
  );

  const [passengers, setPassengers] = useState(
    initialValues?.passengerCount ?? defaultPassengerCount
  );
  const [mode, setMode] = useState<"now" | "schedule">(
    initialValues?.departureMode === "scheduled" ? "schedule" : "now"
  );
  const [scheduledTime, setScheduledTime] = useState(
    initialValues?.scheduledAt ?? ""
  );

  const [stops, setStops] = useState<StopField[]>(
    initialValues?.stops.map((place) => ({
      label: place.label,
      place,
      dwellMinutes:
        typeof place.dwellMinutes === "number"
          ? place.dwellMinutes
          : DEFAULT_STOP_DWELL_MINUTES,
    })) ?? []
  );
  const [locating, setLocating] = useState(false);
  const [locationPrompt, setLocationPrompt] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Which field the photo-identification modal is currently filling. One
  // shared modal instead of one per field, so only one can ever be open.
  const [imageTarget, setImageTarget] = useState<"origin" | "destination" | null>(
    null
  );

  const [scheduleBounds] = useState(() => {
    const now = Date.now();
    const min = new Date(now + 60 * 1000);
    const max = new Date(now + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    return {
      min: formatDateTimeLocal(min),
      max: formatDateTimeLocal(max),
    };
  });

  async function useCurrentLocation() {
    setLocationPrompt(null);
    setFormError(null);

    if (!navigator.geolocation) {
      setLocationPrompt("Location is not available. Enter your origin manually.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Catch this here rather than at submit: it saves a reverse-geocode
        // call and tells the user why their location was not accepted.
        if (!isInsideServiceArea({ lat: latitude, lng: longitude }, country)) {
          const areaName = getServiceAreaName(country);
          setLocationPrompt(
            `You appear to be outside ${areaName}. Routes are only planned inside ${areaName} — enter your origin manually.`
          );
          setLocating(false);
          return;
        }

        let label = "Current location";

        try {
          label = await reverseGeocode(latitude, longitude);
        } catch {
          setLocationPrompt(
            "We found your coordinates, but could not name the address."
          );
        }

        setOrigin({ lat: latitude, lng: longitude, label });
        setOriginLabel(label);
        setLocating(false);
      },
      () => {
        setLocationPrompt(
          "Location permission was denied. Enter your origin manually."
        );
        setLocating(false);
      }
    );
  }

  function handleImagePlace(place: PlaceResult) {
    if (imageTarget === "origin") {
      setOrigin(place);
      setOriginLabel(place.label);
    } else if (imageTarget === "destination") {
      setDestination(place);
      setDestinationLabel(place.label);
    }

    setFormError(null);
    setImageTarget(null);
  }

  function addStop() {
    setFormError(null);
    if (stops.length >= MAX_STOPS) return;
    setStops((s) => [
      ...s,
      { label: "", place: null, dwellMinutes: DEFAULT_STOP_DWELL_MINUTES },
    ]);
  }

  function removeStop(index: number) {
    setStops((s) => s.filter((_, i) => i !== index));
  }

  function updateStopLabel(index: number, label: string) {
    setFormError(null);
    setStops((s) =>
      s.map((st, i) => (i === index ? { ...st, label, place: null } : st))
    );
  }

  function selectStopPlace(index: number, place: PlaceResult) {
    setStops((s) =>
      s.map((st, i) => (i === index ? { ...st, place, label: place.label } : st))
    );
  }

  function updateStopDwell(index: number, dwellMinutes: number) {
    setFormError(null);
    const bounded = Math.max(
      MIN_STOP_DWELL_MINUTES,
      Math.min(MAX_STOP_DWELL_MINUTES, dwellMinutes)
    );

    setStops((s) =>
      s.map((st, i) => (i === index ? { ...st, dwellMinutes: bounded } : st))
    );
  }

  function moveStop(index: number, direction: -1 | 1) {
    setStops((currentStops) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= currentStops.length) {
        return currentStops;
      }

      const nextStops = [...currentStops];
      const stop = nextStops[index];
      if (!stop) return currentStops;

      nextStops.splice(index, 1);
      nextStops.splice(nextIndex, 0, stop);
      return nextStops;
    });
  }

  const validStops = stops.reduce<RouteStopValue[]>((selectedStops, stop) => {
    if (!stop.place) return selectedStops;

    selectedStops.push({
      ...stop.place,
      dwellMinutes: stop.dwellMinutes,
    });

    return selectedStops;
  }, []);

  const hasIncompleteStops = stops.some((stop) => stop.place === null);
  const canSubmit =
    origin !== null &&
    destination !== null &&
    !loading &&
    (mode === "now" || Boolean(scheduledTime));

  function handleSubmit() {
    setFormError(null);

    if (!origin || !destination) {
      setFormError("Choose both origin and destination from suggestions.");
      return;
    }

    if (hasIncompleteStops) {
      setFormError("Choose a place for every stop or remove empty stops.");
      return;
    }

    if (mode === "schedule" && !scheduledTime) {
      setFormError("Choose a scheduled departure time.");
      return;
    }

    onSubmit({
      origin,
      destination,
      stops: validStops,
      passengerCount: passengers,
      departureMode: mode === "schedule" ? "scheduled" : "now",
      scheduledAt: mode === "schedule" && scheduledTime ? scheduledTime : null,
    });
  }

  return (
    <div className="w-full space-y-4">
      {/* Origin and destination sit on a shared rail, echoing a dot-to-square
          pickup/dropoff pair. */}
      <div className="relative space-y-2">
        <span
          aria-hidden
          className="absolute top-6 bottom-6 left-[21px] w-px bg-border"
        />
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <PlaceAutocomplete
              placeholder="Enter location"
              value={originLabel}
              icon={
                <span className="block size-2.5 rounded-full border-2 border-foreground" />
              }
              savedPlaces={savedPlaces}
              onChange={(v) => {
                setFormError(null);
                setOriginLabel(v);
                setOrigin(null);
              }}
              onSelect={(place) => {
                setOrigin(place);
                setOriginLabel(place.label);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setImageTarget("origin")}
            aria-label="Identify origin from a photo"
            title="Identify from a photo"
            className={cameraButtonClassName}
          >
            <Camera size={16} />
          </button>
        </div>

        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <PlaceAutocomplete
              placeholder="Enter destination"
              value={destinationLabel}
              icon={<span className="block size-2.5 bg-foreground" />}
              savedPlaces={savedPlaces}
              onChange={(v) => {
                setFormError(null);
                setDestinationLabel(v);
                setDestination(null);
              }}
              onSelect={(place) => {
                setDestination(place);
                setDestinationLabel(place.label);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setImageTarget("destination")}
            aria-label="Identify destination from a photo"
            title="Identify from a photo"
            className={cameraButtonClassName}
          >
            <Camera size={16} />
          </button>
        </div>
      </div>

      <button
        type="button"
        data-no-glow
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
      >
        <LocateFixed size={15} />
        {locating ? "Locating…" : "Use current location"}
      </button>
      {locationPrompt && (
        <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">
          {locationPrompt}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Passengers</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPassengers((p) => Math.max(MIN_PASSENGERS, p - 1))}
            disabled={passengers <= MIN_PASSENGERS}
            aria-label="Remove a passenger"
            className="flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Minus size={14} />
          </button>
          <span className="w-4 text-center text-sm font-medium text-foreground">
            {passengers}
          </span>
          <button
            type="button"
            onClick={() => setPassengers((p) => Math.min(MAX_PASSENGERS, p + 1))}
            disabled={passengers >= MAX_PASSENGERS}
            aria-label="Add a passenger"
            className="flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-xl border border-input">
        <button
          type="button"
          onClick={() => setMode("now")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            mode === "now"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
          )}
        >
          Leave now
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("schedule");
            if (!scheduledTime) setScheduledTime(scheduleBounds.min);
          }}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            mode === "schedule"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary/60 text-muted-foreground hover:bg-secondary"
          )}
        >
          Schedule
        </button>
      </div>

      {mode === "schedule" && (
        <input
          type="datetime-local"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          min={scheduleBounds.min}
          max={scheduleBounds.max}
          className="w-full rounded-xl border border-input bg-secondary/60 px-4 py-2.5 text-sm text-foreground outline-none focus:border-ring"
        />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Stops</span>
          <button
            type="button"
            data-no-glow
            onClick={addStop}
            disabled={stops.length >= MAX_STOPS}
            className="text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            + Add stop ({stops.length}/{MAX_STOPS})
          </button>
        </div>

        <div className="space-y-2">
          {stops.map((stop, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-input bg-secondary/40 px-3 py-2"
            >
              <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                {i + 1}
              </span>
              <div className="flex-1">
                <PlaceAutocomplete
                  placeholder={`Stop ${i + 1} - search place`}
                  value={stop.label}
                  onChange={(v) => updateStopLabel(i, v)}
                  onSelect={(place) => selectStopPlace(i, place)}
                  className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                />
              </div>
              <label className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-border bg-background/50 px-2 py-1 text-xs text-muted-foreground">
                <span>Wait</span>
                <input
                  type="number"
                  min={MIN_STOP_DWELL_MINUTES}
                  max={MAX_STOP_DWELL_MINUTES}
                  value={stop.dwellMinutes}
                  onChange={(event) =>
                    updateStopDwell(i, Number(event.target.value))
                  }
                  className="w-10 bg-transparent text-center text-foreground outline-none"
                  aria-label={`Wait time at stop ${i + 1}`}
                />
                <span>min</span>
              </label>
              <button
                type="button"
                onClick={() => removeStop(i)}
                aria-label={`Remove stop ${i + 1}`}
                className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={16} />
              </button>
              <div className="flex flex-shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => moveStop(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label={`Move stop ${i + 1} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveStop(i, 1)}
                  disabled={i === stops.length - 1}
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label={`Move stop ${i + 1} down`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {formError && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={buttonVariants({ size: "form" })}
      >
        {loading ? loadingLabel : submitLabel}
      </button>

      <ImageLocationModal
        open={imageTarget !== null}
        onClose={() => setImageTarget(null)}
        onConfirm={handleImagePlace}
      />
    </div>
  );
}
