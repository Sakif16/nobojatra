"use client";

import MapDashboardSection from "@/components/map/MapDashboardSection";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";
import type { FrequentTripCard } from "./PlanAgainCards";
import SuggestionTiles from "./SuggestionTiles";
import type { RestoredPlannerTrip } from "@/lib/planner-restore";

type Props = {
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
  tripToPlan?: RouteFormValues | null;
  restoredTrip?: RestoredPlannerTrip | null;
  restoreError?: boolean;
  plannerHeader: React.ReactNode;
};

/**
 * Client wrapper for the signed-in home planner. AuthedHome is a server
 * component, so the client-only suggestion tiles and Plan Again cards are
 * attached here.
 */
export default function HomeContent({
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
  tripToPlan,
  restoredTrip,
  restoreError,
  plannerHeader,
}: Props) {
  return (
      <MapDashboardSection
        plannerHeader={plannerHeader}
        defaultPassengerCount={defaultPassengerCount}
        savedPlaces={savedPlaces}
        aside={<SuggestionTiles />}
        frequentTrips={frequentTrips}
        initialTrip={tripToPlan}
        initialResults={restoredTrip}
        restoreError={restoreError}
      />
  );
}
