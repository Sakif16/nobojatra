"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import RouteFinderForm, { type RouteFormValues } from "./RouteFinderForm";
import PlanAgainCards, { type FrequentTripCard } from "@/components/home/PlanAgainCards";
import RouteResults from "./RouteResults";
import { useCountry } from "@/components/country/CountryProvider";
import { buttonVariants } from "@/components/ui/button";
import type { SavedPlaceOption } from "./PlaceAutocomplete";
import {
  fetchRoutes,
  fetchTripTraffic,
  getTrafficSampleIndices,
  updateTripHistorySelectedRoute,
  type RouteResult,
  type TripTrafficResult,
} from "@/lib/routing";
import type {
  TripLocation,
  TripValidationErrors,
  ValidatedTripInput,
} from "@/lib/trip-input";

function getTrafficPointsForRoute(route: RouteResult) {
  const indices = getTrafficSampleIndices(route);
  const points = indices
    .map((coordinateIndex) => {
      const coordinate = route.coords[coordinateIndex];
      return coordinate ? { lat: coordinate[0], lng: coordinate[1] } : null;
    })
    .filter((point): point is { lat: number; lng: number } => point !== null);

  return points.length >= 2 ? points : null;
}

type TrafficDeparture = {
  departureMode: "now" | "scheduled";
  scheduledAt: string | null;
};

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
  defaultPassengerCount?: number;
  /** Rendered beside the form until there are results to show a map for. */
  aside?: React.ReactNode;
  /** Home/Work/custom shortcuts shown when origin or destination is empty. */
  savedPlaces?: SavedPlaceOption[];
  /**
   * Frequent trips shown as "Plan Again" cards below the planner. They are
   * rendered here so a card click runs the search directly as an event,
   * rather than being relayed through a parent prop and an effect.
   */
  frequentTrips?: FrequentTripCard[];
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
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export default function MapDashboardSection({
  defaultPassengerCount,
  aside,
  savedPlaces,
  frequentTrips,
}: Props) {
  const country = useCountry();
  const router = useRouter();
  const [origin, setOrigin] = useState<TripLocation | null>(null);
  const [destination, setDestination] = useState<TripLocation | null>(null);
  const [stops, setStops] = useState<TripLocation[]>([]);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [traffic, setTraffic] = useState<TripTrafficResult | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [trafficDeparture, setTrafficDeparture] =
    useState<TrafficDeparture | null>(null);
  const trafficRequestRef = useRef(0);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [tripHistoryId, setTripHistoryId] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [routeSaveStatus, setRouteSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The revision keys the form, so every Plan Again click remounts it with
  // that trip, even when a trip was already restored.
  const [restoredTrip, setRestoredTrip] = useState<{
    values: RouteFormValues;
    revision: number;
  } | null>(null);

  async function handleRouteSelect(routeId: string) {
    setActiveRouteId(routeId);

    const selectedRoute = routes.find((route) => route.id === routeId);
    if (selectedRoute && trafficDeparture) {
      void loadRouteTraffic(selectedRoute, trafficDeparture);
    }

    if (!tripHistoryId) return;

    setHistoryMessage(null);
    setRouteSaveStatus("saving");

    try {
      await updateTripHistorySelectedRoute(tripHistoryId, routeId);
      setRouteSaveStatus("saved");
    } catch (err) {
      console.warn("Unable to update selected route:", err);
      setRouteSaveStatus("error");
    }
  }

  async function loadRouteTraffic(
    route: RouteResult,
    departure: TrafficDeparture
  ) {
    const requestId = trafficRequestRef.current + 1;
    trafficRequestRef.current = requestId;
    setTraffic(null);
    setTrafficError(null);
    setTrafficLoading(true);

    try {
      const points = getTrafficPointsForRoute(route);
      if (!points) {
        throw new Error("Live traffic is unavailable for this route.");
      }

      const routeTraffic = await fetchTripTraffic(
        points[0],
        points[points.length - 1],
        points.slice(1, -1),
        departure
      );

      if (trafficRequestRef.current === requestId) {
        setTraffic(routeTraffic);
      }
    } catch (trafficErr) {
      if (trafficRequestRef.current === requestId) {
        setTrafficError(
          trafficErr instanceof Error
            ? trafficErr.message
            : "Live traffic is unavailable for this route."
        );
      }
    } finally {
      if (trafficRequestRef.current === requestId) {
        setTrafficLoading(false);
      }
    }
  }

  async function findRoutes(values: RouteFormValues) {
    setLoading(true);
    setError(null);
    setTraffic(null);
    setTrafficError(null);
    setTrafficLoading(false);
    setHistoryMessage(null);
    setRouteSaveStatus("idle");

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
          country,
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
      setHistoryMessage(
        result.tripHistoryId ? "Saved to trip history" : null
      );
      const firstRoute = result.routes[0] ?? null;
      const departure = {
        departureMode: validation.data.departureMode,
        scheduledAt: validation.data.scheduledAt ?? null,
      } satisfies TrafficDeparture;
      setActiveRouteId(firstRoute?.id ?? null);
      setTrafficDeparture(departure);
      if (firstRoute) void loadRouteTraffic(firstRoute, departure);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find routes");
      setRoutes([]);
      setTraffic(null);
      setTrafficLoading(false);
      setTrafficError(null);
      setTrafficDeparture(null);
      setTripHistoryId(null);
      setHistoryMessage(null);
      setRouteSaveStatus("idle");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(values: RouteFormValues) {
    void findRoutes(values);
  }

  // "Plan Again": refill the form with the trip and re-run the search.
  function handlePlanAgain(values: RouteFormValues) {
    setRestoredTrip((previous) => ({
      values,
      revision: (previous?.revision ?? 0) + 1,
    }));
    void findRoutes(values);
  }

  const hasResults = origin !== null && destination !== null && routes.length > 0;

  // Use the active route for fare params, falling back to the first route.
  const fareRoute =
    routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? null;

  function handleViewFares() {
    if (!fareRoute || !tripHistoryId) return;
    const params = new URLSearchParams({
      tripHistoryId,
      routeId: fareRoute.id,
    });
    router.push(`/fares?${params.toString()}`);
  }

  return (
    <>
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
            key={restoredTrip ? `restored-${restoredTrip.revision}` : "fresh"}
            onSubmit={handleSubmit}
            loading={loading}
            defaultPassengerCount={defaultPassengerCount}
            initialValues={restoredTrip?.values ?? null}
            submitLabel="Find best route"
            savedPlaces={savedPlaces}
          />

          {error && (
            <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {loading && (
            <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Finding route options...
            </p>
          )}

          {hasResults && (
            <>
              <RouteResults
                routes={routes}
                activeRouteId={activeRouteId}
                onSelect={handleRouteSelect}
                savedMessage={historyMessage}
                routeSaveStatus={routeSaveStatus}
                traffic={traffic}
                trafficLoading={trafficLoading}
                trafficError={trafficError}
              />


              <button
                type="button"
                onClick={handleViewFares}
                className={buttonVariants({
                  variant: "outline_primary",
                  size: "form",
                })}
              >
                View fare estimates
                <ArrowRight />
              </button>
            </>
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
              traffic={traffic}
              trafficLoading={trafficLoading}
            />
          </div>
        )}
      </div>
      {frequentTrips && (
        <PlanAgainCards trips={frequentTrips} onPlanAgain={handlePlanAgain} />
      )}
    </>
  );
}
