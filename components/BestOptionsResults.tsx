"use client";

import { AlertTriangle, Cloud, CloudOff, CloudRain, RefreshCw, TrafficCone, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COUNTRY_CONFIG,
  DEFAULT_COUNTRY,
  formatFare,
  type CountryCode,
} from "@/lib/country-config";
import type { ServerFeatures } from "@/lib/env";
import { describeTrafficUnavailable, describeWeatherUnavailable } from "@/lib/feature-messages";
import { useServerFeatures } from "@/components/features/FeatureProvider";
import { getFareSourceLabel } from "@/lib/fare-source";
import {
  FORECAST_ADVISORY,
  getWeatherReadingLabel,
  WEATHER_SEVERITY_LIMITS,
} from "@/lib/weather-reading";
import { ROUTE_COLORS, type LatLng, type RouteResult } from "@/lib/routing";
import { cn } from "@/lib/utils";
import TripProgress from "@/components/map/TripProgress";
import EstimateNotes from "@/components/EstimateNotes";
import MapShell from "@/components/layout/MapShell";
import Chip from "@/components/ui/chip";
import ListRow from "@/components/ui/list-row";
import Panel from "@/components/ui/panel";
import Pill from "@/components/ui/pill";
import EmptyState from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";

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
// Mirrors CongestionLevel VARIABLE from lib/traffic-service.ts, the real TomTom band
type CongestionLevel = "low" | "moderate" | "high" | "severe";
type RiskBand = "low" | "moderate" | "high";
type RiskBasis = "weather_and_traffic" | "weather" | "traffic" | "none";
type ScoringWeights = { time: number; cost: number; comfort: number };
type TravelPriority = "time" | "cost" | "comfort";

interface RankedOption {
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  comfortScore: number;
  adjustedDurationMin: number;
  riskBand: RiskBand;
  riskBasis?: RiskBasis;
  bestFor: "Speed" | "Budget" | "Comfort" | null;
  pros: string[];
  cons: string[];
  fare: { low: number; mid: number; high: number };
  fareSource?: "pathao_api" | "rate_card";
  fareSourceNote?: string | null;
  fareAdjustment?: {
    multiplier: number;
    weatherMultiplier: number;
    trafficMultiplier: number;
    peakHourMultiplier: number;
    notes: string[];
  } | null;
  weatherRestricted: boolean;
  restrictionReason: string | null;
  score: number;
}

interface TripSummary {
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  travelDurationMin?: number;
  dwellDurationMin?: number;
  durationMin: number;
  passengers: number;
}

interface WeatherReading {
  kind?: "current" | "forecast";
  forecastFor?: string | null;
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
  isPeakHour: boolean;             
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
    travelDurationMin?: number;
    dwellDurationMin?: number;
    durationMin: number;
  };
}

interface BestOptionsApiResponse {
  country?: CountryCode;
  trip?: TripSummary;
  map?: BestOptionsMap | null;
  weather?: WeatherReading | null;
  weatherUnavailable?: boolean;
  timeZone?: string;
  congestion?: CongestionReading | null;
  trafficUnavailable?: boolean;
  options?: RankedOption[];
  scoringPriority?: TravelPriority;
  scoringWeights?: ScoringWeights;
  lastUpdated?: string;
}

const STARS = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

const PRIORITY_OPTIONS: Array<{ value: TravelPriority; label: string }> = [
  { value: "time", label: "Speed" },
  { value: "cost", label: "Budget" },
  { value: "comfort", label: "Comfort" },
];

/**
 * The ranking rule in one sentence: the share each measure carries, and which
 * of weather and traffic was available to count against an option. It is the
 * whole rule — there is nothing else behind the order.
 */
