"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import RouteFinderForm, { type RouteFormValues } from "./RouteFinderForm";
import RouteResults from "./RouteResults";
import {
  fetchRoutes,
  updateTripHistorySelectedRoute,
  type RouteResult,
} from "@/lib/routing";
import { savePendingTrip, takePendingTrip } from "@/lib/pending-trip";
import type {
  TripLocation,
  TripValidationErrors,
  ValidatedTripInput,
} from "@/lib/trip-input";

type TripValidationResponse =
  | {
      success: true;
      data: ValidatedTripInput;
    }
  | {
      success: false;
      errors: TripValidationErrors;
    };

type Props = {
  /**
   * Anonymous visitors can search places but not fetch routes, so their trip is
   * stashed and they are handed off to signup instead.
   */
  variant?: "authed" | "anonymous";
  defaultPassengerCount?: number;
  /** Rendered beside the form until there are results to show a map for. */
  aside?: React.ReactNode;
};

function getFirstValidationError(errors: TripValidationErrors) {
  const firstStopError = errors.stops?.find(Boolean);

  return (
    errors.origin ??
    errors.destination ??
    firstStopError ??
    errors.passengerCount ??
    errors.departureMode ??
    errors.scheduledAt ??
    "Please check your trip details."
  );
}

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-[24px] bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export default function MapDashboardSection({
  variant = "authed",
  defaultPassengerCount,
  aside,
}: Props) {
  const router = useRouter();
  const [origin, setOrigin] = useState<TripLocation | null>(null);
  const [destination, setDestination] = useState<TripLocation | null>(null);
  const [stops, setStops] = useState<TripLocation[]>([]);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [tripHistoryId, setTripHistoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoredTrip, setRestoredTrip] = useState<RouteFormValues | null>(null);

  async function handleRouteSelect(routeId: string) {
    setActiveRouteId(routeId);

    if (!tripHistoryId) return;

    try {
      await updateTripHistorySelectedRoute(tripHistoryId, routeId);
    } catch (err) {
      console.warn("Unable to update selected route:", err);
    }
  }

  async function findRoutes(values: RouteFormValues) {
    setLoading(true);
    setError(null);

    try {
      const validationResponse = await fetch("/api/trip-input/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: values.origin,
          destination: values.destination,
          stops: values.stops,
          passengerCount: values.passengerCount,
          departureMode: values.departureMode,
          scheduledAt: values.scheduledAt,
        }),
      });

      const validation =
        (await validationResponse.json()) as TripValidationResponse;

      if (!validationResponse.ok || !validation.success) {
        throw new Error(
          validation.success
            ? "Please check your trip details."
            : getFirstValidationError(validation.errors)
        );
      }

      // Pass the validated locations through whole. Dropping the labels here
      // makes the routes endpoint reject the trip, and leaves trip history with
      // no place names to display.
      const originPt = validation.data.origin;
      const destPt = validation.data.destination;
      const stopPts = validation.data.stops;

      const result = await fetchRoutes(originPt, destPt, stopPts, {
        passengerCount: validation.data.passengerCount,
        departureMode: validation.data.departureMode,
        scheduledAt: validation.data.scheduledAt ?? null,
      });

      setOrigin(originPt);
      setDestination(destPt);
      setStops(stopPts);
      setRoutes(result.routes);
      setTripHistoryId(result.tripHistoryId);
      setActiveRouteId(result.routes[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find routes");
      setRoutes([]);
      setTripHistoryId(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(values: RouteFormValues) {
    if (variant === "anonymous") {
      savePendingTrip(values);
      router.push("/signup");
      return;
    }

    void findRoutes(values);
  }

  // Replay a trip started before signup. Reading also clears it, so a refresh
  // does not re-run the search.
  useEffect(() => {
    if (variant !== "authed") return;

    const pending = takePendingTrip();
    if (!pending) return;

    // The trip lives in sessionStorage, which the server render cannot see, so
    // the form is filled and the search kicked off in an async continuation.
    void (async () => {
      setRestoredTrip(pending);
      await findRoutes(pending);
    })();
  }, [variant]);

  const hasResults = origin !== null && destination !== null && routes.length > 0;

  return (
    <div
      className={
        hasResults
          ? "flex w-full flex-col gap-6 lg:h-[70vh] lg:flex-row"
          : "grid w-full gap-8 lg:grid-cols-2 lg:items-start"
      }
    >
      <div
        className={
          hasResults
            ? "flex flex-col gap-4 lg:w-[380px] lg:flex-shrink-0 lg:overflow-y-auto lg:pr-2"
            : "flex w-full max-w-md flex-col gap-6"
        }
      >
        <RouteFinderForm
          key={restoredTrip ? "restored" : "fresh"}
          onSubmit={handleSubmit}
          loading={loading}
          defaultPassengerCount={defaultPassengerCount}
          initialValues={restoredTrip}
          submitLabel="Find best route"
        />

        {error && (
          <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {hasResults && (
          <RouteResults
            routes={routes}
            activeRouteId={activeRouteId}
            onSelect={handleRouteSelect}
          />
        )}
      </div>

      {!hasResults && aside}

      {hasResults && origin && destination && (
        <div className="h-[500px] w-full flex-shrink-0 overflow-hidden rounded-3xl border border-border lg:h-full lg:flex-1">
          <RouteMap
            origin={origin}
            destination={destination}
            stops={stops}
            routes={routes}
            activeRouteId={activeRouteId}
            onSelectRoute={handleRouteSelect}
          />
        </div>
      )}
    </div>
  );
}
