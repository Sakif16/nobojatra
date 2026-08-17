"use client";

import { useState } from "react";
import MapDashboardSection from "@/components/map/MapDashboardSection";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";
import PlanAgainCards, { type FrequentTripCard } from "./PlanAgainCards";
import SuggestionTiles from "./SuggestionTiles";

type Props = {
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
};

/**
 * Client wrapper that bridges the "Plan Again" cards and the trip form —
 * AuthedHome itself is a server component and can't hold this state, so this
 * one small client island owns just the hand-off between the two.
 */
export default function HomeContent({
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
}: Props) {
  const [planAgainTrip, setPlanAgainTrip] = useState<RouteFormValues | null>(null);

  return (
    <div className="mt-8">
      <MapDashboardSection
        defaultPassengerCount={defaultPassengerCount}
        savedPlaces={savedPlaces}
        planAgainTrip={planAgainTrip}
        onPlanAgainHandled={() => setPlanAgainTrip(null)}
        aside={<SuggestionTiles />}
      />

      <PlanAgainCards trips={frequentTrips} onPlanAgain={setPlanAgainTrip} />
    </div>
  );
}
