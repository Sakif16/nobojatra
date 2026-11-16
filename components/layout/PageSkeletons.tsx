import MapShell from "@/components/layout/MapShell";
import PageContainer from "@/components/ui/page-container";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

/**
 * Loading screens shaped like the page that is on its way, so the page does
 * not jump from one layout to another when it arrives.
 */

/** The planner, fares and ranked options: sidebar beside a full-height map. */
export function MapPageSkeleton() {
  return (
    <main className="flex-1" aria-busy="true">
      <MapShell
        sidebar={<>
          <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64 max-w-full" /></div>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <SkeletonRows label="Loading…" />
        </>}
        map={<div className="h-full w-full bg-(--map-background)" />}
      />
    </main>
  );
}

/** Pages without a map: a header and a list. */
export function ListPageSkeleton({ width = "wide" }: { width?: "narrow" | "wide" }) {
  return (
    <PageContainer width={width} aria-busy>
      <div className="space-y-6">
        <div className="space-y-3"><Skeleton className="h-9 w-56" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        <SkeletonRows label="Loading…" />
      </div>
    </PageContainer>
  );
}
