"use client";

import { ArrowRight, Repeat2 } from "lucide-react";
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
  // Nothing to show until the user has an actual repeated pattern —
  // no empty-state clutter on a fresh account.
  if (trips.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Repeat2 className="size-4 text-primary" />
        Plan again
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  scheduledAt: null,
                })
              }
              className="group flex flex-col items-start gap-1.5 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {trip.origin.label}
                </span>
                <ArrowRight className="size-3.5 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <span className="w-full truncate text-sm font-medium text-foreground">
                {trip.destination.label}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {trip.tripCount} trips in the last 30 days
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
