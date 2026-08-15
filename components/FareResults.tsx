'use client'

import { AlertTriangle, Cloud, CloudOff, CloudRain, Sparkles, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { ROUTE_COLORS, type LatLng, type RouteResult } from '@/lib/routing'
import { cn } from '@/lib/utils'

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-3xl bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

type WeatherBand = 'low' | 'moderate' | 'severe'

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
}

interface FareTripSummary {
  originLabel: string
  destinationLabel: string
  distanceKm: number
  durationMin: number
  passengers: number
}

interface FareWeather {
  source: 'route_midpoint' | 'dhaka_fallback'
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
    durationMin: number
  }
}

interface FaresApiResponse {
  results?: FareOption[]
  trip?: FareTripSummary
  map?: FareMap | null
  weather?: FareWeather | null
  weatherUnavailable?: boolean
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

function getWeatherSourceLabel(weather: FareWeather) {
  return weather.source === 'route_midpoint' ? 'route midpoint' : 'Dhaka fallback'
}

function getWeatherTitle(weather: FareWeather | null, unavailable: boolean) {
  if (unavailable) return 'Weather data unavailable'
  if (!weather) return null
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

function getUnavailableReason(option: FareOption, passengers: number) {
  const reasons = []

  if (!option.eligible) {
    reasons.push(`Max ${option.maxPassengers} passenger${option.maxPassengers > 1 ? 's' : ''}`)
  }

  if (option.weatherBlocked) {
    reasons.push(option.restrictionReason ?? 'Blocked by weather restrictions')
  }

  return reasons.join(' · ') || `Not available for ${passengers} passengers`
}

export default function FareResults({ tripHistoryId, routeId }: {
  tripHistoryId: string; routeId: string
}) {
  const [results, setResults] = useState<FareOption[]>([])
  const [trip, setTrip] = useState<FareTripSummary | null>(null)
  const [map, setMap] = useState<FareMap | null>(null)
  const [weather, setWeather] = useState<FareWeather | null>(null)
  const [weatherUnavailable, setWeatherUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
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
        setResults(Array.isArray(d?.results) ? d.results : [])
        setTrip(d?.trip ?? null)
        setMap(d?.map ?? null)
        setWeather(d?.weather ?? null)
        setWeatherUnavailable(Boolean(d?.weatherUnavailable))
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
          },
        ]

    return [
      {
        id: map.route.id,
        rank: 1,
        coords: map.route.coords,
        distanceKm: map.route.distanceKm,
        durationMin: map.route.durationMin,
        legs,
      },
    ]
  }, [map])

  const canShowMap =
    map?.origin != null && map?.destination != null && mapRoutes.length > 0

  const passengers = trip?.passengers ?? 1
  const available = results.filter((result) => result.eligible && !result.weatherBlocked)
  const unavailable = results.filter((result) => !result.eligible || result.weatherBlocked)
  const weatherTitle = getWeatherTitle(weather, weatherUnavailable)
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
        setConfirmError(data?.message ?? 'Could not confirm this ride. Please try again.')
        setConfirming(false)
        return
      }

      router.push(`/trip-summary?tripHistoryId=${data.tripHistoryId}`)
    } catch {
      setConfirmError('Could not confirm this ride. Please try again.')
      setConfirming(false)
    }
  }

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Available Services
          </h1>
          {trip && (
            <p className="mt-2 text-sm text-muted-foreground">
              {trip.originLabel} → {trip.destinationLabel}
            </p>
          )}
          {trip && (
            <p className="mt-1 text-sm text-muted-foreground">
              {trip.distanceKm} km · {trip.durationMin} min · {trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}
            </p>
          )}
          {/* Entry point into the Route Comparison Display. Reuses the same
              tripHistoryId + routeId this page already received, so
              /best-options can look up the exact same trip and route rather
              than re-deriving anything from scratch. */}
          {trip && (
            <Link
              href={`/best-options?tripHistoryId=${tripHistoryId}&routeId=${routeId}`}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="size-4" />
              Best Options →
            </Link>
          )}
        </div>

        {/* Mirrors the dashboard's results layout: a fixed-width scrolling
            column beside a map that fills the rest of the 70vh row. */}
        <div
          className={
            canShowMap
              ? 'flex w-full flex-col gap-6 lg:h-[70vh] lg:flex-row'
              : 'w-full max-w-2xl'
          }
        >
          <div
            className={
              canShowMap
                ? 'flex flex-col lg:w-95 lg:shrink-0 lg:overflow-y-auto lg:pr-2'
                : 'flex w-full flex-col'
            }
          >
            {loading ? (
              <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                Calculating fares…
              </p>
            ) : error ? (
              <p
                role="alert"
                className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No fares available</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We could not find any services for this trip.
                </p>
              </div>
            ) : (
              <>
                {weatherTitle && (
                  <div
                    className={cn(
                      'mb-4 rounded-2xl border px-3.5 py-3',
                      getWeatherClassName(weather, weatherUnavailable),
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">
                        {getWeatherIcon(weather, weatherUnavailable)}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {weatherTitle}
                      </p>
                      {weather && (
                        <span className="shrink-0 rounded-full border border-current/30 px-2 py-0.5 text-[11px] font-medium tabular-nums">
                          {weather.severityScore}/10
                        </span>
                      )}
                    </div>

                    {/* Stacked stats rather than one long sentence — the sentence
                        form wrapped to three lines in this column. */}
                    {weather ? (
                      <>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-2">
                          {WEATHER_STATS.map((stat) => (
                            <div key={stat.label}>
                              <dt className="opacity-70">{stat.label}</dt>
                              <dd className="mt-0.5 font-medium tabular-nums">
                                {stat.format(weather)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-2.5 text-[11px] opacity-70">
                          Measured at {getWeatherSourceLabel(weather)}
                        </p>
                      </>
                    ) : (
                      weatherDescription && (
                        <p className="mt-1.5 text-xs opacity-85">{weatherDescription}</p>
                      )
                    )}
                  </div>
                )}

                {available.length > 0 ? (
                  <>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {available.length} option{available.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Estimated fares
                      </p>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {available.map((v) => {
                        const key = `${v.provider}-${v.vehicleType}`
                        const isSelected = selected === key
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelected(isSelected ? null : key)}
                            className={cn(
                              'flex w-full flex-col gap-2 rounded-2xl border px-3.5 py-3 text-left transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-card hover:bg-muted',
                            )}
                          >
                            <div className="flex w-full items-center gap-3">
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base">
                                {ICONS[key] ?? '🚘'}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {v.displayName}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <span className="tracking-tight">
                                    {STARS(v.comfortScore)}
                                  </span>
                                  <span aria-hidden>·</span>
                                  <span className="flex items-center gap-1">
                                    <Users className="size-3" aria-hidden />
                                    {v.maxPassengers}
                                  </span>
                                </div>
                              </div>
                              {/* tabular-nums keeps the ৳ ranges aligned down the column */}
                              <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                ৳{v.fare.low}–{v.fare.high}
                              </div>
                            </div>

                            {v.weatherRestricted && v.restrictionReason && (
                              <p className="flex items-start gap-1.5 rounded-lg bg-primary/10 px-2 py-1 text-[11px] leading-snug text-primary">
                                <CloudRain className="mt-px size-3 shrink-0" aria-hidden />
                                {v.restrictionReason}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {selectedOption && (
                      <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-3">
                        {confirmError && (
                          <p role="alert" className="mb-2 text-xs text-destructive">
                            {confirmError}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={handleConfirm}
                          disabled={confirming}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                        >
                          {confirming
                            ? 'Confirming…'
                            : `Confirm ${selectedOption.displayName} · ৳${selectedOption.fare.low}–${selectedOption.fare.high}`}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
                    <p className="text-sm font-medium text-foreground">
                      No services available right now
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Passenger capacity or weather restrictions block every option.
                    </p>
                  </div>
                )}

                {unavailable.length > 0 && (
                  <div className="mt-6">
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Unavailable
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {unavailable.map((v) => {
                        const key = `${v.provider}-${v.vehicleType}`
                        return (
                          <div
                            key={key}
                            aria-disabled
                            className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/50 px-3.5 py-3"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base opacity-50 grayscale">
                              {ICONS[key] ?? '🚘'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-muted-foreground">
                                {v.displayName}
                              </div>
                              {/* The reason already names the blocker, so the
                                  old duplicate badge under the price is gone. */}
                              <div className="mt-0.5 text-xs leading-snug text-muted-foreground/75">
                                {getUnavailableReason(v, passengers)}
                              </div>
                            </div>
                            <div className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground/60 line-through">
                              ৳{v.fare.low}–{v.fare.high}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {canShowMap && map?.origin && map?.destination && (
            <div className="h-125 w-full shrink-0 overflow-hidden rounded-3xl border border-border lg:h-full lg:flex-1">
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
      </div>
    </main>
  )
}