import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ScheduledTripsList from "@/components/ScheduledTripsList";
import { getRequestSession } from "@/lib/request-context";
import { getScheduledTrips } from "@/lib/trip-history";

export const metadata: Metadata = { title: "Scheduled trips" };

export default async function ScheduledTripsPage() {
  const session = await getRequestSession();

  if (!session) {
    redirect("/signin");
  }

  const trips = await getScheduledTrips(session.user.id);

  return <ScheduledTripsList trips={trips} />;
}
