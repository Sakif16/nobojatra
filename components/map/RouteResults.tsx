"use client";

import { cn } from "@/lib/utils";
import type { RouteResult } from "@/lib/routing";

type Props = {
  routes: RouteResult[];
  activeRouteId: string | null;
  onSelect: (id: string) => void;
};

export default function RouteResults({ routes, activeRouteId, onSelect }: Props) {
  if (routes.length === 0) return null;

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const isMultiStop = activeRoute.legs.length > 1;

  return (
    <div className="w-full max-w-md space-y-3">
      {!isMultiStop &&
        routes.map((route) => {
          const active = route.id === (activeRouteId ?? routes[0].id);
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelect(route.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                active
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: route.legs[0]?.color ?? "#9333ea" }}
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Route {route.rank}
                    {route.rank === 1 && (
                      <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        Best
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {route.distanceKm} km · {route.durationMin} min
                  </p>
                </div>
              </div>
            </button>
          );
        })}

      {isMultiStop && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="mb-2 text-sm font-medium text-gray-800">
            {activeRoute.distanceKm} km · {activeRoute.durationMin} min total
          </p>
          <div className="space-y-1.5">
            {activeRoute.legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
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
