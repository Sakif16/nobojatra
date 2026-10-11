import Link from "next/link";
import { CalendarClock } from "lucide-react";
import CountrySwitcher from "@/components/country/CountrySwitcher";
import HomeContent from "./HomeContent";
import type { FrequentTripCard } from "./PlanAgainCards";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";

type Props = {
  userName: string;
  upcomingCount: number;
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
  /** A saved trip to open the planner with, from "Plan this trip". */
  tripToPlan?: RouteFormValues | null;
};

export default function AuthedHome({
  userName,
  upcomingCount,
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
  tripToPlan,
}: Props) {
  const upcomingLabel =
    upcomingCount === 0
      ? "You have no upcoming trips"
      : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? "" : "s"}`;

  return (
    <main className="flex-1">
      <div className="border-b border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2 sm:px-6 lg:px-8">
          <span className="truncate font-semibold text-foreground">
            Welcome back, {userName}
          </span>
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
          {/* The page links that used to sit here are in the navbar now, on
              every page. */}
          <CountrySwitcher className="self-start sm:ml-auto sm:self-auto" />
        </div>
      </div>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Plan a route
        </h1>

        <HomeContent
          defaultPassengerCount={defaultPassengerCount}
          savedPlaces={savedPlaces}
          frequentTrips={frequentTrips}
          tripToPlan={tripToPlan}
        />
      </section>

    </main>
  );
}
