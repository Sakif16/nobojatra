import { MapPageSkeleton } from "@/components/layout/PageSkeletons";

/**
 * Shown while a page under the main layout waits on its session and data.
 *
 * Every page here is rendered on the server after several reads. Without this
 * a click on a link shows the previous page, unchanged, until the next one is
 * ready — which reads as the click not having registered.
 *
 * This one is shaped like the map pages (the planner here, and fares, which
 * has no loading file of its own). Each list page has its own loading.tsx
 * shaped like a list, so no page jumps between layouts as it arrives.
 */
export default function Loading() {
  return <MapPageSkeleton />;
}
