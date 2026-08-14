// components/BestOptionsResults.tsx
// Client component for the Route Comparison Display. Fetches ranked options
// from /api/best-options, renders the dismissible weather banner, the ranked
// cards (icon, fare range, duration, comfort stars, risk badge, best-for tag,
// pros/cons chips), a manual Refresh button with a last-updated timestamp,
// and a map that highlights the selected card's route.
"use client";

import { AlertTriangle, Cloud, CloudOff, CloudRain, RefreshCw, TrafficCone, Users, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROUTE_COLORS, type LatLng, type RouteResult } from "@/lib/routing";
import { cn } from "@/lib/utils";

// Lazy-loads the map client-side only — Leaflet needs the browser
const RouteMap = dynamic(() => import("@/components/map/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

// ── Types matching the /api/best-options response shape ──

type WeatherBand = "low" | "moderate" | "severe";
// Mirrors CongestionLevel from lib/traffic-service.ts — the real TomTom band
type CongestionLevel = "low" | "moderate" | "high" | "severe";
type RiskBand = "low" | "moderate" | "high";

interface RankedOption {
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  comfortScore: number;
  adjustedDurationMin: number;
  riskBand: RiskBand;
  bestFor: "Speed" | "Budget" | "Comfort" | null;
  pros: string[];
  cons: string[];
  fare: { low: number; mid: number; high: number };
  // "rate_card" means the live provider quote was unavailable and this is a
  // local estimate; fareSourceNote explains why.
  fareSource?: "pathao_api" | "rate_card";
  fareSourceNote?: string | null;
  weatherRestricted: boolean;
  restrictionReason: string | null;
}

interface TripSummary {
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  durationMin: number;
  passengers: number;
}

interface WeatherReading {
  temperatureCelsius: number;
  precipitationMmPerHour: number;
  windKmh: number;
  visibilityMeters: number | null;
  severityScore: number;
  severityBand: WeatherBand;
}

interface CongestionReading {
  congestionIndexPercent: number;   // real % slower than TomTom's free-flow baseline
  congestionLevel: CongestionLevel; // low / moderate / high / severe
  isPeakHour: boolean;              // whether the departure falls in a Dhaka rush window
  durationInTrafficMin: number;     // live car-route duration, minutes
  baselineDurationMin: number;      // free-flow duration for comparison, minutes
}

interface MapPoint extends LatLng {
  label: string;
}

interface BestOptionsMap {
  origin: MapPoint | null;
  destination: MapPoint | null;
  stops: MapPoint[];
  route: {
    id: string;
    coords: [number, number][];
    legs: RouteResult["legs"];
    distanceKm: number;
    durationMin: number;
  };
}

interface BestOptionsApiResponse {
  trip?: TripSummary;
  map?: BestOptionsMap | null;
  weather?: WeatherReading | null;
  weatherUnavailable?: boolean;
  congestion?: CongestionReading | null;
  trafficUnavailable?: boolean;
  options?: RankedOption[];
  lastUpdated?: string;
}

// Icon per provider-vehicleType key, same mapping used in FareResults
const ICONS: Record<string, string> = {
  "uber-go": "🚗",
  "uber-moto": "🛵",
  "uber-premier": "🚙",
  "pathao-bike": "🏍️",
  "pathao-car": "🚕",
  "cng-auto": "🛺",
  "uber-xl": "🚐",
};

const STARS = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

// Risk badge colour classes per band
function riskBadgeClass(band: RiskBand) {
  if (band === "high") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (band === "moderate") return "border-primary/30 bg-primary/10 text-primary";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
}

// Risk badge label — SRS calls for LOW / MODERATE / HIGH
function riskBadgeLabel(band: RiskBand) {
  if (band === "high") return "HIGH";
  if (band === "moderate") return "MODERATE";
  return "LOW";
}

// "Best for" tag colour classes per tag
function bestForClass(tag: RankedOption["bestFor"]) {
  if (tag === "Speed") return "bg-blue-500/15 text-blue-600";
  if (tag === "Budget") return "bg-emerald-500/15 text-emerald-600";
  if (tag === "Comfort") return "bg-purple-500/15 text-purple-600";
  return "bg-secondary text-secondary-foreground";
}

// Formats the weather banner title from severity band
function weatherTitle(weather: WeatherReading | null, unavailable: boolean) {
  if (unavailable) return "Weather data unavailable";
  if (!weather) return null;
  if (weather.severityBand === "severe") return "Severe weather restrictions";
  if (weather.severityBand === "moderate") return "Moderate weather caution";
  return "Low weather impact";
}

function weatherIcon(weather: WeatherReading | null, unavailable: boolean) {
  if (unavailable) return <CloudOff className="size-4" />;
  if (weather?.severityBand === "severe") return <AlertTriangle className="size-4" />;
  if (weather?.severityBand === "moderate") return <CloudRain className="size-4" />;
  return <Cloud className="size-4" />;
}

function weatherClassName(weather: WeatherReading | null, unavailable: boolean) {
  if (unavailable) return "border-border bg-muted/60 text-muted-foreground";
  if (weather?.severityBand === "severe") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (weather?.severityBand === "moderate") return "border-primary/30 bg-primary/10 text-primary";
  return "border-border bg-card text-muted-foreground";
}

// Congestion line shown inside the weather banner — built from the real
// TomTom reading: level, % slower than free-flow, live minutes, peak-hour flag
function congestionLabel(reading: CongestionReading | null | undefined, unavailable: boolean) {
  if (unavailable) return "Live traffic unavailable — showing estimates without a traffic adjustment.";
  if (!reading) return null;
  const levelLabel = reading.congestionLevel.toUpperCase();
  const percentText =
    reading.congestionIndexPercent >= 0
      ? `+${reading.congestionIndexPercent}%`
      : `${reading.congestionIndexPercent}%`;
  return `${levelLabel} traffic · ${percentText} vs free-flow · ${reading.durationInTrafficMin} min with live traffic${reading.isPeakHour ? " · peak hour" : ""}`;
}

export default function BestOptionsResults({
  tripHistoryId,
  routeId,
}: {
  tripHistoryId: string;
  routeId: string;
}) {
  // Holds the ranked options returned by the scoring engine
  const [options, setOptions] = useState<RankedOption[]>([]);
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [map, setMap] = useState<BestOptionsMap | null>(null);
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const [congestion, setCongestion] = useState<CongestionReading | null>(null);
  const [trafficUnavailable, setTrafficUnavailable] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tracks the selected card — highlights it and (per the spec) filters the
  // map to that route's polyline. All vehicles here share one route geometry
  // (fare doesn't change the physical path), so "filtering" the map means
  // keeping only the selected route drawn — selecting a different card just
  // re-confirms the same single route rather than swapping geometry.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Controls the dismissible weather banner — starts visible, hidden once the
  // user dismisses it, and reappears on manual refresh (fresh data deserves a
  // fresh look at the banner)
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Shared fetch function used by both the initial load and the Refresh button
  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/best-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripHistoryId, routeId }),
        });

        if (!res.ok) throw new Error("Best options service returned an error");

        const data = (await res.json()) as BestOptionsApiResponse;

        setOptions(Array.isArray(data.options) ? data.options : []);
        setTrip(data.trip ?? null);
        setMap(data.map ?? null);
        setWeather(data.weather ?? null);
        setWeatherUnavailable(Boolean(data.weatherUnavailable));
        setCongestion(data.congestion ?? null);
        setTrafficUnavailable(Boolean(data.trafficUnavailable));
        setLastUpdated(data.lastUpdated ?? new Date().toISOString());
        setBannerDismissed(false); // re-run re-shows the banner with fresh data
        setSelectedKey(null);
      } catch {
        setError("Could not load best options. Please try again.");
        setOptions([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tripHistoryId, routeId],
  );

  // Initial fetch on mount
  useEffect(() => {
    void load(false);
  }, [load]);

  // Manual re-run of the whole weather/traffic/scoring pipeline
  function handleRefresh() {
    void load(true);
  }

  // Trip history stores leg splits only for multi-stop trips — falls back to
  // a single-leg route when there are none, same pattern as FareResults
  const mapRoutes = useMemo<RouteResult[]>(() => {
    if (!map || map.route.coords.length === 0) return [];

    const legs = map.route.legs.length
      ? map.route.legs
      : [
          {
            startIndex: 0,
            endIndex: map.route.coords.length - 1,
            color: ROUTE_COLORS[0],
            distanceKm: map.route.distanceKm,
          },
        ];

    return [
      {
        id: map.route.id,
        rank: 1,
        coords: map.route.coords,
        distanceKm: map.route.distanceKm,
        durationMin: map.route.durationMin,
        legs,
      },
    ];
  }, [map]);

  const canShowMap = map?.origin != null && map?.destination != null && mapRoutes.length > 0;

  const title = weatherTitle(weather, weatherUnavailable);
  const showBanner = !bannerDismissed && (title !== null);
  const congestionText = congestionLabel(congestion, trafficUnavailable);

  // Formats the ISO lastUpdated timestamp as a short local time string
  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Best Options
            </h1>
            {trip && (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {trip.originLabel} → {trip.destinationLabel}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {trip.distanceKm} km · {trip.passengers} passenger{trip.passengers > 1 ? "s" : ""}
                </p>
              </>
            )}
          </div>

          {/* Manual refresh — re-runs weather/traffic/scoring and updates the timestamp */}
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
            {lastUpdatedLabel && (
              <p className="text-[11px] text-muted-foreground">Last updated {lastUpdatedLabel}</p>
            )}
          </div>
        </div>

        <div
          className={
            canShowMap
              ? "flex w-full flex-col gap-6 lg:h-[70vh] lg:flex-row"
              : "w-full max-w-2xl"
          }
        >
          <div
            className={
              canShowMap
                ? "flex flex-col lg:w-[420px] lg:flex-shrink-0 lg:overflow-y-auto lg:pr-2"
                : "flex w-full flex-col"
            }
          >
            {loading ? (
              <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Scoring the best options…
              </p>
            ) : error ? (
              <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <>
                {/* ── Dismissible weather banner — repeats the fares page's
                    weather reading, plus a congestion line, in a card the
                    user can close ── */}
                {showBanner && (
                  <div className={cn("mb-4 rounded-2xl border px-3.5 py-3", weatherClassName(weather, weatherUnavailable))}>
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0">{weatherIcon(weather, weatherUnavailable)}</span>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
                      {weather && (
                        <span className="flex-shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[11px] font-medium tabular-nums">
                          {weather.severityScore}/10
                        </span>
                      )}
                      {/* Dismiss button — hides the banner until the next refresh */}
                      <button
                        type="button"
                        onClick={() => setBannerDismissed(true)}
                        aria-label="Dismiss weather banner"
                        className="flex-shrink-0 rounded-full p-1 opacity-60 transition-opacity hover:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>

                    {congestionText && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs opacity-85">
                        <TrafficCone className="size-3.5 flex-shrink-0" />
                        {congestionText}
                      </p>
                    )}
                  </div>
                )}

                {options.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
                    <p className="text-sm font-medium text-foreground">No options available right now</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Passenger capacity or weather restrictions block every option for this trip.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Top {options.length} ranked option{options.length > 1 ? "s" : ""}
                    </p>

                    {/* ── Ranked cards ── */}
                    <div className="flex flex-col gap-3">
                      {options.map((option) => {
                        const key = `${option.provider}-${option.vehicleType}`;
                        const isSelected = selectedKey === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedKey(isSelected ? null : key)}
                            className={cn(
                              "flex w-full flex-col gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
                              isSelected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
                            )}
                          >
                            {/* Row 1: icon, name, comfort stars, best-for tag */}
                            <div className="flex w-full items-center gap-3">
                              <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-base">
                                {ICONS[key] ?? "🚘"}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {option.displayName}
                                  </span>
                                  {option.bestFor && (
                                    <span className={cn("flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase", bestForClass(option.bestFor))}>
                                      Best for {option.bestFor}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="tracking-tight">{STARS(option.comfortScore)}</span>
                                  <span aria-hidden>·</span>
                                  <span className="flex items-center gap-1">
                                    <Users className="size-3" aria-hidden />
                                    {option.maxPassengers}
                                  </span>
                                  <span aria-hidden>·</span>
                                  <span>{option.adjustedDurationMin} min</span>
                                </div>
                              </div>
                              {/* Fare range — "Estimated" label per the spec */}
                              <div className="flex-shrink-0 text-right">
                                <div className="text-sm font-semibold tabular-nums text-foreground">
                                  ৳{option.fare.low}–{option.fare.high}
                                </div>
                                <div className="text-[10px] text-muted-foreground">Estimated</div>
                              </div>
                            </div>

                            {/* Row 2: risk badge */}
                            <div className="flex items-center gap-2">
                              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide", riskBadgeClass(option.riskBand))}>
                                {riskBadgeLabel(option.riskBand)} RISK
                              </span>
                            </div>

                            {/* Row 3: pros/cons chips — up to 3 pros, 2 cons */}
                            {(option.pros.length > 0 || option.cons.length > 0) && (
                              <div className="flex flex-wrap gap-1.5">
                                {option.pros.map((pro) => (
                                  <span
                                    key={pro}
                                    className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600"
                                  >
                                    + {pro}
                                  </span>
                                ))}
                                {option.cons.map((con) => (
                                  <span
                                    key={con}
                                    className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive"
                                  >
                                    − {con}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Map — shows only the selected route's polyline. Since every
              option shares one route geometry, "filtering to the selected
              route" is inherent here rather than swapping between polylines. */}
          {canShowMap && map?.origin && map?.destination && (
            <div className="h-[500px] w-full flex-shrink-0 overflow-hidden rounded-3xl border border-border lg:h-full lg:flex-1">
              <RouteMap
                origin={map.origin}
                destination={map.destination}
                stops={map.stops}
                routes={mapRoutes}
                activeRouteId={map.route.id}
              />
            </div>
          )}
        </div>

        {trip && (
          <div className="mt-6">
            <Link
              href={`/fares?tripHistoryId=${tripHistoryId}&routeId=${routeId}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ← Back to fare estimates
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}