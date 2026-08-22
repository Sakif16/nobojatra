"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  INACTIVE_ROUTE_COLOR,
  MARKER_COLOR,
  TRAFFIC_LEVEL_COLORS,
  TRAFFIC_LEVEL_LABELS,
  getTrafficSampleIndices,
  type LatLng,
  type RouteResult,
  type TripTrafficResult,
} from "@/lib/routing";

// Leaflet's default marker icons reference image files that don't resolve
// correctly under Next.js bundling — we build our own numbered markers instead.
function numberedIcon(label: string | number, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
        background:${color};
        color:white;
        width:28px;height:28px;
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;font-weight:600;
        border:2px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.35);
      ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Props = {
  origin: LatLng;
  destination: LatLng;
  stops: LatLng[];
  routes: RouteResult[];
  activeRouteId: string | null;
  onSelectRoute?: (id: string) => void;
  traffic?: TripTrafficResult | null;
  trafficLoading?: boolean;
};

function TrafficLegend({
  traffic,
  loading,
}: {
  traffic: TripTrafficResult | null | undefined;
  loading: boolean | undefined;
}) {
  if (!traffic && !loading) return null;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-1000 flex flex-col gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
      {loading ? (
        <span className="text-muted-foreground">Checking live traffic…</span>
      ) : (
        <>
          <span className="font-medium text-foreground">Live traffic</span>
          {(["low", "moderate", "high", "severe"] as const).map((level) => (
            <span key={level} className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-1.5 w-4 rounded-full"
                style={{ background: TRAFFIC_LEVEL_COLORS[level] }}
              />
              {TRAFFIC_LEVEL_LABELS[level]}
            </span>
          ))}
          {traffic?.isPeakHour && (
            <span className="mt-0.5 border-t border-border pt-1 font-medium text-orange-700">
              Dhaka peak-hour departure
            </span>
          )}
        </>
      )}
    </div>
  );
}

function FitBounds({
  origin,
  destination,
  stops,
  routes,
}: Pick<Props, "origin" | "destination" | "stops" | "routes">) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
      ...stops.map((s): [number, number] => [s.lat, s.lng]),
      ...routes.flatMap((r) => r.coords),
    ];
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48] });
    // Re-run whenever the route set or waypoints change (initial load + route changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, destination.lat, destination.lng, routes]);

  return null;
}