function scoringRule(weights: ScoringWeights, basis: RiskBasis) {
  const shares = PRIORITY_OPTIONS.map((priority) => ({
    label: priority.label.toLowerCase(),
    percent: Math.round(weights[priority.value] * 100),
  })).sort((first, second) => second.percent - first.percent);
  const split = `${shares
    .slice(0, -1)
    .map((share) => `${share.percent}% on ${share.label}`)
    .join(", ")} and ${shares.at(-1)?.percent}% on ${shares.at(-1)?.label}`;

  if (basis === "weather_and_traffic") {
    return `Ranked ${split}, less a small deduction for weather and traffic risk.`;
  }
  if (basis === "weather") {
    return `Ranked ${split}, less a small deduction for weather risk. Traffic is unknown, so it is not counted.`;
  }
  if (basis === "traffic") {
    return `Ranked ${split}, less a small deduction for traffic risk. Weather is unknown, so it is not counted.`;
  }
  return `Ranked ${split}. Weather and traffic are unknown, so risk is not counted.`;
}

function scoreLabel(score: number) {
  if (!Number.isFinite(score)) return "0";
  return String(Math.max(0, Math.min(100, Math.round(score * 100))));
}

function getFareAdjustmentLabel(adjustment: RankedOption["fareAdjustment"]) {
  if (!adjustment || adjustment.notes.length === 0) return null;

  const notes = adjustment.notes.slice(0, 2).join(" · ");
  const more = adjustment.notes.length > 2 ? ` · +${adjustment.notes.length - 2} more` : "";

  return `Condition adjusted x${adjustment.multiplier.toFixed(2)}: ${notes}${more}`;
}

// Risk badge colour classes per band. A band nothing was measured for gets no
// colour: green would read as "safe".
function riskBadgeClass(band: RiskBand, basis: RiskBasis) {
  if (basis === "none") return "border-border bg-muted text-muted-foreground";
  if (band === "high") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (band === "moderate") return "border-primary/30 bg-primary/10 text-primary";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
}

// Risk badge label — LOW / MODERATE / HIGH, named for what it was worked out
// from. Without a traffic reading it is a weather risk, not an overall one.
function riskBadgeLabel(band: RiskBand, basis: RiskBasis) {
  if (basis === "none") return "RISK NOT ASSESSED";

  const level = band === "high" ? "HIGH" : band === "moderate" ? "MODERATE" : "LOW";

  if (basis === "weather") return `${level} WEATHER RISK`;
  if (basis === "traffic") return `${level} TRAFFIC RISK`;
  return `${level} RISK`;
}

// "Best for" tag colour classes per tag
function bestForClass(tag: RankedOption["bestFor"]) {
  if (tag === "Speed") return "bg-blue-500/15 text-blue-600";
  if (tag === "Budget") return "bg-emerald-500/15 text-emerald-600";
  if (tag === "Comfort") return "bg-purple-500/15 text-purple-600";
  return "bg-secondary text-secondary-foreground";
}

