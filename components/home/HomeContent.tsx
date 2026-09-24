"use client";

import MapDashboardSection from "@/components/map/MapDashboardSection";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { FrequentTripCard } from "./PlanAgainCards";
import SuggestionTiles from "./SuggestionTiles";

type Props = {
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
};

/**
 * Client wrapper for the signed-in home planner. AuthedHome is a server
 * component, so the client-only pieces (the suggestion tiles beside the form
 * and the Plan Again cards under it) are attached here.
 */
export default function HomeContent({
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
}: Props) {
  return (
    <div className="mt-8">
      <MapDashboardSection
        defaultPassengerCount={defaultPassengerCount}
        savedPlaces={savedPlaces}
        aside={<SuggestionTiles />}
        frequentTrips={frequentTrips}
      />
    </div>
  );
}
