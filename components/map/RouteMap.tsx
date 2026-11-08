"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { Maximize2, TrafficCone } from "lucide-react";
import { escapeHtml } from "@/lib/escape-html";
import { useServerFeatures } from "@/components/features/FeatureProvider";
import { COUNTRY_CONFIG, type CountryCode } from "@/lib/country-config";
import { canRequestTraffic } from "@/lib/feature-messages";
import {
  INACTIVE_ROUTE_COLOR,
  TRAFFIC_LEVEL_COLORS,
  TRAFFIC_LEVEL_LABELS,
  getTrafficSampleIndices,
  type LatLng,
  type RouteResult,
  type TripTrafficResult,
} from "@/lib/routing";

// Leaflet's default marker icons reference image files that don't resolve
// correctly under Next.js bundling — we build our own numbered markers instead.
//
// `divIcon` takes a raw HTML string, so both values are escaped on the way in.
// The labels are "A", "B" and stop numbers today; escaping here means that
// stays safe whatever a later change passes.
function numberedIcon(label: string | number, name: string | null, index: number, choreographed: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="planner-pin planner-pin-pop" style="--planner-delay:${choreographed ? 150 + index * 80 : index * 70}ms"><span class="planner-pin-circle">${escapeHtml(label)}</span>${name ? `<span class="planner-pin-name">${escapeHtml(name)}</span>` : ""}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function AnimatedRoute({ positions, layer, delay, duration }: { positions: RouteResult["coords"]; layer: "glow" | "body" | "core"; delay: number; duration: number }) {
  const line = useRef<L.Polyline | null>(null);
  useEffect(() => {
    const element = line.current?.getElement() as SVGPathElement | undefined;
    element?.setAttribute("pathLength", "1");
    element?.style.setProperty("--planner-delay", `${delay}ms`);
    element?.style.setProperty("--planner-duration", `${duration}ms`);
  }, [positions, delay, duration]);
  const options = {
    glow: { color: "var(--route-accent)", weight: 14, opacity: 0.25 },
    body: { color: "var(--route-accent)", weight: 6, opacity: 0.9 },
    core: { color: "#fff0d9", weight: 2, opacity: 0.9 },
  };
  return <Polyline ref={line} positions={positions} pathOptions={{ ...options[layer], lineCap: "round", lineJoin: "round", className: `planner-route planner-route-${layer}`, interactive: false }} />;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();

// Each layer credits the provider whose tiles it shows, and only that one.
// Leaflet adds a layer's credit when the layer is added and removes it with
// the layer, so the traffic credit appears only while the overlay is on.
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAPBOX_ATTRIBUTION = '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';
const CARTO_ATTRIBUTION = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
const TOMTOM_ATTRIBUTION = '&copy; <a href="https://www.tomtom.com/">TomTom</a>';

/** The place's own name, without the address a search result appends to it. */
function placeName(point: LatLng) {
  return (point.label ?? point.name)?.split(",")[0]?.trim() || null;
}

function markerTitle(role: string, point: LatLng) {
  const name = placeName(point);

  return name ? `${role}: ${name}` : role;
}

type Props = {
  square?: boolean;
  fitRequest?: number;
  showFitControl?: boolean;
  choreographed?: boolean;
  routeChanged?: boolean;
  /**
   * The country the trip is in. Decides whether the traffic overlay and
   * legend are offered at all: where there is no live traffic the overlay
   * tiles are blank, which looks like clear roads.
   */
  country: CountryCode;
  origin?: LatLng | null;
  destination?: LatLng | null;
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
  inPlanner,
}: {
  traffic: TripTrafficResult | null | undefined;
  loading: boolean | undefined;
  inPlanner: boolean;
}) {
  if (!traffic && !loading) return null;

  return (
    <div className={`pointer-events-none absolute z-1000 flex flex-col gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur ${inPlanner ? "bottom-12 left-3" : "right-3 top-3"}`}>
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
            <span className="mt-0.5 border-t border-border pt-1 font-medium text-primary">
              {/* Read off the traffic result, not the active profile: a stored
                  trip keeps the country it was planned in. */}
              {COUNTRY_CONFIG[traffic.country].label} peak-hour departure
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
  fitRequest,
}: { origin: LatLng; destination: LatLng; stops: LatLng[]; routes: RouteResult[];
  /** Bumped by the "Fit route" button to refit after the user has panned away. */
  fitRequest: number;
}) {
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
    // Re-run whenever the route set or any waypoint changes, and when the user
    // asks for the route back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, destination.lat, destination.lng, stops, routes, fitRequest]);

  return null;
}

function DefaultMapView({ country }: { country: CountryCode }) {
  const map = useMap();
  useEffect(() => {
    const { center, zoom } = COUNTRY_CONFIG[country].defaultMapView;
    map.setView(center, zoom);
  }, [country, map]);
  return null;
}

export default function RouteMap({
  square = false,
  fitRequest: externalFitRequest = 0,
  showFitControl = true,
  choreographed = false,
  routeChanged = false,
  country,
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
  const [fitRequest, setFitRequest] = useState(0);
  // Off where the country has no live traffic, and where this server has no
  // traffic key: the overlay would only load blank tiles.
  const trafficAvailable = canRequestTraffic(country, useServerFeatures());
  const hasTrip = Boolean(origin && destination);
  const isRoundTrip = Boolean(origin && destination && destination.lat === origin.lat && destination.lng === origin.lng);
  const mapRef = useRef<L.Map | null>(null);
  const originIcon = useMemo(() => origin ? numberedIcon("A", placeName(origin), 0, choreographed) : undefined, [origin, choreographed]);
  const stopIcons = useMemo(() => stops.map((stop, index) => numberedIcon(index + 1, placeName(stop), index + 1, choreographed)), [stops, choreographed]);
  const destinationIcon = useMemo(() => destination ? numberedIcon("B", placeName(destination), stops.length + 1, choreographed) : undefined, [destination, stops.length, choreographed]);

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
    <div className="planner-map relative isolate h-full w-full">
      <MapContainer
        key={hasTrip ? "trip" : "empty"}
        center={origin && destination ? [origin.lat, origin.lng] : COUNTRY_CONFIG[country].defaultMapView.center}
        zoom={origin && destination ? 13 : COUNTRY_CONFIG[country].defaultMapView.zoom}
        zoomControl={hasTrip}
        scrollWheelZoom
        ref={mapRef}
        style={{ height: "100%", width: "100%", borderRadius: square ? 0 : "1rem" }}
      >
        {/* Both basemap providers use OpenStreetMap data. */}
        <TileLayer
          attribution={
            MAPBOX_TOKEN ? `${MAPBOX_ATTRIBUTION} ${OSM_ATTRIBUTION}` : CARTO_API_KEY ? `${OSM_ATTRIBUTION} ${CARTO_ATTRIBUTION}` : OSM_ATTRIBUTION
          }
          className="route-base-tiles"
          subdomains="abcd"
          detectRetina
          url={
            MAPBOX_TOKEN
              ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
              : CARTO_API_KEY
                ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
                : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />

        {/* Traffic tile overlay (Mapbox or TomTom) */}
        {hasTrip && trafficAvailable && trafficTileUrl && showTrafficTiles && (
          <TileLayer
            attribution={MAPBOX_TOKEN ? MAPBOX_ATTRIBUTION : TOMTOM_ATTRIBUTION}
            url={trafficTileUrl}
            opacity={0.9}
          />
        )}

        {/* Alternative (non-active) routes render faded, active route on top */}
        {hasTrip && hasMultipleAlternatives &&
          routes
            .filter((r) => r.id !== activeRoute?.id)
            .map((r) => (
              <Polyline
                key={r.id}
                positions={r.coords}
                pathOptions={{
                  color: INACTIVE_ROUTE_COLOR,
                  weight: 4,
                  opacity: 0.45,
                  dashArray: "8 8",
                }}
                eventHandlers={{
                  click: () => onSelectRoute?.(r.id),
                }}
              />
            ))}

        {hasTrip && activeRoute && (["glow", "body", "core"] as const).map((layer) => (
          <AnimatedRoute key={`${activeRoute.id}-${layer}`} positions={activeRoute.coords} layer={layer} delay={choreographed && !routeChanged ? 350 : 0} duration={choreographed && routeChanged ? 550 : 750} />
        ))}
        {hasTrip && trafficAvailable && showTrafficTiles && trafficSegments?.map((segment) => (
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
            ))}

        {/* Each marker says which place it is, on hover or tap and to a screen
            reader. The name is rendered by React inside the tooltip, so it is
            text, never markup. */}
        {origin && destination && <Marker
          position={[origin.lat, origin.lng]}
          icon={originIcon}
          title={markerTitle(isRoundTrip ? "Origin and destination" : "Origin", origin)}
          alt={markerTitle(isRoundTrip ? "Origin and destination" : "Origin", origin)}
        >
          <Tooltip>{markerTitle(isRoundTrip ? "Origin and destination" : "Origin", origin)}</Tooltip>
        </Marker>}
        {origin && destination && stops.map((s, i) => (
          <Marker
            key={`stop-${i}`}
            position={[s.lat, s.lng]}
            icon={stopIcons[i]}
            title={markerTitle(`Stop ${i + 1}`, s)}
            alt={markerTitle(`Stop ${i + 1}`, s)}
          >
            <Tooltip>{markerTitle(`Stop ${i + 1}`, s)}</Tooltip>
          </Marker>
        ))}
        {/* A round trip ends where it starts. Drawing "B" there would cover
            "A", so the one marker stands for both. */}
        {origin && destination && !isRoundTrip && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={destinationIcon}
            title={markerTitle("Destination", destination)}
            alt={markerTitle("Destination", destination)}
          >
            <Tooltip>{markerTitle("Destination", destination)}</Tooltip>
          </Marker>
        )}

        {origin && destination ? <FitBounds
          origin={origin}
          destination={destination}
          stops={stops}
          routes={routes}
          fitRequest={fitRequest + externalFitRequest}
        /> : <DefaultMapView country={country} />}
      </MapContainer>

      {/* Once the user pans or zooms away there was no way back to the route
          short of searching again. */}
      {hasTrip && showFitControl && <div className="absolute right-3 bottom-6 z-1000">
        <button
          type="button"
          onClick={() => setFitRequest((request) => request + 1)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-xs text-card-foreground shadow-sm"
        >
          <Maximize2 size={14} aria-hidden="true" /> Fit route
        </button>
      </div>}

      {hasTrip && trafficAvailable && (
        <>
          <div className="absolute left-3 top-24 z-1000">
            <button
              type="button"
              onClick={() => setShowTrafficTiles((s) => !s)}
              aria-pressed={showTrafficTiles}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-2 text-xs text-card-foreground shadow-sm"
            >
              <TrafficCone size={14} aria-hidden="true" /> Traffic
            </button>
          </div>
          {showTrafficTiles && <TrafficLegend traffic={traffic} loading={trafficLoading} inPlanner={!showFitControl} />}
        </>
      )}
    </div>
  );
}
