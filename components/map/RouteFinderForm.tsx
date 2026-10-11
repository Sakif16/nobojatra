"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  LocateFixed,
  Minus,
  Plus,
  X,
} from "lucide-react";
import PlaceAutocomplete, { type SavedPlaceOption } from "./PlaceAutocomplete";
import ImageLocationModal from "./ImageLocationModal";
import type { PlaceResult } from "@/lib/geocode";
import { reverseGeocode } from "@/lib/geocode";
import {
  DEFAULT_STOP_DWELL_MINUTES,
  MAX_STOP_DWELL_MINUTES,
  MIN_STOP_DWELL_MINUTES,
  SCHEDULE_WINDOW_DAYS,
  getServiceAreaName,
  isInsideServiceArea,
} from "@/lib/trip-input";
import { COUNTRY_CONFIG } from "@/lib/country-config";
import { formatLocalDateTime } from "@/lib/trip-time";
import { useCountry } from "@/components/country/CountryProvider";
import { buttonVariants } from "@/components/ui/button";
import { isConfigured } from "@/lib/env";
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
  /**
   * The scheduled departure as a wall-clock time at the origin
   * ("2026-09-20T09:00"). It names no zone: the server reads it in the
   * origin's zone, never in this browser's.
   */
  scheduledLocal: string | null;
};

type StopField = {
  /**
   * Stays with the stop when it is moved or another is removed. Rows are keyed
   * on it: keyed by position, moving a stop left the inputs where they were and
   * swapped their contents, so the cursor and an open suggestion list stayed
   * behind on the wrong stop.
   */
  id: string;
  label: string;
  place: PlaceResult | null;
  dwellMinutes: number;
};

