'use client'

import { AlertTriangle, Cloud, CloudOff, CloudRain, TrafficCone } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import {
  COUNTRY_CONFIG,
  DEFAULT_COUNTRY,
  formatFare,
  type CountryCode,
} from '@/lib/country-config'
import type { ServerFeatures } from '@/lib/env'
import { describeTrafficUnavailable, describeWeatherUnavailable } from '@/lib/feature-messages'
import { useServerFeatures } from '@/components/features/FeatureProvider'
import { getFareSourceLabel } from '@/lib/fare-source'
import {
  describeUnavailable,
  FARE_SORT_OPTIONS,
  hasCapacityExclusion,
  sortFareOptions,
  type FareSort,
} from '@/lib/fare-sorting'
import { ROUTE_COLORS, type LatLng, type RouteResult } from '@/lib/routing'
import {
  FORECAST_ADVISORY,
  getWeatherReadingLabel,
  WEATHER_SEVERITY_LIMITS,
} from '@/lib/weather-reading'
import { cn } from '@/lib/utils'
import TripProgress from "@/components/map/TripProgress";
import EstimateNotes from "@/components/EstimateNotes";
import MapShell from '@/components/layout/MapShell'
import ListRow from '@/components/ui/list-row'
import Panel from '@/components/ui/panel'
import Pill from '@/components/ui/pill'
import EmptyState from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

type WeatherBand = 'low' | 'moderate' | 'severe'

interface FareAdjustment {
  multiplier: number
  weatherMultiplier: number
  trafficMultiplier: number
  peakHourMultiplier: number
  notes: string[]
}

interface FareOption {
  provider: string
  vehicleType: string
  displayName: string
  maxPassengers: number
  comfortScore: number
  eligible: boolean
  weatherRestricted?: boolean
  weatherBlocked?: boolean
  restrictionReason?: string | null
  fare: { low: number; mid: number; high: number }
  // 'rate_card' means the live provider quote was unavailable and this is a
  // local estimate; fareSourceNote explains why.
  fareSource?: 'pathao_api' | 'rate_card'
  fareSourceNote?: string | null
  fareAdjustment?: FareAdjustment | null
}

interface FareTripSummary {
  originLabel: string
  destinationLabel: string
  distanceKm: number
  travelDurationMin?: number
  dwellDurationMin?: number
  durationMin: number
  passengers: number
}

interface FareWeather {
  source: 'route_midpoint' | 'dhaka_fallback'
  kind?: 'current' | 'forecast'
  forecastFor?: string | null
  temperatureCelsius: number
  precipitationMmPerHour: number
  windKmh: number
  visibilityMeters: number | null
  severityScore: number
  severityBand: WeatherBand
}

interface FareMapPoint extends LatLng {
  label: string
}

interface FareMap {
  origin: FareMapPoint | null
  destination: FareMapPoint | null
  stops: FareMapPoint[]
  route: {
    id: string
    coords: [number, number][]
    legs: RouteResult['legs']
    distanceKm: number
    travelDurationMin?: number
    dwellDurationMin?: number
    durationMin: number
  }
}

interface FaresApiResponse {
  country?: CountryCode
  results?: FareOption[]
  trip?: FareTripSummary
  map?: FareMap | null
  weather?: FareWeather | null
  weatherUnavailable?: boolean
  trafficUnavailable?: boolean
  timeZone?: string
}

const ICONS: Record<string, string> = {
  'uber-go': '🚗',
  'uber-moto': '🛵',
  'uber-premier': '🚙',
  'pathao-bike': '🏍️',
  'pathao-car': '🚕',
  'cng-auto': '🛺',
  'uber-xl': '🚐',
}

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

const WEATHER_STATS: { label: string; format: (weather: FareWeather) => string }[] = [
  {
    label: 'Temp',
    format: (w) =>
      Number.isFinite(w.temperatureCelsius) ? `${w.temperatureCelsius}°C` : '—',
  },
  { label: 'Rain', format: (w) => `${w.precipitationMmPerHour} mm/h` },
  { label: 'Wind', format: (w) => `${w.windKmh} km/h` },
  {
    label: 'Visibility',
    format: (w) =>
      w.visibilityMeters == null
        ? '—'
        : w.visibilityMeters >= 1000
          ? `${Math.round(w.visibilityMeters / 100) / 10} km`
          : `${w.visibilityMeters} m`,
  },
]

