"use client";

import { MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ConditionEditor from "./ConditionEditor";
import SavedTripForm from "./SavedTripForm";
import { formatFare } from "@/lib/country-config";
import type { SavedTripDetail, VehicleOption } from "./types";

/**
 * The saved-trips screen: create named trips, attach alert conditions, and
 * trigger an immediate evaluation.
 *
 * "Check now" posts to /api/alerts/evaluate in session mode, which respects
 * the evaluator's 15-minute per-trip throttle — so pressing it repeatedly is
 * cheap rather than a way to burn through the routing quota.
 */
export default function SavedTripsManager({
  savedPlaces,
  vehicles,
}: {
  savedPlaces: SavedPlaceOption[];
  vehicles: VehicleOption[];
}) {
  const [trips, setTrips] = useState<SavedTripDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    // setState lives in the promise callbacks, never in the effect body — the
    // same shape TripHistoryList uses, and what React's compiler rules want.
    fetch("/api/saved-trips")
      .then(async (response) => {
        const payload = (await response.json()) as {
          success: boolean;
          trips?: SavedTripDetail[];
          message?: string;
        };

        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Could not load saved trips.");
        }

        setTrips(payload.trips ?? []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load saved trips.");
      })
      .finally(() => setLoading(false));
  }, []);

  function replaceTrip(updated: SavedTripDetail) {
    setTrips((current) =>
      current.map((trip) => (trip.id === updated.id ? updated : trip)),
    );
  }

  async function deleteTrip(tripId: string) {
    const response = await fetch(`/api/saved-trips/${tripId}`, { method: "DELETE" });

    if (response.ok) {
      setTrips((current) => current.filter((trip) => trip.id !== tripId));
    } else {
      setError("Could not delete this trip.");
    }
  }

  async function toggleTrip(trip: SavedTripDetail) {
    const response = await fetch(`/api/saved-trips/${trip.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !trip.isActive }),
    });

    const payload = (await response.json()) as {
      success: boolean;
      trip?: SavedTripDetail;
    };

    if (payload.success && payload.trip) replaceTrip(payload.trip);
  }

  async function checkNow() {
    setChecking(true);
    setCheckResult(null);

    try {
      const response = await fetch("/api/alerts/evaluate", { method: "POST" });
      const payload = (await response.json()) as {
        success: boolean;
        evaluated?: number;
        alertsCreated?: number;
        message?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Could not run a check.");
      }

      setCheckResult(
        payload.evaluated === 0
          ? "Nothing due yet — trips are re-checked every 15 minutes."
          : `Checked ${payload.evaluated} trip(s), ${payload.alertsCreated ?? 0} new notification(s).`,
      );

      const refreshed = await fetch("/api/saved-trips");
      const refreshedPayload = (await refreshed.json()) as {
        success: boolean;
        trips?: SavedTripDetail[];
      };

      if (refreshedPayload.success) setTrips(refreshedPayload.trips ?? []);
    } catch (err) {
      setCheckResult(err instanceof Error ? err.message : "Could not run a check.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Saved trips</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Attach conditions to a trip and get notified when they are met.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={checking || trips.length === 0}
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            <RefreshCw className={cn("size-4", checking && "animate-spin")} aria-hidden />
            {checking ? "Checking…" : "Check now"}
          </button>

          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={buttonVariants({ size: "md" })}
            >
              <Plus className="size-4" aria-hidden />
              New trip
            </button>
          )}
        </div>
      </div>

      {checkResult && (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
          {checkResult}
        </p>
      )}

      {showForm && (
        <SavedTripForm
          savedPlaces={savedPlaces}
          vehicles={vehicles}
          onCancel={() => setShowForm(false)}
          onCreated={(trip) => {
            setTrips((current) => [trip, ...current]);
            setShowForm(false);
          }}
        />
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">Loading saved trips…</p>
      )}

      {error && !loading && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && trips.length === 0 && !showForm && (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <MapPin className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">No saved trips yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Save a trip to start watching its weather, traffic, and fare.
          </p>
        </div>
      )}

      {trips.map((trip) => (
        <article
          key={trip.id}
          className={cn(
            "rounded-2xl border border-border bg-card p-5",
            !trip.isActive && "opacity-60",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {trip.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {trip.origin.label} → {trip.destination.label}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => void toggleTrip(trip)}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted"
              >
                {trip.isActive ? "Pause" : "Resume"}
              </button>
              <button
                type="button"
                aria-label={`Delete ${trip.name}`}
                onClick={() => void deleteTrip(trip.id)}
                className="rounded-md border border-border p-1.5 text-muted-foreground transition hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            {trip.route && (
              <div className="flex gap-1">
                <dt>Route</dt>
                <dd className="font-medium text-foreground">
                  {trip.route.distanceKm} km · {trip.route.durationMin} min
                </dd>
              </div>
            )}
            {trip.preferredVehicle && (
              <div className="flex gap-1">
                <dt>Vehicle</dt>
                <dd className="font-medium text-foreground">
                  {trip.preferredVehicle.displayName}
                </dd>
              </div>
            )}
            {trip.baseline && (
              <div className="flex gap-1">
                <dt>Baseline</dt>
                <dd className="font-medium text-foreground">
                  {formatFare(trip.baseline.fareLow, trip.baseline.fareHigh, trip.country)}
                </dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>Last checked</dt>
              <dd className="font-medium text-foreground">
                {trip.lastEvaluatedAt
                  ? new Date(trip.lastEvaluatedAt).toLocaleString()
                  : "never"}
              </dd>
            </div>
          </dl>

          <ConditionEditor trip={trip} onTripChange={replaceTrip} />
        </article>
      ))}
    </div>
  );
}
