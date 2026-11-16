"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Pane,
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

/** Space kept clear around a fitted route, in pixels. */
const FIT_PADDING = 48;

/** The place's own name, without the address a search result appends to it. */
function placeName(point: LatLng) {
  return (point.label ?? point.name)?.split(",")[0]?.trim() || null;
}

function markerTitle(role: string, point: LatLng) {
  const name = placeName(point);

  return name ? `${role}: ${name}` : role;
}

/** The size of a card floating over the map's bottom-right corner. */
export type MapOverlayReserve = { width: number; height: number };

type Props = {
  square?: boolean;
  choreographed?: boolean;
  routeChanged?: boolean;
  /**
   * The country the trip is in. Decides whether the traffic overlay and
   * legend are offered at all — where there is no live traffic the overlay
   * tiles are blank, which looks like clear roads — and how far the map can
   * be zoomed out and panned.
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
  /**
   * A card the page floats over the map's bottom-right corner on wide
   * screens. Fitting the route keeps it out from under the card.
   */
  overlayReserve?: MapOverlayReserve | null;
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
    <div className="pointer-events-none absolute top-3 right-3 z-1000 flex flex-col gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
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

/**
 * Padding for fitting the route. On wide screens a page may float a card over
 * the map's bottom-right corner; the route gives up a strip on one side so it
 * never ends under the card — the right side or the bottom, whichever leaves
 * it more room. Below `lg` the card sits under the map, so nothing is kept.
 */
function fitPadding(map: L.Map, reserve: MapOverlayReserve | null | undefined): L.FitBoundsOptions {
  const edge = L.point(FIT_PADDING, FIT_PADDING);

  if (!reserve || !window.matchMedia("(min-width: 1024px)").matches) {
    return { paddingTopLeft: edge, paddingBottomRight: edge };
  }

  const { x: width, y: height } = map.getSize();
  const roomIfRightKept = (width - reserve.width) * height;
  const roomIfBottomKept = width * (height - reserve.height);

  return {
    paddingTopLeft: edge,
    paddingBottomRight:
      roomIfRightKept >= roomIfBottomKept
        ? L.point(FIT_PADDING + reserve.width, FIT_PADDING)
        : L.point(FIT_PADDING, FIT_PADDING + reserve.height),
  };
}

function FitBounds({
  origin,
  destination,
  stops,
  routes,
  fitRequest,
  reserve,
}: { origin: LatLng; destination: LatLng; stops: LatLng[]; routes: RouteResult[];
  /** Bumped by the "Fit route" button to refit after the user has panned away. */
  fitRequest: number;
  reserve: MapOverlayReserve | null | undefined;
}) {
  const map = useMap();
  // Read at fit time rather than refitting when it changes: a card appearing
  // (a vehicle being picked) should not move a map the user is looking at.
  const reserveRef = useRef(reserve);

  useEffect(() => {
    reserveRef.current = reserve;
  });

  useEffect(() => {
    const points: [number, number][] = [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
      ...stops.map((s): [number, number] => [s.lat, s.lng]),
      ...routes.flatMap((r) => r.coords),
    ];
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, fitPadding(map, reserveRef.current));
    // Re-run whenever the route set or any waypoint changes, and when the user
    // asks for the route back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, destination.lat, destination.lng, stops, routes, fitRequest]);

  return null;
}

/**
 * Keeps the map on the country being planned in: it cannot be panned away
 * from it, or zoomed out past the level that shows all of it. Without this the
 * map zoomed out to a repeating world with empty space above and below it.
 * Recomputed when the map is resized, since the zoom that fits the country
 * depends on the map's size.
 */
function CountryLimits({ country }: { country: CountryCode }) {
  const map = useMap();

  useEffect(() => {
    const { west, south, east, north } = COUNTRY_CONFIG[country].bounds;
    const bounds = L.latLngBounds([south, west], [north, east]).pad(0.1);
    const applyMinZoom = () => map.setMinZoom(Math.max(2, map.getBoundsZoom(bounds, false)));

    map.setMaxBounds(bounds);
    applyMinZoom();
    map.on("resize", applyMinZoom);

    return () => {
      map.off("resize", applyMinZoom);
    };
  }, [country, map]);

  return null;
}

/**
 * Renders its children as a Leaflet control, so it stacks with the zoom
 * buttons in the same corner instead of being placed by hand beside them.
 * Clicks and scrolls on it stay with the control rather than reaching the map.
 */
function MapControl({ position, children }: { position: L.ControlPosition; children: ReactNode }) {
  const map = useMap();
  const [element] = useState(() => {
    const div = L.DomUtil.create("div", "leaflet-bar planner-map-control");
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  });

  useEffect(() => {
    const control = new L.Control({ position });
    control.onAdd = () => element;
    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [element, map, position]);

  return createPortal(children, element);
}

export default function RouteMap({
  square = false,
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
  overlayReserve,
}: Props) {
  const [showTrafficTiles, setShowTrafficTiles] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  // Off where the country has no live traffic, and where this server has no
  // traffic key: the overlay would only load blank tiles.
  const trafficAvailable = canRequestTraffic(country, useServerFeatures());
  const hasTrip = Boolean(origin && destination);
  const isRoundTrip = Boolean(origin && destination && destination.lat === origin.lat && destination.lng === origin.lng);
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
      {/* One map for the component's whole life. It used to be keyed on
          whether a trip was shown, so every search and every edit to the
          form destroyed it and built a new one — reloading every tile and
          flashing the empty map each time. A new trip now just refits it;
          a cleared trip leaves the view where it was. */}
      <MapContainer
        center={origin && destination ? [origin.lat, origin.lng] : COUNTRY_CONFIG[country].defaultMapView.center}
        zoom={origin && destination ? 13 : COUNTRY_CONFIG[country].defaultMapView.zoom}
        zoomControl
        scrollWheelZoom
        maxBoundsViscosity={1}
        style={{ height: "100%", width: "100%", borderRadius: square ? 0 : "1rem" }}
      >
        {/* Both basemap providers use OpenStreetMap data. `{r}` asks CARTO
            for high-resolution tiles on high-density screens; Leaflet's
            detectRetina is left off, since the two together loaded tiles a
            zoom level too detailed at double resolution. */}
        <TileLayer
          attribution={
            MAPBOX_TOKEN ? `${MAPBOX_ATTRIBUTION} ${OSM_ATTRIBUTION}` : CARTO_API_KEY ? `${OSM_ATTRIBUTION} ${CARTO_ATTRIBUTION}` : OSM_ATTRIBUTION
          }
          // The warm tint is for the dark basemaps. The OpenStreetMap
          // fallback is a light map, which the brightening would wash out.
          className={MAPBOX_TOKEN || CARTO_API_KEY ? "route-base-tiles" : undefined}
          subdomains="abcd"
          noWrap
          url={
            MAPBOX_TOKEN
              ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
              : CARTO_API_KEY
                ? `https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`
                : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          }
        />

        {/* CARTO's labels for dark maps: light text on a dark halo, drawn in
            their own pane above the streets and below the route. An earlier
            version inverted the light map's labels, which turned their white
            halos black — black blotches on the brightened roads. */}
        {!MAPBOX_TOKEN && CARTO_API_KEY && <Pane name="place-labels" style={{ zIndex: 350, pointerEvents: "none" }}>
          <TileLayer className="route-place-labels" subdomains="abcd" noWrap
            url={`https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`} />
        </Pane>}

        {/* Traffic tile overlay (Mapbox or TomTom) */}
        {hasTrip && trafficAvailable && trafficTileUrl && showTrafficTiles && (
          <TileLayer
            attribution={MAPBOX_TOKEN ? MAPBOX_ATTRIBUTION : TOMTOM_ATTRIBUTION}
            url={trafficTileUrl}
            opacity={0.9}
            noWrap
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

        <CountryLimits country={country} />
        {origin && destination && <FitBounds
          origin={origin}
          destination={destination}
          stops={stops}
          routes={routes}
          fitRequest={fitRequest}
          reserve={overlayReserve}
        />}

        {/* Under the zoom buttons. Once the user pans or zooms away there was
            no way back to the whole route short of searching again. */}
        {hasTrip && <MapControl position="topleft">
          <button
            type="button"
            onClick={() => setFitRequest((request) => request + 1)}
            aria-label="Fit route"
            title="Fit route"
          >
            <Maximize2 size={15} aria-hidden="true" />
          </button>
        </MapControl>}

        {hasTrip && trafficAvailable && <MapControl position="topleft">
          <button
            type="button"
            onClick={() => setShowTrafficTiles((s) => !s)}
            aria-pressed={showTrafficTiles}
            className="planner-map-control-label"
          >
            <TrafficCone size={14} aria-hidden="true" /> Traffic
          </button>
        </MapControl>}
      </MapContainer>

      {hasTrip && trafficAvailable && showTrafficTiles && <TrafficLegend traffic={traffic} loading={trafficLoading} />}
    </div>
  );
}
