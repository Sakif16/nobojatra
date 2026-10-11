import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BestOptionsResults from "@/components/BestOptionsResults";
import { getRequestSession } from "@/lib/request-context";

export const metadata: Metadata = { title: "Ranked options" };

// searchParams is a Promise in Next.js 15 — must be awaited before reading
interface Props {
  searchParams: Promise<{ tripHistoryId?: string; routeId?: string }>;
}

export default async function RankedOptionsPage({ searchParams }: Props) {
  const session = await getRequestSession();

  if (!session) redirect("/signin");

  const params = await searchParams;

  const tripHistoryId = params.tripHistoryId?.trim();
  const routeId = params.routeId?.trim();

  // Guards against someone navigating here directly without a valid trip
  if (!tripHistoryId || !routeId) redirect("/");

  return <BestOptionsResults tripHistoryId={tripHistoryId} routeId={routeId} />;
}