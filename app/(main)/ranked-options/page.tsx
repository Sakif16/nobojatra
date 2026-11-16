import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/request-context";

// Ranked options are now the "Best overall" order on the fares page, which
// lists the same vehicles at the same prices. This address is kept so older
// links and bookmarks still land on the trip.
interface Props {
  searchParams: Promise<{ tripHistoryId?: string; routeId?: string }>;
}

export default async function RankedOptionsPage({ searchParams }: Props) {
  const session = await getRequestSession();

  if (!session) redirect("/signin");

  const { tripHistoryId, routeId } = await searchParams;

  if (!tripHistoryId?.trim() || !routeId?.trim()) redirect("/");

  redirect(`/fares?${new URLSearchParams({ tripHistoryId: tripHistoryId.trim(), routeId: routeId.trim(), sort: "best" })}`);
}