// Formats the weather banner title from severity band
function weatherTitle(
  weather: WeatherReading | null,
  unavailable: boolean,
  features: ServerFeatures,
) {
  if (unavailable) return describeWeatherUnavailable(features);
  if (!weather) return null;
  // A forecast restricts nothing, so it is not titled as a restriction.
  if (weather.kind === "forecast") {
    if (weather.severityBand === "severe") return "Severe weather forecast";
    if (weather.severityBand === "moderate") return "Moderate weather forecast";
    return "Low weather impact forecast";
  }
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
function congestionLabel(reading: CongestionReading | null | undefined) {
  if (!reading) return null;
  const levelLabel = reading.congestionLevel.toUpperCase();
  const percentText =
    reading.congestionIndexPercent >= 0
      ? `+${reading.congestionIndexPercent}%`
      : `${reading.congestionIndexPercent}%`;
  return `${levelLabel} traffic · ${percentText} vs free-flow · ${reading.durationInTrafficMin} min by car with live traffic${reading.isPeakHour ? " · peak hour" : ""}`;
}

export default function BestOptionsResults({
  tripHistoryId,
  routeId,
}: {
  tripHistoryId: string;
  routeId: string;
}) {
  // Holds the ranked options returned by the scoring engine
  // From the API, not from context: this ranks a stored trip, which keeps the
  // country it was planned in.
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [timeZone, setTimeZone] = useState(COUNTRY_CONFIG[DEFAULT_COUNTRY].timeZone);
  const [options, setOptions] = useState<RankedOption[]>([]);
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [map, setMap] = useState<BestOptionsMap | null>(null);
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const features = useServerFeatures();
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const [congestion, setCongestion] = useState<CongestionReading | null>(null);
  const [trafficUnavailable, setTrafficUnavailable] = useState(false);
  const [scoringPriority, setScoringPriority] = useState<TravelPriority | null>(null);
  const [scoringWeights, setScoringWeights] = useState<ScoringWeights | null>(null);
  const [pendingPriority, setPendingPriority] = useState<TravelPriority | null>(null);
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
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [mapFitRequest, setMapFitRequest] = useState(0);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Controls the dismissible weather banner — starts visible, hidden once the
  // user dismisses it, and reappears on manual refresh (fresh data deserves a
  // fresh look at the banner)
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Shared fetch function used by both the initial load and the Refresh button
  const load = useCallback(
    async (isRefresh: boolean, priorityOverride?: TravelPriority | null) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const requestedPriority = priorityOverride ?? null;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/best-options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            tripHistoryId,
            routeId,
            ...(requestedPriority ? { priority: requestedPriority } : {}),
          }),
        });

        if (!res.ok) throw new Error("Ranking service returned an error");

        const data = (await res.json()) as BestOptionsApiResponse;
        if (requestId !== requestIdRef.current) return;

        setCountry(data.country ?? DEFAULT_COUNTRY);
        setTimeZone(data.timeZone ?? COUNTRY_CONFIG[data.country ?? DEFAULT_COUNTRY].timeZone);
        setOptions(Array.isArray(data.options) ? data.options : []);
        setTrip(data.trip ?? null);
        setMap(data.map ?? null);
        setWeather(data.weather ?? null);
        setWeatherUnavailable(Boolean(data.weatherUnavailable));
        setCongestion(data.congestion ?? null);
        setTrafficUnavailable(Boolean(data.trafficUnavailable));
        setScoringPriority(data.scoringPriority ?? null);
        setScoringWeights(data.scoringWeights ?? null);
        setLastUpdated(data.lastUpdated ?? new Date().toISOString());
        setBannerDismissed(false); // re-run re-shows the banner with fresh data
        setSelectedKey(null);
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }

        if (requestId !== requestIdRef.current) return;
        setError("Could not load the ranked options. Please try again.");
        setOptions([]);
      } finally {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
        setPendingPriority(null);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [tripHistoryId, routeId],
  );

  // Initial fetch on mount
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      abortRef.current?.abort();
    };
  }, [load]);

  // Manual re-run of the whole weather/traffic/scoring pipeline
  function handleRefresh() {
    void load(true, scoringPriority);
  }

  function handlePriorityChange(priority: TravelPriority) {
    if (loading || refreshing || priority === scoringPriority) return;

    setPendingPriority(priority);
    void load(true, priority);
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
            durationMin: map.route.durationMin,
          },
        ];

    return [
      {
        id: map.route.id,
        rank: 1,
        coords: map.route.coords,
        distanceKm: map.route.distanceKm,
        travelDurationMin: map.route.travelDurationMin,
        dwellDurationMin: map.route.dwellDurationMin,
        durationMin: map.route.durationMin,
        legs,
      },
    ];
  }, [map]);

  const canShowMap = map?.origin != null && map?.destination != null && mapRoutes.length > 0;

  const title = weatherTitle(weather, weatherUnavailable, features);
  const showBanner = !bannerDismissed && (title !== null);
  const congestionText = trafficUnavailable ? null : congestionLabel(congestion);
  // Shown in the page header rather than the dismissible weather banner, so
  // it cannot be closed or missed when there is no weather to report.
  const trafficNote =
    loading || !trafficUnavailable
      ? null
      : `${describeTrafficUnavailable(country, features)} Times, fares and risk use no traffic data.`;
  const activePriority = pendingPriority ?? scoringPriority ?? "time";
  const isPriorityChanging = pendingPriority !== null;

  const selectedOption = options.find((o) => `${o.provider}-${o.vehicleType}` === selectedKey) ?? null;

  async function handleConfirm() {
    if (!selectedOption) return;
    setConfirming(true);
    setConfirmError(null);

    try {
      const res = await fetch("/api/trip-input/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripHistoryId,
          routeId,
          provider: selectedOption.provider,
          vehicleType: selectedOption.vehicleType,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        setConfirmError(data?.message ?? "Could not save this plan. Please try again.");
        setConfirming(false);
        return;
      }

      window.dispatchEvent(new Event("notifications:refresh"));
      router.push(`/trip-summary?tripHistoryId=${data.tripHistoryId}`);
    } catch {
      setConfirmError("Could not save this plan. Please try again.");
      setConfirming(false);
    }
  }

  // Formats the ISO lastUpdated timestamp as a short local time string
  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <main className="flex-1">
      <MapShell
        sidebar={<>
          <TripProgress current="ranked" tripHistoryId={tripHistoryId} routeId={routeId} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Ranked options</h1>
            <p className="mt-2 text-sm text-muted-foreground">Options are scored on time, cost and comfort for your chosen priority and route.</p>
            {trip && <p className="mt-2 text-sm text-muted-foreground">{trip.originLabel} → {trip.destinationLabel} · {trip.distanceKm} km · {trip.passengers} passenger{trip.passengers === 1 ? "" : "s"}</p>}
            <EstimateNotes adjustedTimes className="mt-2" />
            {trafficNote && <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><TrafficCone className="mt-px size-3.5 shrink-0" aria-hidden /><span>{trafficNote}</span></p>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={handleRefresh} disabled={loading || refreshing || confirming} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60">
              <RefreshCw className={cn("size-3.5", refreshing && "motion-safe:animate-spin")} aria-hidden="true" /> Refresh
            </button>
            {lastUpdatedLabel && <p className="text-xs text-muted-foreground">Last updated {lastUpdatedLabel}</p>}
          </div>
          {loading ? <SkeletonRows label="Ranking the options…" /> : error ? (
            <div role="alert"><EmptyState title="Could not load ranked options" description={error} /></div>
          ) : <>
            {showBanner && <div className={cn("rounded-xl border px-3 py-2.5", weatherClassName(weather, weatherUnavailable))}>
              <div className="flex items-center gap-2"><span aria-hidden="true">{weatherIcon(weather, weatherUnavailable)}</span><p className="min-w-0 flex-1 text-sm font-medium">{title}</p>
                {weather && <Pill className="border border-current/30 bg-transparent text-current tabular-nums">{weather.severityScore}/10</Pill>}
                <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss weather banner" className="rounded-full p-1 opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
              </div>
              {weather && <p className="mt-2 text-xs opacity-80">{getWeatherReadingLabel(weather, timeZone)}. {weather.kind === "forecast" ? `${FORECAST_ADVISORY} ` : ""}{WEATHER_SEVERITY_LIMITS}</p>}
              {congestionText && <p className="mt-2 flex items-center gap-1.5 text-xs opacity-85"><TrafficCone className="size-3.5 shrink-0" aria-hidden />{congestionText}</p>}
            </div>}
            {isPriorityChanging ? <SkeletonRows label={`Re-scoring for ${PRIORITY_OPTIONS.find((priority) => priority.value === pendingPriority)?.label ?? "selected"} priority…`} /> : options.length === 0 ? (
              <EmptyState title="No options available right now" description="Passenger capacity or weather restrictions block every option for this trip." />
            ) : <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{options.length > 1 ? `${options.length} options, ranked` : "1 option fits this trip"}</p>
                <div role="group" aria-label="Scoring priority" className="flex flex-wrap gap-2">
                  {PRIORITY_OPTIONS.map((priority) => <Chip key={priority.value} selected={priority.value === activePriority} buttonProps={{ disabled: loading || refreshing || confirming, onClick: () => handlePriorityChange(priority.value) }}>{priority.label}</Chip>)}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{options.length > 1 ? scoringWeights && scoringRule(scoringWeights, options[0].riskBasis ?? "weather_and_traffic") : "Only one option fits this trip, so there is nothing to rank it against."}</p>
              </div>
              <div className="space-y-2">
                {options.map((option, index) => {
                  const key = `${option.provider}-${option.vehicleType}`;
                  const isSelected = selectedKey === key;
                  const adjustmentLabel = getFareAdjustmentLabel(option.fareAdjustment);
                  const basis = option.riskBasis ?? "weather_and_traffic";
                  return <ListRow key={key} selected={isSelected} disabled={confirming || refreshing}
                    onClick={() => { setSelectedKey(isSelected ? null : key); setConfirmError(null); }}
                    className={cn(!isSelected && "border-border bg-card")}
                    leading={index + 1}
                    title={option.displayName}
                    pill={index === 0 && options.length > 1 ? <Pill>#1</Pill> : undefined}
                    meta={<>
                      <span className="block">{STARS(option.comfortScore)} · Capacity: {option.maxPassengers} · est. {option.adjustedDurationMin} min</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Pill className={cn("border text-[10px]", riskBadgeClass(option.riskBand, basis))}>{riskBadgeLabel(option.riskBand, basis)}</Pill>
                        {options.length > 1 && (
                          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">Score {scoreLabel(option.score)}</span>
                        )}
                        {option.bestFor && <Pill className={cn("text-[10px]", bestForClass(option.bestFor))}>Best for {option.bestFor}</Pill>}
                      </span>
                      {option.fareSourceNote && <span className="mt-1 block">{option.fareSourceNote}</span>}
                      {option.weatherRestricted && option.restrictionReason && <span className="mt-1 block text-primary">{option.restrictionReason}</span>}
                      {adjustmentLabel && <span className="mt-1 block text-primary">{adjustmentLabel}</span>}
                      {(option.pros.length > 0 || option.cons.length > 0) && <span className="mt-1 flex flex-wrap gap-1">
                        {option.pros.map((pro) => <Pill key={`pro-${pro}`} className="bg-emerald-500/10 text-emerald-600">+ {pro}</Pill>)}
                        {option.cons.map((con) => <Pill key={`con-${con}`} className="bg-destructive/10 text-destructive">− {con}</Pill>)}
                      </span>}
                    </>}
                    trailing={<span className="block text-right"><span className="block text-sm font-semibold tabular-nums text-foreground">{formatFare(option.fare.low, option.fare.high, country)}</span><span className="block text-[10px] text-muted-foreground">{getFareSourceLabel(option.fareSource) ?? "Estimated"}</span></span>}
                  />;
                })}
              </div>
            </>}
          </>}
        </>}
        map={canShowMap && map?.origin && map?.destination ? <RouteMap square choreographed country={country} origin={map.origin} destination={map.destination} stops={map.stops} routes={mapRoutes} activeRouteId={map.route.id} fitRequest={mapFitRequest} showFitControl={!selectedOption || refreshing} /> : <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">{loading ? "Loading map…" : "Map unavailable for this trip."}</div>}
        overlay={selectedOption && !refreshing && <section aria-label="Selected ranked option" className="planner-fade-up">
          <Panel className="bg-card/95 shadow-lg backdrop-blur">
            <h2 className="text-base font-semibold text-foreground">{selectedOption.displayName}</h2>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatFare(selectedOption.fare.low, selectedOption.fare.high, country)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{getFareSourceLabel(selectedOption.fareSource) ?? "Estimated"}</p>
            {options.length > 1 && <p className="mt-3 text-sm font-medium text-foreground">Score {scoreLabel(selectedOption.score)} / 100</p>}
            {options.length > 1 && scoringWeights && <p className="mt-1 text-xs text-muted-foreground">{scoringRule(scoringWeights, selectedOption.riskBasis ?? "weather_and_traffic")}</p>}
            {confirmError && <p role="alert" className="mt-3 text-xs text-destructive">{confirmError}</p>}
            <button type="button" onClick={handleConfirm} disabled={confirming} className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{confirming ? "Saving…" : "Save plan"}</button>
            <p className="mt-2 text-center text-xs text-muted-foreground">This saves your choice. It does not book a ride.</p>
            {canShowMap && <button type="button" onClick={() => setMapFitRequest((request) => request + 1)} className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted">Fit route</button>}
          </Panel>
        </section>}
      />
    </main>
  );
}
