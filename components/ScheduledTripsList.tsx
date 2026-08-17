import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Cloud,
  MapPin,
  Route,
  TrafficCone,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ScheduledTripListItem } from "@/lib/trip-history";

type Props = {
  trips: ScheduledTripListItem[];
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatMinutes(min: number | null) {
  if (min == null) return "Not available";
  if (min < 60) return `${Math.round(min)} min`;

  const hours = Math.floor(min / 60);
  const minutes = Math.round(min % 60);

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatFare(trip: ScheduledTripListItem) {
  if (!trip.vehicle) return "No vehicle confirmed";

  return `৳${trip.vehicle.fareLow}-${trip.vehicle.fareHigh}`;
}

function getStatus(trip: ScheduledTripListItem) {
  return trip.vehicle ? "Confirmed" : "Planned";
}

function getPrimaryAction(trip: ScheduledTripListItem) {
  if (trip.vehicle) {
    return {
      href: `/trip-summary?tripHistoryId=${trip.id}&source=history`,
      label: "View details",
    };
  }

  if (trip.routeId) {
    return {
      href: `/fares?tripHistoryId=${trip.id}&routeId=${trip.routeId}`,
      label: "Choose ride",
    };
  }

  return {
    href: "/",
    label: "Plan again",
  };
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
      <CalendarClock className="mx-auto size-9 text-primary" />
      <h1 className="mt-4 text-2xl font-bold text-foreground">No upcoming trips</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Scheduled route searches will appear here once their departure time is in the future.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Plan a route
      </Link>
    </div>
  );
}

export default function ScheduledTripsList({ trips }: Props) {
  if (trips.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Scheduled trips
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upcoming planned and confirmed departures.
        </p>
      </div>

      <div className="space-y-4">
        {trips.map((trip) => {
          const action = getPrimaryAction(trip);

          return (
            <article
              key={trip.id}
              className="rounded-2xl border border-border bg-card px-5 py-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                      <CalendarClock className="size-3.5" />
                      {dateFormatter.format(new Date(trip.scheduledAt))}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                      {trip.vehicle ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <Clock3 className="size-3.5" />
                      )}
                      {getStatus(trip)}
                    </span>
                  </div>

                  <h2 className="mt-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <span className="truncate">{trip.originLabel}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{trip.destinationLabel}</span>
                  </h2>

                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Route className="size-4 text-primary" />
                      {trip.distanceKm != null ? `${trip.distanceKm} km` : "Distance unavailable"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-4 text-primary" />
                      {formatMinutes(trip.durationMin)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4 text-primary" />
                      {trip.passengerCount} passenger{trip.passengerCount === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4 text-primary" />
                      {trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                  <p className="text-sm font-semibold text-foreground">
                    {trip.vehicle?.displayName ?? "Ride not selected"}
                  </p>
                  <p className="text-sm text-muted-foreground">{formatFare(trip)}</p>
                  <Link
                    href={action.href}
                    className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {action.label}
                  </Link>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Timing
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>
                      Departure
                      <strong className="mt-0.5 block text-foreground">
                        {dateFormatter.format(new Date(trip.scheduledAt))}
                      </strong>
                    </span>
                    <span>
                      Arrival
                      <strong className="mt-0.5 block text-foreground">
                        {trip.estimatedArrivalAt
                          ? dateFormatter.format(new Date(trip.estimatedArrivalAt))
                          : "Not available"}
                      </strong>
                    </span>
                    <span>
                      Travel
                      <strong className="mt-0.5 block text-foreground">
                        {formatMinutes(trip.travelDurationMin)}
                      </strong>
                    </span>
                    <span>
                      Wait
                      <strong className="mt-0.5 block text-foreground">
                        {formatMinutes(trip.dwellDurationMin)}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Conditions
                  </p>
                  <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Cloud className="size-4 text-primary" />
                      {trip.weatherUnavailable || !trip.weather
                        ? "Weather not captured"
                        : `${trip.weather.temperatureCelsius}°C · ${trip.weather.severityBand}`}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <TrafficCone className="size-4 text-primary" />
                      {trip.trafficUnavailable || !trip.traffic
                        ? "Traffic not captured"
                        : `${trip.traffic.congestionLevel} · ${trip.traffic.durationInTrafficMin} min`}
                    </span>
                  </div>
                </div>
              </div>

              {(trip.stops.length > 0 || trip.itinerary) && (
                <div className="mt-3 rounded-xl border border-border bg-background/40 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Route details
                  </p>
                  {trip.itinerary ? (
                    <div className="mt-2 space-y-2">
                      {trip.itinerary.legs.map((leg, index) => (
                        <div
                          key={`${trip.id}-${index}`}
                          className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {leg.fromLabel} {"->"} {leg.toLabel}
                          </span>
                          <span className="shrink-0">
                            {leg.distanceKm} km · {formatMinutes(leg.durationMin)}
                            {leg.dwellAfterMin > 0
                              ? ` · ${formatMinutes(leg.dwellAfterMin)} wait`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {trip.stops.map((stop, index) => (
                        <span
                          key={`${trip.id}-stop-${index}`}
                          className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                        >
                          {stop.label}
                          {stop.dwellMinutes != null
                            ? ` · ${stop.dwellMinutes} min`
                            : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
