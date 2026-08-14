import Link from "next/link";
import { CalendarClock, History, User } from "lucide-react";
import HomeContent from "./HomeContent";
import RecentTrips from "./RecentTrips";
import type { FrequentTripCard } from "./PlanAgainCards";
import type { SavedPlaceOption } from "@/components/map/PlaceAutocomplete";
import type { RecentTrip } from "@/lib/trip-history";

type Props = {
  userName: string;
  upcomingCount: number;
  recentTrips: RecentTrip[];
  defaultPassengerCount: number;
  savedPlaces: SavedPlaceOption[];
  frequentTrips: FrequentTripCard[];
};

export default function AuthedHome({
  userName,
  upcomingCount,
  recentTrips,
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
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarClock className="size-4" />
            {upcomingLabel}
          </span>
          <div className="ml-auto flex items-center gap-5">
            <Link
              href="#recent-trips"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <History className="size-4" />
              Activity
            </Link>
            <Link
              href="/profile"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <User className="size-4" />
              Account
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

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <RecentTrips trips={recentTrips} />
      </section>
    </main>
  );
}