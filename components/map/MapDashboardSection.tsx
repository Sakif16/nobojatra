"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import RouteFinderForm, { type RouteFormValues } from "./RouteFinderForm";
import PlanAgainCards, { type FrequentTripCard } from "@/components/home/PlanAgainCards";
import RouteResults from "./RouteResults";
import { useCountry } from "@/components/country/CountryProvider";
import { useServerFeatures } from "@/components/features/FeatureProvider";
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
import { describeAccessGap } from "@/lib/route-access";
import { formatTripDateTime } from "@/lib/trip-time";
import { canRequestTraffic, describeTrafficUnavailable } from "@/lib/feature-messages";
import { readJson } from "@/lib/read-json";
import StatusMessage from "@/components/ui/status-message";

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

type RouteSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "saved_vehicle_cleared"
  | "error";

type TrafficDeparture = {
  departureMode: "now" | "scheduled";
  /** The departure instant the server resolved from the form's local time. */
  scheduledAt: string | null;
  /** The IANA zone at the origin, which that instant is shown in. */
  timeZone: string;
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
  /**
   * A trip to open the form with, filled in but not yet searched — a saved
   * trip chosen with "Plan this trip".
   */
  initialTrip?: RouteFormValues | null;
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

/**
 * The planner, remounted whenever the country changes.
 *
 * A plan belongs to one country: its places sit inside that service area and
 * its routes, fares and trip record were made for it. Switching country keeps
 * this component on screen (the switcher refreshes server data in place), so
 * without the key a Dhaka search would stay up under a UK planner, with a fare
 * button still pointing at the Dhaka trip. Starting clean is the one state
 * that cannot be inconsistent.
 */
export default function MapDashboardSection(props: Props) {
  const country = useCountry();

  return <Planner key={country} {...props} />;
}

function Planner({
  defaultPassengerCount,
  aside,
  savedPlaces,
  frequentTrips,
  initialTrip,
}: Props) {
  const country = useCountry();
  const features = useServerFeatures();
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
  const [routeSaveStatus, setRouteSaveStatus] = useState<RouteSaveStatus>("idle");
  // The route search the screen is waiting on. A search that is replaced or
  // made irrelevant is aborted, and its answer ignored if it still arrives.
  const searchRef = useRef<AbortController | null>(null);
  // Route choices are stored one at a time, in the order they were clicked.
  const routeSelectRef = useRef(0);
  const routeSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The revision keys the form, so every Plan Again click remounts it with
  // that trip, even when a trip was already restored.
  const [restoredTrip, setRestoredTrip] = useState<{
    values: RouteFormValues;
    revision: number;
  } | null>(initialTrip ? { values: initialTrip, revision: 0 } : null);

  // Leaving the planner, or remounting it for another country, drops the
  // search in flight with it.
  useEffect(() => () => searchRef.current?.abort(), []);

  async function handleRouteSelect(routeId: string) {
    setActiveRouteId(routeId);

    const selectedRoute = routes.find((route) => route.id === routeId);
    if (selectedRoute && trafficDeparture) {
      void loadRouteTraffic(selectedRoute, trafficDeparture);
    }

    if (!tripHistoryId) return;

    const selectId = routeSelectRef.current + 1;
    routeSelectRef.current = selectId;
    setHistoryMessage(null);
    setRouteSaveStatus("saving");

    // Two quick clicks used to send two writes that could land in either
    // order, storing a route other than the one left highlighted. Each write
    // now waits for the one before it, and a click that has since been
    // replaced is not written at all.
    const save = routeSaveQueueRef.current
      .catch(() => undefined)
      .then(() =>
        routeSelectRef.current === selectId
          ? updateTripHistorySelectedRoute(tripHistoryId, routeId)
          : null
      );
    routeSaveQueueRef.current = save;

    try {
      const saved = await save;
      if (routeSelectRef.current !== selectId) return;
      setRouteSaveStatus(saved?.vehicleChoiceCleared ? "saved_vehicle_cleared" : "saved");
    } catch (err) {
      console.warn("Unable to update selected route:", err);
      if (routeSelectRef.current !== selectId) return;
      setRouteSaveStatus("error");
    }
  }

  /**
   * Drops everything a search produced, and any search still on its way.
   *
   * Results are only ever shown for the inputs that produced them: this runs
   * before a new search starts and whenever the form is edited.
   */
  function clearResults() {
    searchRef.current?.abort();
    searchRef.current = null;
    trafficRequestRef.current += 1;
    routeSelectRef.current += 1;
    setLoading(false);
    setError(null);
    setOrigin(null);
    setDestination(null);
    setStops([]);
    setRoutes([]);
    setActiveRouteId(null);
    setTraffic(null);
    setTrafficLoading(false);
    setTrafficError(null);
    setTrafficDeparture(null);
    setTripHistoryId(null);
    setHistoryMessage(null);
    setRouteSaveStatus("idle");
  }

  async function loadRouteTraffic(
    route: RouteResult,
    departure: TrafficDeparture
  ) {
    const requestId = trafficRequestRef.current + 1;
    trafficRequestRef.current = requestId;
    setTraffic(null);
    setTrafficError(null);

    // Nothing to ask for: the route's time stays the car-route estimate.
    if (!canRequestTraffic(country, features)) {
      setTrafficLoading(false);
      setTrafficError(
        `${describeTrafficUnavailable(country, features)} Travel times are estimates without traffic.`
      );
      return;
    }

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
    clearResults();

    // Whichever search was started last owns the screen. An earlier one that
    // answers late — two Plan Again cards clicked in a row — is discarded.
    const search = new AbortController();
    searchRef.current = search;
    setLoading(true);

    try {
      const validationResponse = await fetch("/api/trip-input/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: search.signal,
        body: JSON.stringify({
          origin: values.origin,
          destination: values.destination,
          stops: values.stops,
          passengerCount: values.passengerCount,
          departureMode: values.departureMode,
          scheduledLocal: values.scheduledLocal,
          country,
        }),
      });

      const validation =
        await readJson<TripValidationResponse>(validationResponse);

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
        signal: search.signal,
      });

      if (search.signal.aborted) return;

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
        timeZone: validation.data.timeZone,
      } satisfies TrafficDeparture;
      setActiveRouteId(firstRoute?.id ?? null);
      setTrafficDeparture(departure);
      if (firstRoute) void loadRouteTraffic(firstRoute, departure);
    } catch (err) {
      // A replaced search has nothing to report; its replacement owns the UI.
      if (search.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to find routes");
    } finally {
      if (searchRef.current === search) {
        searchRef.current = null;
        setLoading(false);
      }
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

  // Read off the route being shown: each alternative meets the road at its own
  // point. The labels are this user's own, joined here rather than on the
  // server, where routes are cached without them.
  const shownRoute = routes.find((route) => route.id === activeRouteId) ?? routes[0];
  const waypointLabels = [origin?.label, ...stops.map((stop) => stop.label), destination?.label];
  const accessNotes = (shownRoute?.accessGaps ?? []).map((gap) =>
    describeAccessGap(gap, waypointLabels)
  );

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
            onInputChange={clearResults}
            loading={loading}
            defaultPassengerCount={defaultPassengerCount}
            initialValues={restoredTrip?.values ?? null}
            submitLabel="Find best route"
            savedPlaces={savedPlaces}
          />

          {error && <StatusMessage>{error}</StatusMessage>}

          {loading && <StatusMessage tone="info">Finding route options...</StatusMessage>}

          {hasResults && (
            <>
              {trafficDeparture?.scheduledAt && (
                <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  Departing{" "}
                  {formatTripDateTime(
                    trafficDeparture.scheduledAt,
                    trafficDeparture.timeZone
                  )}
                </p>
              )}

              <RouteResults
                routes={routes}
                activeRouteId={activeRouteId}
                onSelect={handleRouteSelect}
                savedMessage={historyMessage}
                routeSaveStatus={routeSaveStatus}
                traffic={traffic}
                trafficLoading={trafficLoading}
                trafficError={trafficError}
                accessNotes={accessNotes}
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
              country={country}
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
