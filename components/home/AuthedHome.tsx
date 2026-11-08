import Link from "next/link";
import { CalendarClock } from "lucide-react";
import CountrySwitcher from "@/components/country/CountrySwitcher";
import HomeContent from "./HomeContent";
import type { FrequentTripCard } from "./PlanAgainCards";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";
import type { RestoredPlannerTrip } from "@/lib/planner-restore";

type Props = {
  userName: string;
  upcomingCount: number;
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
  /** A saved trip to open the planner with, from "Plan this trip". */
  tripToPlan?: RouteFormValues | null;
  restoredTrip?: RestoredPlannerTrip | null;
  restoreError?: boolean;
};

export default function AuthedHome({
  userName,
  upcomingCount,
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
  tripToPlan,
  restoredTrip,
  restoreError,
}: Props) {
  const upcomingLabel =
    upcomingCount === 0
      ? "You have no upcoming trips"
      : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? "" : "s"}`;

  return (
    <main className="flex-1">
      <HomeContent
        defaultPassengerCount={defaultPassengerCount}
        savedPlaces={savedPlaces}
        frequentTrips={frequentTrips}
        tripToPlan={tripToPlan}
        restoredTrip={restoredTrip}
        restoreError={restoreError}
        plannerHeader={
          <div className="mb-6 space-y-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Plan a route</h1>
              <p className="mt-1 text-sm text-muted-foreground">Welcome back, {userName}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
          {upcomingCount > 0 ? (
            <Link
              href="/scheduled-trips"
              className="inline-flex items-center gap-2 self-start rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarClock className="size-4 shrink-0" />
              {upcomingLabel}
            </Link>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4 shrink-0" />
              {upcomingLabel}
            </span>
          )}
              <CountrySwitcher />
            </div>
          </div>
        }
      />
    </main>
  );
}
