import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ScheduledTripsList from "@/components/ScheduledTripsList";
import { auth } from "@/lib/auth";
import { getScheduledTrips } from "@/lib/trip-history";

export default async function ScheduledTripsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/signin");
  }

  const trips = await getScheduledTrips(session.user.id);

  return <ScheduledTripsList trips={trips} />;
}
