"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { LatLng, RouteResult } from "@/lib/routing";

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
};

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
}: Props) {
  const mapRef = useRef<L.Map | null>(null);

  const activeRoute =
    routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? null;

  const hasMultipleAlternatives = routes.length > 1 && (activeRoute?.legs.length ?? 0) <= 1;

  return (
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

      {/* Alternative (non-active) routes render faded, active route on top */}
      {hasMultipleAlternatives &&
        routes
          .filter((r) => r.id !== activeRoute?.id)
          .map((r) => (
            <Polyline
              key={r.id}
              positions={r.coords}
              pathOptions={{ color: "#9ca3af", weight: 4, opacity: 0.5 }}
              eventHandlers={{
                click: () => onSelectRoute?.(r.id),
              }}
            />
          ))}

      {activeRoute?.legs.map((leg) => (
        <Polyline
          key={`${activeRoute.id}-${leg.startIndex}-${leg.endIndex}`}
          positions={activeRoute.coords.slice(leg.startIndex, leg.endIndex + 1)}
          pathOptions={{ color: leg.color, weight: 5, opacity: 0.95 }}
        />
      ))}

      <Marker
        position={[origin.lat, origin.lng]}
        icon={numberedIcon("A", "#16a34a")}
      />
      {stops.map((s, i) => (
        <Marker
          key={`stop-${i}`}
          position={[s.lat, s.lng]}
          icon={numberedIcon(i + 1, "#9333ea")}
        />
      ))}
      <Marker
        position={[destination.lat, destination.lng]}
        icon={numberedIcon("B", "#dc2626")}
      />

      <FitBounds
        origin={origin}
        destination={destination}
        stops={stops}
        routes={routes}
      />
    </MapContainer>
  );
}