// `source` is a persisted enum whose "dhaka_fallback" value predates multi-
// country support, so the stored name stays while the label names whichever
// country's fallback point was actually used.
function getWeatherSourceLabel(weather: FareWeather, country: CountryCode) {
  return weather.source === 'route_midpoint'
    ? 'route midpoint'
    : `${COUNTRY_CONFIG[country].label} fallback`
}

function getWeatherTitle(
  weather: FareWeather | null,
  unavailable: boolean,
  features: ServerFeatures,
) {
  if (unavailable) return describeWeatherUnavailable(features)
  if (!weather) return null
  // A forecast restricts nothing, so it is not titled as a restriction.
  if (weather.kind === 'forecast') {
    if (weather.severityBand === 'severe') return 'Severe weather forecast'
    if (weather.severityBand === 'moderate') return 'Moderate weather forecast'
    return 'Low weather impact forecast'
  }
  if (weather.severityBand === 'severe') return 'Severe weather restrictions'
  if (weather.severityBand === 'moderate') return 'Moderate weather caution'
  return 'Low weather impact'
}

/** Only the no-data case needs prose now — readings render as stats instead. */
function getWeatherDescription(unavailable: boolean) {
  return unavailable
    ? 'Showing normal fare estimates without weather restrictions.'
    : null
}

function getWeatherIcon(weather: FareWeather | null, unavailable: boolean) {
  if (unavailable) return <CloudOff className="size-4" />
  if (weather?.severityBand === 'severe') return <AlertTriangle className="size-4" />
  if (weather?.severityBand === 'moderate') return <CloudRain className="size-4" />
  return <Cloud className="size-4" />
}

function getWeatherClassName(weather: FareWeather | null, unavailable: boolean) {
  if (unavailable) {
    return 'border-border bg-muted/60 text-muted-foreground'
  }

  if (weather?.severityBand === 'severe') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }

  if (weather?.severityBand === 'moderate') {
    return 'border-primary/30 bg-primary/10 text-primary'
  }

  return 'border-border bg-card text-muted-foreground'
}

function getFareAdjustmentLabel(adjustment: FareAdjustment | null | undefined) {
  if (!adjustment || adjustment.notes.length === 0) return null

  const notes = adjustment.notes.slice(0, 2).join(' · ')
  const more = adjustment.notes.length > 2 ? ` · +${adjustment.notes.length - 2} more` : ''

  return `Condition adjusted x${adjustment.multiplier.toFixed(2)}: ${notes}${more}`
}

