import { headers } from "next/headers";
import AnonymousHome from "@/components/home/AnonymousHome";
import AuthedHome from "@/components/home/AuthedHome";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { getHomeTripSummary } from "@/lib/trip-history";
import UserProfile from "@/models/UserProfile";
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]); // DNS fix for saki

// One URL, two states: a marketing hero for visitors, the planner for members.
export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <AnonymousHome />;
  }

  await dbConnect();

  const [{ recentTrips, upcomingCount }, profile] = await Promise.all([
    getHomeTripSummary(session.user.id),
    UserProfile.findOne({ userId: session.user.id }).lean(),
  ]);

  return (
    <AuthedHome
      userName={session.user.name}
      upcomingCount={upcomingCount}
      recentTrips={recentTrips}
      defaultPassengerCount={profile?.defaultPassengerCount ?? 1}
    />
  );
}