export default function RouteMap({
  origin,
  destination,
  stops,
  routes,
  activeRouteId,
  onSelectRoute,
  traffic,
  trafficLoading,
}: Props) {
  const [showTrafficTiles, setShowTrafficTiles] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  const activeRoute =
    routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? null;

  // /api/tiles/tomtom/[z]/[x]/[y] proxies TomTom's traffic tiles server-side
  // so the API key never reaches the browser — used whenever no Mapbox
  // token (a token designed to be public) is configured.
  const trafficTileUrl = MAPBOX_TOKEN
    ? `https://api.mapbox.com/styles/v1/mapbox/traffic-day-v2/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
    : `/api/tiles/tomtom/{z}/{x}/{y}`;

  const hasMultipleAlternatives = routes.length > 1 && (activeRoute?.legs.length ?? 0) <= 1;

  // The route was sampled down to a handful of points before being sent to
  // the traffic service (see getTrafficSampleIndices); re-deriving the same
  // indices here lets each traffic leg be drawn as the exact stretch of the
  // polyline it describes. If the active route changed since traffic was
  // fetched, the lengths won't line up and we fall back to the plain route.
  const trafficSampleIndices = activeRoute
    ? getTrafficSampleIndices(activeRoute)
    : [];
  const trafficSegments =
    traffic && activeRoute && trafficSampleIndices.length - 1 === traffic.legs.length
      ? traffic.legs.map((leg, index) => ({
          key: `${activeRoute.id}-traffic-${index}`,
          positions: activeRoute.coords.slice(
            trafficSampleIndices[index],
            trafficSampleIndices[index + 1] + 1
          ),
          color: TRAFFIC_LEVEL_COLORS[leg.congestionLevel],
        }))
      : null;

  // Visual helpers intentionally removed: directional arrows disabled.

  return (
    /*
     * `isolate` is load-bearing, not cosmetic. Leaflet's stylesheet gives its
     * panes and controls z-indexes from 200 up to 1000, and this wrapper had no
     * stacking context of its own — so those values competed directly with the
     * rest of the page and won against anything below 1000. The photo-location
     * modal (z-50) opened *behind* the map because of it, and the navbar (z-40)
     * and notification toasts (z-70) were one map away from the same bug.
     *
     * Isolating here rather than at each call site keeps the guarantee with the
     * component that owns the Leaflet instance: every map gets it for free.
     */
    <div className="relative isolate h-full w-full">
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={13}
        scrollWheelZoom
        ref={mapRef}
        style={{ height: "100%", width: "100%", borderRadius: "1rem" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
          url={
            MAPBOX_TOKEN
              ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
              : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />

        {/* Traffic tile overlay (Mapbox or TomTom) */}
        {trafficTileUrl && showTrafficTiles && (
          <TileLayer
            url={trafficTileUrl}
            opacity={0.9}
          />
        )}

        {/* Alternative (non-active) routes render faded, active route on top */}
        {hasMultipleAlternatives &&
          routes
            .filter((r) => r.id !== activeRoute?.id)
            .map((r) => (
              <Polyline
                key={r.id}
                positions={r.coords}
                pathOptions={{
                  color: INACTIVE_ROUTE_COLOR,
                  weight: 4,
                  opacity: 0.5,
                }}
                eventHandlers={{
                  click: () => onSelectRoute?.(r.id),
                }}
              />
            ))}

        {/* Once live traffic lines up with the active route, congestion
            color replaces the per-leg rainbow so the line reads as a
            traffic map; the leg colors return as a fallback while traffic
            is loading, missing, or stale. */}
        {trafficSegments
          ? trafficSegments.map((segment) => (
              <Fragment key={segment.key}>
                <Polyline
                  positions={segment.positions}
                  pathOptions={{ color: '#000', weight: 10, opacity: 0.25, lineJoin: 'round' }}
                />
                <Polyline
                  positions={segment.positions}
                  pathOptions={{ color: segment.color, weight: 6, opacity: 0.98, lineJoin: 'round' }}
                />
              </Fragment>
            ))
          : activeRoute?.legs.map((leg) => (
              <Fragment key={`${activeRoute.id}-${leg.startIndex}-${leg.endIndex}`}>
                <Polyline
                  positions={activeRoute.coords.slice(leg.startIndex, leg.endIndex + 1)}
                  pathOptions={{ color: '#000', weight: 9, opacity: 0.18, lineJoin: 'round' }}
                />
                <Polyline
                  positions={activeRoute.coords.slice(leg.startIndex, leg.endIndex + 1)}
                  pathOptions={{ color: leg.color, weight: 5, opacity: 0.98, lineJoin: 'round' }}
                />
              </Fragment>
            ))}

        <Marker
          position={[origin.lat, origin.lng]}
          icon={numberedIcon("A", MARKER_COLOR)}
        />
        {stops.map((s, i) => (
          <Marker
            key={`stop-${i}`}
            position={[s.lat, s.lng]}
            icon={numberedIcon(i + 1, MARKER_COLOR)}
          />
        ))}
        <Marker
          position={[destination.lat, destination.lng]}
          icon={numberedIcon("B", MARKER_COLOR)}
        />

        <FitBounds
          origin={origin}
          destination={destination}
          stops={stops}
          routes={routes}
        />
      </MapContainer>

      <div className="absolute left-3 top-3 z-1000">
        <button
          type="button"
          onClick={() => setShowTrafficTiles((s) => !s)}
          className="rounded-md bg-card/90 px-3 py-1 text-xs shadow-sm"
        >
          {showTrafficTiles ? "Hide map traffic" : "Show map traffic"}
        </button>
      </div>
      <TrafficLegend traffic={traffic} loading={trafficLoading} />
    </div>
  );
}