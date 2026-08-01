"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import RouteFinderForm, { type RouteFormValues } from "./RouteFinderForm";
import RouteResults from "./RouteResults";
import { fetchRoutes, type RouteResult, type LatLng } from "@/lib/routing";

const RouteMap = dynamic(() => import("./RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-[24px] bg-slate-100 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

export default function MapDashboardSection() {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [stops, setStops] = useState<LatLng[]>([]);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: RouteFormValues) {
    setLoading(true);
    setError(null);

    try {
      const originPt: LatLng = { lat: values.origin.lat, lng: values.origin.lng };
      const destPt: LatLng = { lat: values.destination.lat, lng: values.destination.lng };
      const stopPts: LatLng[] = values.stops.map((s) => ({ lat: s.lat, lng: s.lng }));

      const results = await fetchRoutes(originPt, destPt, stopPts);

      setOrigin(originPt);
      setDestination(destPt);
      setStops(stopPts);
      setRoutes(results);
      setActiveRouteId(results[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find routes");
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = origin && destination && routes.length > 0;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, #f7f7ff 0%, #f1f2ff 45%, #f6f9ff 100%)",
        borderRadius: "30px",
        padding: "16px",
      }}
      className={
        hasResults
          ? "flex w-full flex-col gap-6 lg:h-[85vh] lg:flex-row"
          : "flex w-full justify-center"
      }
    >
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.88)",
          border: "1px solid #e9e6ff",
          borderRadius: "24px",
          boxShadow: "0 14px 38px rgba(148, 130, 255, 0.14)",
          backdropFilter: "blur(12px)",
        }}
        className={
          hasResults
            ? "flex flex-col gap-4 p-4 lg:w-[380px] lg:flex-shrink-0 lg:overflow-y-auto lg:pr-2"
            : "flex w-full max-w-md flex-col gap-6 p-4"
        }
      >
        <RouteFinderForm onSubmit={handleSubmit} loading={loading} />

        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </p>
        )}

        {hasResults && (
          <RouteResults
            routes={routes}
            activeRouteId={activeRouteId}
            onSelect={setActiveRouteId}
          />
        )}
      </div>

      {hasResults && origin && destination && (
        <div
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #ebe9ff",
            borderRadius: "26px",
            boxShadow: "0 16px 42px rgba(148, 130, 255, 0.14)",
            overflow: "hidden",
          }}
          className="h-[500px] w-full flex-shrink-0 lg:h-full lg:flex-1"
        >
          <RouteMap
            origin={origin}
            destination={destination}
            stops={stops}
            routes={routes}
            activeRouteId={activeRouteId}
            onSelectRoute={setActiveRouteId}
          />
        </div>
      )}
    </div>
  );
}