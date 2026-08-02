import { ArrowRight, CalendarClock, MapPin } from "lucide-react";
import type { RecentTrip } from "@/lib/trip-history";

type Props = {
  trips: RecentTrip[];
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTripMetrics(trip: RecentTrip) {
  const parts: string[] = [];

  if (trip.distanceKm !== null) parts.push(`${trip.distanceKm} km`);
  if (trip.durationMin !== null) parts.push(`${trip.durationMin} min`);
  if (trip.stopCount > 0) {
    parts.push(`${trip.stopCount} stop${trip.stopCount === 1 ? "" : "s"}`);
  }
  parts.push(
    `${trip.passengerCount} passenger${trip.passengerCount === 1 ? "" : "s"}`
  );

  return parts.join(" · ");
}

export default function RecentTrips({ trips }: Props) {
  return (
    <section id="recent-trips" className="scroll-mt-24">
      <h2 className="mb-4 text-2xl font-semibold text-foreground">
        Your activity
      </h2>

      {trips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No trips yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan a route above and it will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
            >
              <span className="mt-0.5 flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                {trip.departureMode === "scheduled" ? (
                  <CalendarClock className="size-4" />
                ) : (
                  <MapPin className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{trip.originLabel}</span>
                  <ArrowRight className="size-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{trip.destinationLabel}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTripMetrics(trip)}
                </p>
              </div>

              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {dateFormatter.format(
                  new Date(trip.scheduledAt ?? trip.createdAt)
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
