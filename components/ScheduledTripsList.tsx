import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Cloud,
  TrafficCone,
} from "lucide-react";
import Link from "next/link";
import {
  formatFare,
  hasLiveTraffic,
  liveTrafficUnavailableMessage,
} from "@/lib/country-config";
import type { ScheduledTripListItem } from "@/lib/trip-history";
import { formatTripDateTime } from "@/lib/trip-time";
import PageHeader from "@/components/ui/page-header";
import Panel from "@/components/ui/panel";
import Pill from "@/components/ui/pill";
import Chip from "@/components/ui/chip";
import EmptyState from "@/components/ui/empty-state";
import DepartureCountdown from "@/components/scheduled-trips/DepartureCountdown";

type Props = {
  trips: ScheduledTripListItem[];
};

function formatMinutes(min: number | null) {
  if (min == null) return "Not available";
  if (min < 60) return `${Math.round(min)} min`;

  const hours = Math.floor(min / 60);
  const minutes = Math.round(min % 60);

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatTripFare(trip: ScheduledTripListItem) {
  if (!trip.vehicle) return "No vehicle chosen";

  // The trip's own country, not the user's current one — a Dhaka trip stays
  // quoted in taka after the user switches their profile.
  return formatFare(trip.vehicle.fareLow, trip.vehicle.fareHigh, trip.country);
}

function getStatus(trip: ScheduledTripListItem) {
  return trip.vehicle ? "Vehicle chosen" : "Planned";
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

export default function ScheduledTripsList({ trips }: Props) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6"><PageHeader title="Scheduled trips" back={{ href: "/", label: "Back to planner" }} subtitle="Upcoming planned departures. These are plans, not bookings." /></div>
      {trips.length === 0 ? <EmptyState icon={<CalendarClock className="size-8" />} title="No upcoming trips" description="Scheduled route searches will appear here once their departure time is in the future." action={<Link href="/" className="mt-2 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Plan a trip</Link>} /> : (
        <div className="space-y-4">
          {trips.map((trip) => {
            const action = getPrimaryAction(trip);
            return <article key={trip.id}>
              <Panel padding="lg">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Pill className="gap-1 bg-primary/10 text-primary"><CalendarClock className="size-3.5" aria-hidden />{formatTripDateTime(trip.scheduledAt, trip.timeZone)}</Pill>
                      <DepartureCountdown scheduledAt={trip.scheduledAt} /><Pill>{getStatus(trip)}</Pill>
                    </div>
                    <h2 className="mt-4 flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
                      <span className="min-w-0 truncate" title={trip.originLabel}>{trip.originLabel}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 truncate" title={trip.destinationLabel}>{trip.destinationLabel}</span>
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip label>{trip.passengerCount} passenger{trip.passengerCount === 1 ? "" : "s"}</Chip>
                      <Chip label>{trip.vehicle?.displayName ?? "Ride not selected"}</Chip><Chip label>{formatTripFare(trip)}</Chip>
                      <Chip label>{trip.distanceKm != null ? `${trip.distanceKm} km` : "Distance unavailable"}</Chip><Chip label>{formatMinutes(trip.durationMin)}</Chip>
                      <Chip label>{trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"}</Chip>
                    </div>
                  </div>
                  <Link href={action.href} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{action.label}</Link>
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                  <p className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span>Arrival: {trip.estimatedArrivalAt ? formatTripDateTime(trip.estimatedArrivalAt, trip.timeZone) : "Not available"} · Travel: {formatMinutes(trip.travelDurationMin)} · Wait: {formatMinutes(trip.dwellDurationMin)}</span></p>
                  <p className="flex items-start gap-2"><Cloud className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span>{trip.weatherUnavailable || !trip.weather ? "Weather not captured" : `${trip.weather.kind === "forecast" ? "Forecast when saved: " : "Weather when saved: "}${trip.weather.temperatureCelsius}°C · ${trip.weather.severityBand}`}</span></p>
                  <p className="flex items-start gap-2"><TrafficCone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span>{trip.trafficUnavailable || !trip.traffic ? hasLiveTraffic(trip.country) ? "Traffic not captured" : liveTrafficUnavailableMessage(trip.country) : `Traffic when saved: ${trip.traffic.congestionLevel} · ${trip.traffic.durationInTrafficMin} min`}</span></p>
                </div>
                {(trip.stops.length > 0 || trip.itinerary) && <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Route details</p>
                  {trip.itinerary ? <div className="mt-2 space-y-2">{trip.itinerary.legs.map((leg, index) => <div key={`${trip.id}-${index}`} className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 truncate text-foreground">{leg.fromLabel} → {leg.toLabel}</span><span className="shrink-0">{leg.distanceKm} km · {formatMinutes(leg.durationMin)}{leg.dwellAfterMin > 0 ? ` · ${formatMinutes(leg.dwellAfterMin)} wait` : ""}</span></div>)}</div> : <div className="mt-2 flex flex-wrap gap-2">{trip.stops.map((stop, index) => <Chip key={`${trip.id}-stop-${index}`} label>{stop.label}{stop.dwellMinutes != null ? ` · ${stop.dwellMinutes} min` : ""}</Chip>)}</div>}
                </div>}
              </Panel>
            </article>;
          })}
        </div>
      )}
    </main>
  );
}
