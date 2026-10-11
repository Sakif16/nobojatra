import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SavedTripsManager from "@/components/saved-trips/SavedTripsManager";
import { resolveCountry } from "@/lib/country-config";
import { getRequestProfile, getRequestSession } from "@/lib/request-context";
import { filterPlacesInServiceArea } from "@/lib/trip-input";

export const metadata: Metadata = { title: "Saved trips" };

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

/**
 * Saved trips: the trips a user repeats, each one a tap away from the planner.
 *
 * Saved places are read here rather than fetched by the client, matching how
 * the dashboard hands MapDashboardSection its props.
 */
export default async function SavedTripsPage() {
  const session = await getRequestSession();

  if (!session) {
    redirect("/signin");
  }

  const profile = await getRequestProfile(session.user.id);

  const country = resolveCountry((profile as { country?: unknown } | null)?.country);

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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <SavedTripsManager savedPlaces={savedPlaces} />
    </main>
  );
}
