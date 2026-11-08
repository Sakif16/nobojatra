import Link from "next/link";
import { cn } from "@/lib/utils";

type Step = "route" | "fares" | "ranked";

export default function TripProgress({
  current,
  tripHistoryId,
  routeId,
  canRank = false,
}: {
  current: Step;
  tripHistoryId?: string | null;
  routeId?: string | null;
  canRank?: boolean;
}) {
  const params = new URLSearchParams();
  if (tripHistoryId) params.set("tripHistoryId", tripHistoryId);
  if (routeId) params.set("routeId", routeId);
  const query = params.toString();
  const steps: { key: Step; label: string; href?: string }[] = [
    { key: "route", label: "Route", href: current !== "route" && tripHistoryId && routeId ? `/?${query}` : undefined },
    { key: "fares", label: "Fares", href: current === "ranked" && query ? `/fares?${query}` : undefined },
    { key: "ranked", label: "Ranked", href: current === "fares" && canRank && query ? `/ranked-options?${query}` : undefined },
  ];

  return (
    <nav aria-label="Trip progress" className="mb-5">
      <ol className="flex items-center gap-2 text-sm">
        {steps.map((step, index) => (
          <li key={step.key} className="flex min-w-0 items-center gap-2">
            {index > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
            {step.href ? (
              <Link href={step.href} className="rounded-full px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {step.label}
              </Link>
            ) : (
              <span aria-current={current === step.key ? "step" : undefined} className={cn("rounded-full px-3 py-1.5 font-medium", current === step.key ? "bg-primary/15 text-primary" : "text-muted-foreground/60")}>
                {step.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
