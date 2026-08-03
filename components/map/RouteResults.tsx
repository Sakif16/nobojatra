"use client";

import { cn } from "@/lib/utils";
import { ROUTE_COLORS, type RouteResult } from "@/lib/routing";

type Props = {
  routes: RouteResult[];
  activeRouteId: string | null;
  onSelect: (id: string) => void;
  savedMessage?: string | null;
  routeSaveStatus?: "idle" | "saving" | "saved" | "error";
};

export default function RouteResults({
  routes,
  activeRouteId,
  onSelect,
  savedMessage,
  routeSaveStatus = "idle",
}: Props) {
  if (routes.length === 0) return null;

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const isMultiStop = activeRoute.legs.length > 1;
  const hasOneDistinctRoute = !isMultiStop && routes.length === 1;
  const routeSaveMessage =
    routeSaveStatus === "saving"
      ? "Saving selected route..."
      : routeSaveStatus === "saved"
        ? "Selected route saved"
        : routeSaveStatus === "error"
          ? "Route shown, but selection could not be saved"
          : savedMessage;

  return (
    <div className="w-full space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Route results</h2>
          {routeSaveMessage && (
            <span
              className={cn(
                "text-xs font-medium",
                routeSaveStatus === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {routeSaveMessage}
            </span>
          )}
        </div>
        {hasOneDistinctRoute && (
          <p className="rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Only one distinct route found.
          </p>
        )}
      </div>

      {!isMultiStop &&
        routes.map((route) => {
          const active = route.id === (activeRouteId ?? routes[0].id);
          const badge = route.rank === 1 ? "Best" : "Alternative";

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelect(route.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-muted"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="size-3 rounded-full"
                  style={{ background: route.legs[0]?.color ?? ROUTE_COLORS[0] }}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Route {route.rank}
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      {badge}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {route.distanceKm} km · {route.durationMin} min
                  </p>
                </div>
              </div>
            </button>
          );
        })}

      {isMultiStop && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="mb-2 text-sm font-medium text-foreground">
            {activeRoute.distanceKm} km · {activeRoute.durationMin} min total
          </p>
          <div className="space-y-1.5">
            {activeRoute.legs.map((leg, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className="size-2.5 flex-shrink-0 rounded-full"
                  style={{ background: leg.color }}
                />
                <span>
                  Leg {i + 1} — {leg.distanceKm} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