type Props = {
  onSubmit: (values: RouteFormValues) => void;
  /**
   * Called when a trip input changes after the form first rendered: a place
   * picked or cleared, a stop, the passenger count, or the departure. Results
   * already on screen were made for the old inputs and no longer apply.
   */
  onInputChange?: () => void;
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
const SCHEDULE_DEFAULT_LEAD_MS = 60 * 60 * 1000;
const GEOLOCATION_TIMEOUT_MS = 10_000;
const GEOLOCATION_MAX_AGE_MS = 60_000;

// Stretches to the field's own height rather than hard-coding one, so the
// button stays square with the input if the field padding ever changes.
const cameraButtonClassName =
  "flex w-11 flex-shrink-0 items-center justify-center rounded-xl border border-input bg-secondary/60 text-muted-foreground transition-colors hover:border-ring hover:bg-secondary hover:text-foreground";

/**
 * The earliest and latest times the picker offers, as clock times in the
 * country being planned in rather than on this browser's clock — someone
 * planning a Dhaka trip from London is choosing a Dhaka time.
 *
 * A country with several zones cannot know the trip's zone until the server
 * has seen the origin, so the range runs from the earliest clock reading among
 * them to the latest. The server applies the exact limit in the origin's zone.
 */
function getScheduleBounds(nowMs: number, timeZones: string[]) {
  // "YYYY-MM-DDTHH:mm" strings sort in time order.
  const clockReadings = (instantMs: number) =>
    timeZones.map((zone) => formatLocalDateTime(new Date(instantMs), zone)).sort();

  return {
    min: clockReadings(nowMs + 60 * 1000)[0],
    max: clockReadings(nowMs + SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000).at(-1) as string,
    // An hour ahead on the latest of those clocks, so the prefilled time is
    // still in the future in every zone by the time the form is submitted.
    initial: clockReadings(nowMs + SCHEDULE_DEFAULT_LEAD_MS).at(-1) as string,
  };
}

export default function RouteFinderForm({
  onSubmit,
  onInputChange,
  loading,
  submitLabel = "Find Best Route",
  loadingLabel = "Finding routes…",
  defaultPassengerCount = 2,
  initialValues,
  savedPlaces,
}: Props) {
  const country = useCountry();
  // Public model URLs are frozen into the client bundle at build time.
  const photoSearchAvailable = isConfigured(process.env.NEXT_PUBLIC_TM_MODEL_URL);
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
    initialValues?.scheduledLocal ?? ""
  );

  const nextStopIdRef = useRef(0);
  const [stops, setStops] = useState<StopField[]>(
    initialValues?.stops.map((place, index) => ({
      id: `restored-${index}`,
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

  // The moment the schedule limits are worked out from. Read again whenever
  // the schedule is opened or its field is focused: fixed at the form's first
  // render, a form left open for ten minutes offered a time already past.
  const [clock, setClock] = useState(() => Date.now());
  // Marks each stop with no place chosen, once a search has been attempted.
  const [showStopErrors, setShowStopErrors] = useState(false);
  const { label: countryLabel, timeZones } = COUNTRY_CONFIG[country];
  const scheduleBounds = getScheduleBounds(clock, timeZones);
  const scheduleZoneHint =
    timeZones.length === 1
      ? `${countryLabel} time`
      : "Local time at the pickup point";

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
      (error) => {
        // Each failure needs a different remedy, so each gets its own message.
        setLocationPrompt(
          error.code === error.TIMEOUT
            ? "Finding your location took too long. Try again, or enter your origin manually."
            : error.code === error.PERMISSION_DENIED
              ? "Location permission was denied. Enter your origin manually."
              : "Your location could not be determined. Enter your origin manually."
        );
        setLocating(false);
      },
      // Without a timeout a weak signal calls neither callback, and the button
      // sits on "Locating…" for good. A fix from the last minute is accepted,
      // which usually answers at once.
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS }
    );
  }

  function swapEnds() {
    setFormError(null);
    setOrigin(destination);
    setOriginLabel(destinationLabel);
    setDestination(origin);
    setDestinationLabel(originLabel);
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
    nextStopIdRef.current += 1;
    const id = `stop-${nextStopIdRef.current}`;
    setStops((s) => [
      ...s,
      { id, label: "", place: null, dwellMinutes: DEFAULT_STOP_DWELL_MINUTES },
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

  // Reports edits, not the initial values: a form restored by Plan Again
  // mounts already filled in, and its search is the one being run. Comparing
  // against the last values seen, rather than skipping the first run, also
  // holds when React runs a mount effect twice in development.
  const inputChangeRef = useRef(onInputChange);
  const lastInputsRef = useRef<unknown[] | null>(null);

  useEffect(() => {
    inputChangeRef.current = onInputChange;
  });

  useEffect(() => {
    const inputs = [origin, destination, stops, passengers, mode, scheduledTime];
    const previous = lastInputsRef.current;
    lastInputsRef.current = inputs;

    if (previous && inputs.some((input, index) => input !== previous[index])) {
      inputChangeRef.current?.();
    }
  }, [origin, destination, stops, passengers, mode, scheduledTime]);

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
      // Each empty stop is marked where it is; with six stops the user should
      // not have to hunt for the one that is missing a place.
      setShowStopErrors(true);
      setFormError("Choose a place for every stop or remove empty stops.");
      return;
    }

    setShowStopErrors(false);

    // The limits on the field are only hints, and may be minutes old. This is
    // the check against the clock as it is now.
    if (
      mode === "schedule" &&
      scheduledTime &&
      scheduledTime < getScheduleBounds(Date.now(), timeZones).min
    ) {
      setClock(Date.now());
      setFormError("That departure time has passed. Choose a later one.");
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
      scheduledLocal: mode === "schedule" && scheduledTime ? scheduledTime : null,
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
            disabled={!photoSearchAvailable}
            aria-describedby={!photoSearchAvailable ? "photo-search-unavailable" : undefined}
            title={photoSearchAvailable ? "Identify from a photo" : "Photo search is not set up"}
            className={cn(cameraButtonClassName, "disabled:opacity-50 disabled:cursor-not-allowed")}
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
            disabled={!photoSearchAvailable}
            aria-describedby={!photoSearchAvailable ? "photo-search-unavailable" : undefined}
            title={photoSearchAvailable ? "Identify from a photo" : "Photo search is not set up"}
            className={cn(cameraButtonClassName, "disabled:opacity-50 disabled:cursor-not-allowed")}
          >
            <Camera size={16} />
          </button>
        </div>
      </div>

      {!photoSearchAvailable && (
        <p id="photo-search-unavailable" role="status" className="text-sm text-muted-foreground">
          Photo search is not set up. Search for a place by name instead.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
        {/* The return journey: the same two places the other way round. */}
        <button
          type="button"
          data-no-glow
          onClick={swapEnds}
          disabled={!origin && !destination && !originLabel && !destinationLabel}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowUpDown size={15} />
          Swap origin and destination
        </button>
      </div>
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
            const now = Date.now();
            setClock(now);
            setMode("schedule");
            if (!scheduledTime) setScheduledTime(getScheduleBounds(now, timeZones).initial);
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
        <div className="space-y-1.5">
          <input
            type="datetime-local"
            aria-describedby="schedule-zone-hint"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            onFocus={() => setClock(Date.now())}
            min={scheduleBounds.min}
            max={scheduleBounds.max}
            className="w-full rounded-xl border border-input bg-secondary/60 px-4 py-2.5 text-sm text-foreground outline-none focus:border-ring"
          />
          <p id="schedule-zone-hint" className="px-1 text-xs text-muted-foreground">
            {scheduleZoneHint}
          </p>
        </div>
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

        {/* Each row wraps on narrow screens: the search field, the wait stepper
            and the reorder controls together exceed a phone's width, so the
            controls drop to a second line rather than squeezing the field to
            nothing. min-w-0 on the field wrapper is what lets it shrink at all
            — an input has an intrinsic width that would otherwise hold the row
            open. */}
        <div className="space-y-2">
          {stops.map((stop, i) => (
            <div
              key={stop.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/40 px-3 py-2",
                showStopErrors && stop.place === null ? "border-destructive" : "border-input"
              )}
            >
              <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <PlaceAutocomplete
                  placeholder={`Stop ${i + 1} - search place`}
                  value={stop.label}
                  onChange={(v) => updateStopLabel(i, v)}
                  onSelect={(place) => selectStopPlace(i, place)}
                  className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                />
              </div>
              <div className="ml-auto flex flex-shrink-0 items-center gap-2">
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
              {/* Beside the stop it is about, on a line of its own. */}
              {showStopErrors && stop.place === null && (
                <p role="alert" className="w-full text-xs text-destructive">
                  Choose a place for stop {i + 1} from the suggestions, or remove it.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
