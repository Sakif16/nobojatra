import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthedHome from "@/components/home/AuthedHome";
import { resolveCountry } from "@/lib/country-config";
import { getRequestProfile, getRequestSession } from "@/lib/request-context";
import type { RouteFormValues } from "@/components/map/RouteFinderForm";
import { getSavedTrip } from "@/lib/saved-trips";
import { getFrequentTrips, getHomeTripSummary } from "@/lib/trip-history";
import { filterPlacesInServiceArea } from "@/lib/trip-input";

export const metadata: Metadata = { title: "Plan a trip" };

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

// The planner is members-only: there is no landing page, so visitors land on
// sign in — the same guard the other authenticated pages use.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ savedTrip?: string }>;
}) {
  const session = await getRequestSession();

  if (!session) {
    redirect("/signin");
  }

  // The same profile read the layout made, not a second one. Its country
  // gates the "Plan Again" cards: they are suggestions for the next trip, so
  // they only make sense in the country being planned in.
  const profile = await getRequestProfile(session.user.id);
  const country = resolveCountry((profile as { country?: unknown } | null)?.country);

  // "Plan this trip" on the saved-trips page links here with the trip's id.
  const savedTripId = (await searchParams).savedTrip?.trim();

  const [{ upcomingCount }, frequentTrips, savedTrip] = await Promise.all([
    getHomeTripSummary(session.user.id),
    getFrequentTrips(session.user.id, { country }),
    savedTripId ? getSavedTrip(session.user.id, savedTripId) : null,
  ]);

  // Only the user's own trip, and only in the country it was saved in: its
  // places would fail the planner's service-area check anywhere else. The
  // form is filled in and left for the user to search, since they may want to
  // set a departure time first.
  const tripToPlan: RouteFormValues | null =
    savedTrip && savedTrip.country === country
      ? {
          origin: savedTrip.origin,
          destination: savedTrip.destination,
          stops: savedTrip.stops,
          passengerCount: savedTrip.passengerCount,
          departureMode: "now",
          scheduledLocal: null,
        }
      : null;

  // Scoped to the active country: a Dhaka shortcut offered to someone planning
  // in London only leads to a validation error.
  const savedPlaces: SavedPlaceDoc[] = filterPlacesInServiceArea(
    Array.isArray(profile?.savedPlaces)
      ? profile.savedPlaces.map((sp: SavedPlaceDoc) => ({
          label: sp.label,
          place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
        }))
      : [],
    country,
  );

  return (
    <AuthedHome
      userName={session.user.name}
      upcomingCount={upcomingCount}
      defaultPassengerCount={profile?.defaultPassengerCount ?? 1}
      savedPlaces={savedPlaces}
      frequentTrips={frequentTrips}
      tripToPlan={tripToPlan}
    />
  );
}
