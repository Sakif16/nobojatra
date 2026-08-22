"use client";

import { cn } from "@/lib/utils";
import {
  ROUTE_COLORS,
  type RouteResult,
  type TripTrafficResult,
} from "@/lib/routing";
import { AlertTriangle, Clock3, Gauge } from "lucide-react";
import { COUNTRY_CONFIG } from "@/lib/country-config";

type Props = {
  routes: RouteResult[];
  activeRouteId: string | null;
  onSelect: (id: string) => void;
  savedMessage?: string | null;
  routeSaveStatus?: "idle" | "saving" | "saved" | "error";
  traffic?: TripTrafficResult | null;
  trafficLoading?: boolean;
  trafficError?: string | null;
};

export default function RouteResults({
  routes,
  activeRouteId,
  onSelect,
  savedMessage,
  routeSaveStatus = "idle",
  traffic,
  trafficLoading = false,
  trafficError,
}: Props) {
  if (routes.length === 0) return null;

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const isMultiStop = activeRoute.legs.length > 1;
  const dwellDurationMin = activeRoute.dwellDurationMin ?? 0;
  const travelDurationMin =
    activeRoute.travelDurationMin ?? activeRoute.durationMin - dwellDurationMin;
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
          {dwellDurationMin > 0 && (
            <p className="mb-2 text-xs text-muted-foreground">
              {travelDurationMin} min travel · {dwellDurationMin} min wait
            </p>
          )}
          <div className="space-y-1.5">
            {activeRoute.legs.map((leg, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <span
                  className="mt-1 size-2.5 flex-shrink-0 rounded-full"
                  style={{ background: leg.color }}
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    {leg.fromLabel ?? `Leg ${i + 1}`} → {leg.toLabel ?? `Point ${i + 2}`}
                  </span>
                  <span className="block">
                    {leg.distanceKm} km · {leg.durationMin} min
                    {leg.dwellAfterMin ? ` · ${leg.dwellAfterMin} min wait` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TrafficSummary
        traffic={traffic}
        loading={trafficLoading}
        error={trafficError}
      />
    </div>
  );
}

function TrafficSummary({
  traffic,
  loading,
  error,
}: {
  traffic?: TripTrafficResult | null;
  loading: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        Checking live traffic...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!traffic) return null;

  const levelLabel = {
    low: "LOW",
    moderate: "MODERATE",
    high: "HIGH",
    severe: "SEVERE",
  }[traffic.totals.congestionLevel];
  const levelClass = {
    low: "bg-emerald-100 text-emerald-800",
    moderate: "bg-amber-100 text-amber-800",
    high: "bg-orange-100 text-orange-800",
    severe: "bg-red-100 text-red-800",
  }[traffic.totals.congestionLevel];

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Live traffic</p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", levelClass)}>
          {levelLabel}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{traffic.totals.congestionIndexPercent}% slower than free flow</span>
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" />
          {Math.ceil(traffic.totals.durationInTrafficSec / 60)} min travel time with live traffic
        </span>
      </div>
      {traffic.isPeakHour && (
        <p className="mt-2 text-xs font-medium text-orange-700">
          Planned departure falls in a{" "}
          {COUNTRY_CONFIG[traffic.country].label} peak-hour window.
        </p>
      )}
    </div>
  );
}
