import { headers } from "next/headers";
import AnonymousHome from "@/components/home/AnonymousHome";
import AuthedHome from "@/components/home/AuthedHome";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { getFrequentTrips, getHomeTripSummary } from "@/lib/trip-history";
import UserProfile from "@/models/UserProfile";

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

// One URL, two states: a marketing hero for visitors, the planner for members.
export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <AnonymousHome />;
  }

  await dbConnect();

  const [{ upcomingCount }, profile, frequentTrips] = await Promise.all([
    getHomeTripSummary(session.user.id),
    UserProfile.findOne({ userId: session.user.id }).lean(),
    getFrequentTrips(session.user.id),
  ]);

  const savedPlaces: SavedPlaceDoc[] = Array.isArray(profile?.savedPlaces)
    ? profile.savedPlaces.map((sp: SavedPlaceDoc) => ({
        label: sp.label,
        place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
      }))
    : [];

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
