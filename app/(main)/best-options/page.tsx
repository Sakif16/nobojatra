// app/(main)/best-options/page.tsx
// Server component — entry point for the Route Comparison Display.
// Same pattern as app/(main)/fares/page.tsx: read + validate the two IDs
// from the URL, redirect home if invalid, hand off to the client component.
import { redirect } from "next/navigation";
import BestOptionsResults from "@/components/BestOptionsResults";

// searchParams is a Promise in Next.js 15 — must be awaited before reading
interface Props {
  searchParams: Promise<{ tripHistoryId?: string; routeId?: string }>;
}

export default async function BestOptionsPage({ searchParams }: Props) {
  const params = await searchParams;

  const tripHistoryId = params.tripHistoryId?.trim();
  const routeId = params.routeId?.trim();

  // Guards against someone navigating here directly without a valid trip
  if (!tripHistoryId || !routeId) redirect("/");

  return <BestOptionsResults tripHistoryId={tripHistoryId} routeId={routeId} />;
}