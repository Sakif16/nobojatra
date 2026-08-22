import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthedHome from "@/components/home/AuthedHome";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { getFrequentTrips, getHomeTripSummary } from "@/lib/trip-history";
import { filterPlacesInServiceArea } from "@/lib/trip-input";
import { getUserCountry } from "@/lib/user-country";
import UserProfile from "@/models/UserProfile";
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]);

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

// The planner is members-only: there is no landing page, so visitors land on
// sign in — the same guard the other authenticated pages use.
export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/signin");
  }

  await dbConnect();

  // The country gates the "Plan Again" cards: they are suggestions for the
  // next trip, so they only make sense in the country being planned in.
  const country = await getUserCountry(session.user.id);

  const [{ upcomingCount }, profile, frequentTrips] = await Promise.all([
    getHomeTripSummary(session.user.id),
    UserProfile.findOne({ userId: session.user.id }).lean(),
    getFrequentTrips(session.user.id, { country }),
  ]);

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
    />
  );
}
