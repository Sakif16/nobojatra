"use client";

import { ArrowRight, MapPin, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCountryConfig } from "@/components/country/CountryProvider";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import { buttonVariants } from "@/components/ui/button";
import SavedTripForm from "./SavedTripForm";
import type { SavedTripDetail } from "./types";
import BackLink from "@/components/BackLink";
import { readJson } from "@/lib/read-json";
import {
  filterAndSortSavedTrips,
  SAVED_TRIP_SORT_OPTIONS,
  type SavedTripSort,
} from "@/lib/saved-trip-list";
import StatusMessage from "@/components/ui/status-message";

/**
 * The saved-trips screen: keep the trips you repeat, and open any of them in
 * the planner with its places already filled in.
 *
 * A saved trip is only a bookmark. Its route and fares are worked out by the
 * planner when it is planned, so they are current then.
 */
export default function SavedTripsManager({
  savedPlaces,
}: {
  savedPlaces: SavedPlaceOption[];
}) {
  // The list the API returns is scoped to this country, so both the subtitle
  // and the empty state have to name it — otherwise switching country looks
  // like the saved trips were lost.
  const { serviceAreaName } = useCountryConfig();
  const [trips, setTrips] = useState<SavedTripDetail[]>([]);
  // How many trips one country's list may hold; told to us by the API.
  const [maxTrips, setMaxTrips] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedTripSort>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // The trip whose delete button was pressed and is waiting to be confirmed.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    // setState lives in the promise callbacks, never in the effect body — the
    // same shape TripHistoryList uses, and what React's compiler rules want.
    fetch("/api/saved-trips")
      .then(async (response) => {
        const payload = await readJson<{
          success: boolean;
          trips?: SavedTripDetail[];
          maxTrips?: number;
          message?: string;
        }>(response);

        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Could not load saved trips.");
        }

        setTrips(payload.trips ?? []);
        setMaxTrips(typeof payload.maxTrips === "number" ? payload.maxTrips : null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load saved trips.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function deleteTrip(tripId: string) {
    setConfirmingDeleteId(null);
    setError(null);

    try {
      const response = await fetch(`/api/saved-trips/${tripId}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Delete failed");

      setTrips((current) => current.filter((trip) => trip.id !== tripId));
    } catch {
      setError("Could not delete this trip. Please try again.");
    }
  }

  const listFull = maxTrips !== null && trips.length >= maxTrips;
  const shownTrips = filterAndSortSavedTrips(trips, query, sort);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/" label="Back to planner" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Saved trips</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your trips in {serviceAreaName}. Open one in the planner with its
            places already filled in.
          </p>
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={listFull}
            className={buttonVariants({ size: "md" })}
          >
            <Plus className="size-4" aria-hidden />
            New trip
          </button>
        )}
      </div>

      {/* The limit is shown before it is hit, not discovered when a save fails. */}
      {!loading && !error && maxTrips !== null && (
        <p className="text-xs text-muted-foreground">
          {trips.length} of {maxTrips} saved in {serviceAreaName}.
          {listFull ? " Delete one to add another." : ""}
        </p>
      )}

      {trips.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or place"
            aria-label="Search saved trips"
            className="min-w-0 flex-1 basis-56 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SavedTripSort)}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            >
              {SAVED_TRIP_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {showForm && (
        <SavedTripForm
          savedPlaces={savedPlaces}
          onCancel={() => setShowForm(false)}
          onCreated={(trip) => {
            setTrips((current) => [trip, ...current]);
            setShowForm(false);
          }}
        />
      )}

      {loading && (
        <StatusMessage tone="info" size="sm">
          Loading saved trips…
        </StatusMessage>
      )}

      {error && !loading && <StatusMessage size="sm">{error}</StatusMessage>}

      {!loading && !error && trips.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <MapPin className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">
            No saved trips in {serviceAreaName} yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a trip you make often and plan it again in one tap. Trips
            saved in another country stay there — switch back to see them.
          </p>
        </div>
      )}

      {trips.length > 0 && shownTrips.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-xs text-muted-foreground">
          No saved trip matches “{query.trim()}”.
        </p>
      )}

      {shownTrips.map((trip) => (
        <article key={trip.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {trip.name}
              </h3>
              {/* Two lines rather than one truncated one: on a phone the
                  column is narrow enough that truncating cuts the route off
                  inside the origin, never reaching the destination. */}
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {trip.origin.label} → {trip.destination.label}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" aria-hidden />
                  {trip.passengerCount} passenger{trip.passengerCount === 1 ? "" : "s"}
                </span>
                {trip.stops.length > 0 && (
                  <span>
                    {trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"}
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Opens the planner with this trip filled in. The search is left
                  to the user, who may want to set a departure time first. */}
              <Link
                href={`/?savedTrip=${trip.id}`}
                className={buttonVariants({ variant: "outline_primary", size: "md" })}
              >
                Plan this trip
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <button
                type="button"
                aria-label={`Delete ${trip.name}`}
                aria-expanded={confirmingDeleteId === trip.id}
                onClick={() =>
                  setConfirmingDeleteId((current) => (current === trip.id ? null : trip.id))
                }
                className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>

          {/* Deleting cannot be undone, so the bin only asks. The trip goes
              when this is confirmed. */}
          {confirmingDeleteId === trip.id && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-xs text-foreground">
                Delete <span className="font-semibold">{trip.name}</span>? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(null)}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => void deleteTrip(trip.id)}
                  className={buttonVariants({ variant: "destructive", size: "sm" })}
                >
                  Delete trip
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