export default function FareResults({ tripHistoryId, routeId }: {
  tripHistoryId: string; routeId: string
}) {
  // The trip's country, from the API rather than from context: this page
  // prices a stored trip, which keeps the country it was planned in even after
  // the user switches. Defaults until the response lands.
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY)
  const [results, setResults] = useState<FareOption[]>([])
  const [trip, setTrip] = useState<FareTripSummary | null>(null)
  const [map, setMap] = useState<FareMap | null>(null)
  const [weather, setWeather] = useState<FareWeather | null>(null)
  const features = useServerFeatures()
  const [weatherUnavailable, setWeatherUnavailable] = useState(false)
  const [timeZone, setTimeZone] = useState(COUNTRY_CONFIG[DEFAULT_COUNTRY].timeZone)
  const [trafficUnavailable, setTrafficUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSort] = useState<FareSort>('default')
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [mapFitRequest, setMapFitRequest] = useState(0)
  const router = useRouter()

  useEffect(() => {
    let active = true

    fetch('/api/fares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripHistoryId, routeId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Fare service returned an error')
        return r.json() as Promise<FaresApiResponse>
      })
      .then((d) => {
        if (!active) return
        setCountry(d?.country ?? DEFAULT_COUNTRY)
        setResults(Array.isArray(d?.results) ? d.results : [])
        setTrip(d?.trip ?? null)
        setMap(d?.map ?? null)
        setWeather(d?.weather ?? null)
        setWeatherUnavailable(Boolean(d?.weatherUnavailable))
        setTimeZone(d?.timeZone ?? COUNTRY_CONFIG[d?.country ?? DEFAULT_COUNTRY].timeZone)
        setTrafficUnavailable(Boolean(d?.trafficUnavailable))
        setError(null)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load fare estimates. Please try again.')
        setResults([])
        setTrip(null)
        setMap(null)
        setWeather(null)
        setWeatherUnavailable(false)
        setTrafficUnavailable(false)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [tripHistoryId, routeId])

  // Trip history stores leg splits only for multi-stop trips, so a direct route
  // arrives with none — draw it as a single leg rather than an empty map.
  const mapRoutes = useMemo<RouteResult[]>(() => {
    if (!map || map.route.coords.length === 0) return []

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
        ]

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
    ]
  }, [map])

  const canShowMap =
    map?.origin != null && map?.destination != null && mapRoutes.length > 0

  const passengers = trip?.passengers ?? 1
  const available = sortFareOptions(
    results.filter((result) => result.eligible && !result.weatherBlocked),
    sort,
  )
  const unavailable = results.filter((result) => !result.eligible || result.weatherBlocked)
  const weatherTitle = getWeatherTitle(weather, weatherUnavailable, features)
  const weatherDescription = getWeatherDescription(weatherUnavailable)
  const selectedOption = available.find((v) => `${v.provider}-${v.vehicleType}` === selected) ?? null

  async function handleConfirm() {
    if (!selectedOption) return
    setConfirming(true)
    setConfirmError(null)

    try {
      const res = await fetch('/api/trip-input/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripHistoryId,
          routeId,
          provider: selectedOption.provider,
          vehicleType: selectedOption.vehicleType,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data?.success) {
        setConfirmError(data?.message ?? 'Could not save this plan. Please try again.')
        setConfirming(false)
        return
      }

      window.dispatchEvent(new Event('notifications:refresh'))
      router.push(`/trip-summary?tripHistoryId=${data.tripHistoryId}`)
    } catch {
      setConfirmError('Could not save this plan. Please try again.')
      setConfirming(false)
    }
  }

  return (
    <main className="flex-1">
      <MapShell
        sidebar={<>
          <TripProgress current="fares" tripHistoryId={tripHistoryId} routeId={routeId} canRank={Boolean(trip)} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Fare estimates</h1>
            {trip && <p className="mt-2 text-sm text-muted-foreground">
              {trip.originLabel} → {trip.destinationLabel} · {trip.distanceKm} km · {trip.durationMin} min · {trip.passengers} passenger{trip.passengers === 1 ? '' : 's'}
            </p>}
            {!loading && results.length > 0 && <p className="mt-1 text-xs text-muted-foreground">
              {COUNTRY_CONFIG[country].label} · fares in {COUNTRY_CONFIG[country].currency}
            </p>}
            <EstimateNotes className="mt-2" />
            {!loading && trafficUnavailable && <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <TrafficCone className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>{describeTrafficUnavailable(country, features)} Fares include no traffic adjustment.</span>
            </p>}
          </div>
          {loading ? <SkeletonRows label="Calculating fares…" /> : error ? (
            <div role="alert"><EmptyState title="Could not load fares" description={error} /></div>
          ) : results.length === 0 ? (
            <EmptyState title="No fares available" description="We could not find any services for this trip." />
          ) : <>
            {weatherTitle && <details className={cn('rounded-xl border px-3 py-2.5', getWeatherClassName(weather, weatherUnavailable))}>
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span aria-hidden="true">{getWeatherIcon(weather, weatherUnavailable)}</span>
                <span className="min-w-0 flex-1">{weatherTitle}</span>
                {weather && <Pill className="border border-current/30 bg-transparent text-current tabular-nums">{weather.severityScore}/10</Pill>}
                <span aria-hidden="true">⌄</span><span className="sr-only">Show weather details</span>
              </summary>
              {weather ? <>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {WEATHER_STATS.map((stat) => <div key={stat.label}><dt className="opacity-70">{stat.label}</dt><dd className="mt-0.5 font-medium tabular-nums">{stat.format(weather)}</dd></div>)}
                </dl>
                <p className="mt-2 text-xs opacity-80">{getWeatherReadingLabel(weather, timeZone)}, {weather.kind === 'forecast' ? 'for the' : 'measured at the'} {getWeatherSourceLabel(weather, country)}</p>
                {weather.kind === 'forecast' && <p className="mt-1.5 text-xs opacity-80">{FORECAST_ADVISORY}</p>}
                <p className="mt-1.5 text-xs opacity-80">{WEATHER_SEVERITY_LIMITS}</p>
              </> : weatherDescription && <p className="mt-2 text-xs">{weatherDescription}</p>}
            </details>}

            {available.length > 0 ? <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{available.length} option{available.length === 1 ? '' : 's'}</h2>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Sort
                  <select value={sort} onChange={(event) => setSort(event.target.value as FareSort)} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground">
                    {FARE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="space-y-2">
                {available.map((v) => {
                  const key = `${v.provider}-${v.vehicleType}`
                  const isSelected = selected === key
                  const adjustmentLabel = getFareAdjustmentLabel(v.fareAdjustment)
                  return <ListRow key={key} selected={isSelected} disabled={confirming} onClick={() => { setSelected(isSelected ? null : key); setConfirmError(null) }}
                    className={cn(!isSelected && 'border-border bg-card')}
                    leading={<span aria-hidden="true">{ICONS[key] ?? '🚘'}</span>}
                    title={v.displayName}
                    meta={<>
                      <span className="block">{STARS(v.comfortScore)} · Capacity: {v.maxPassengers}</span>
                      {v.fareSourceNote && <span className="mt-1 block">{v.fareSourceNote}</span>}
                      {v.weatherRestricted && v.restrictionReason && <span className="mt-1 block text-primary">{v.restrictionReason}</span>}
                      {adjustmentLabel && <span className="mt-1 block text-primary">{adjustmentLabel}</span>}
                    </>}
                    trailing={<span className="block text-right"><span className="block text-sm font-semibold tabular-nums text-foreground">{formatFare(v.fare.low, v.fare.high, country)}</span>{getFareSourceLabel(v.fareSource) && <span className="block text-[10px] text-muted-foreground">{getFareSourceLabel(v.fareSource)}</span>}</span>}
                  />
                })}
              </div>
            </> : <EmptyState title="No services available right now" description="Passenger capacity or weather restrictions block every option." />}

            {unavailable.length > 0 && <section aria-labelledby="unavailable-heading" className="mt-2">
              <h2 id="unavailable-heading" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Unavailable</h2>
              {hasCapacityExclusion(unavailable) && <p className="mb-2 text-xs text-muted-foreground">Some vehicles are too small for {passengers} passenger{passengers === 1 ? '' : 's'}. <Link href={`/?${new URLSearchParams({ tripHistoryId, routeId })}`} className="font-medium text-primary hover:underline">Change the passenger count in the planner</Link>.</p>}
              <div className="space-y-2">
                {unavailable.map((v) => <ListRow key={`${v.provider}-${v.vehicleType}`} disabled className="border-border bg-card opacity-60"
                  leading={<span aria-hidden="true">{ICONS[`${v.provider}-${v.vehicleType}`] ?? '🚘'}</span>}
                  title={v.displayName} meta={describeUnavailable(v, passengers)}
                  trailing={<span className="text-sm font-semibold tabular-nums text-muted-foreground line-through">{formatFare(v.fare.low, v.fare.high, country)}</span>} />)}
              </div>
            </section>}
          </>}
        </>}
        map={canShowMap && map?.origin && map?.destination ? <RouteMap square choreographed country={country} origin={map.origin} destination={map.destination} stops={map.stops} routes={mapRoutes} activeRouteId={map.route.id} fitRequest={mapFitRequest} showFitControl={!selectedOption} /> : <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">{loading ? 'Loading map…' : 'Map unavailable for this trip.'}</div>}
        overlay={selectedOption && <section aria-label="Selected fare details" className="planner-fade-up">
          <Panel className="bg-card/95 shadow-lg backdrop-blur">
            <h2 className="text-base font-semibold text-foreground">{selectedOption.displayName}</h2>
            <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatFare(selectedOption.fare.low, selectedOption.fare.high, country)}</p>
            {getFareSourceLabel(selectedOption.fareSource) && <p className="mt-1 text-xs text-muted-foreground">{getFareSourceLabel(selectedOption.fareSource)}</p>}
            {confirmError && <p role="alert" className="mt-3 text-xs text-destructive">{confirmError}</p>}
            <button type="button" onClick={handleConfirm} disabled={confirming} className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{confirming ? 'Saving…' : 'Save plan'}</button>
            <p className="mt-2 text-center text-xs text-muted-foreground">This saves your choice. It does not book a ride.</p>
            {canShowMap && <button type="button" onClick={() => setMapFitRequest((request) => request + 1)} className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted">Fit route</button>}
          </Panel>
        </section>}
      />
    </main>
  )
}
