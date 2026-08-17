import Link from "next/link";
import { BookmarkCheck, CalendarClock, History, TrafficCone } from "lucide-react";
import HomeContent from "./HomeContent";
import type { FrequentTripCard } from "./PlanAgainCards";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";

type Props = {
  userName: string;
  upcomingCount: number;
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
};

export default function AuthedHome({
  userName,
  upcomingCount,
  defaultPassengerCount,
  savedPlaces,
  frequentTrips,
}: Props) {
  const upcomingLabel =
    upcomingCount === 0
      ? "You have no upcoming trips"
      : `You have ${upcomingCount} upcoming trip${upcomingCount === 1 ? "" : "s"}`;

  return (
    <main className="flex-1">
      <div className="border-b border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <span className="font-semibold text-foreground">
            Welcome back, {userName}
          </span>
          {upcomingCount > 0 ? (
            <Link
              href="/scheduled-trips"
              className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarClock className="size-4" />
              {upcomingLabel}
            </Link>
          ) : (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="size-4" />
              {upcomingLabel}
            </span>
          )}
          <div className="ml-auto flex items-center gap-5">
            <Link
              href="/trip-history"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <History className="size-4" />
              Trip History
            </Link>
            <Link
              href="/live-cams"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <TrafficCone className="size-4" />
              Live Traffic
            </Link>
            <Link
              href="/saved-trips"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <BookmarkCheck className="size-4" />
              Saved Trips
            </Link>
          </div>
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
        />
      </section>

    </main>
  );
}
