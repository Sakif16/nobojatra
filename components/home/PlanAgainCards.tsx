"use client";

import { ArrowRight, Repeat2 } from "lucide-react";
import { useCountryConfig } from "@/components/country/CountryProvider";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";

// Plain-serializable version of FrequentTripSuggestion — this crosses the
// server/client boundary as a prop, so no class instances or Dates
export type FrequentTripCard = {
  origin: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
  passengerCount: number;
  tripCount: number;
};

type Props = {
  trips: FrequentTripCard[];
  onPlanAgain: (values: RouteFormValues) => void;
};

export default function PlanAgainCards({ trips, onPlanAgain }: Props) {
  // The list the server sent is already scoped to the active country, so the
  // empty state has to name it: a bare "nothing here" would read as "you have
  // no history at all" to someone who has just switched away from their trips.
  const { serviceAreaName } = useCountryConfig();

  if (trips.length === 0) {
    return (
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Repeat2 className="size-4 text-primary" />
          Plan again
        </h2>
        <p className="py-2 text-sm text-muted-foreground">
          No trips to show in {serviceAreaName} yet. Plan a route above and the
          ones you repeat will turn up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Repeat2 className="size-4 text-primary" />
        Plan again
      </h2>
      <div className="space-y-1">
        {trips.map((trip) => {
          const key = `${trip.origin.lat},${trip.origin.lng}=>${trip.destination.lat},${trip.destination.lng}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                onPlanAgain({
                  origin: { label: trip.origin.label, lat: trip.origin.lat, lng: trip.origin.lng },
                  destination: {
                    label: trip.destination.label,
                    lat: trip.destination.lat,
                    lng: trip.destination.lng,
                  },
                  stops: [],
                  passengerCount: trip.passengerCount,
                  departureMode: "now",
                  scheduledLocal: null,
                })
              }
              // min-w-0: a grid item's automatic minimum size is its
              // min-content width, so without this a long address label widens
              // its column past the viewport instead of being truncated.
              className="group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
              data-no-glow
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"><Repeat2 size={17} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{trip.origin.label.split(",")[0]} → {trip.destination.label.split(",")[0]}</span>
                <span className="block text-xs text-muted-foreground">{trip.tripCount} {trip.tripCount === 1 ? "trip" : "trips"} in the last 30 days</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
