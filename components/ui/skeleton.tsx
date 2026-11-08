import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={cn("skeleton-shimmer rounded-xl bg-muted", className)} />;
}

export function SkeletonRows({ count = 3, label = "Loading…" }: { count?: number; label?: string }) {
  return <div role="status" aria-live="polite" className="space-y-2"><span className="sr-only">{label}</span>{Array.from({ length: count }, (_, index) => <Skeleton key={index} className="h-14" />)}</div>;
}
