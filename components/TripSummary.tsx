'use client'

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  Cloud,
  CloudOff,
  CloudRain,
  Copy,
  History,
  MapPin,
  TrafficCone,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  formatFare,
  hasLiveTraffic,
  liveTrafficUnavailableMessage,
  type CountryCode,
} from '@/lib/country-config'
import { buttonVariants } from '@/components/ui/button'
import { getFareSourceLabel } from '@/lib/fare-source'
import { buildPlanSummary } from '@/lib/plan-summary'
import { formatTripDateTime } from '@/lib/trip-time'
import { getWeatherReadingLabel } from '@/lib/weather-reading'
import BackLink from "@/components/BackLink";

type WeatherBand = 'low' | 'moderate' | 'severe'
type CongestionLevel = 'low' | 'moderate' | 'high' | 'severe'

interface SummaryVehicle {
  provider: string
  vehicleType: string
  displayName: string
  maxPassengers: number
  fareLow: number
  fareHigh: number
  currency: string
  fareSource?: 'pathao_api' | 'rate_card' | null
  fareSourceNote?: string | null
}

interface SummaryWeather {
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

interface SummaryTraffic {
  congestionIndexPercent: number
  congestionLevel: CongestionLevel
  isPeakHour: boolean
  durationInTrafficMin: number
  baselineDurationMin: number
}

interface SummaryItineraryLeg {
  fromLabel: string
  toLabel: string
  distanceKm: number
  durationMin: number
  dwellAfterMin: number
}

interface TripSummaryDetail {
  id: string
  country: CountryCode
  originLabel: string
  destinationLabel: string
  stopCount: number
  passengerCount: number
  distanceKm: number | null
  durationMin: number | null
  vehicle: SummaryVehicle | null
  departureMode: 'now' | 'scheduled'
  timeZone: string
  estimatedDepartureAt: string | null
  estimatedArrivalAt: string | null
  weather: SummaryWeather | null
  weatherUnavailable: boolean
  traffic: SummaryTraffic | null
  trafficUnavailable: boolean
  itinerary: {
    travelDurationMin: number
    dwellDurationMin: number
    legs: SummaryItineraryLeg[]
  } | null
  selectedAt: string | null
  createdAt: string
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

function formatMinutes(min: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const hours = Math.floor(min / 60)
  const mins = Math.round(min % 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function weatherTone(band: WeatherBand | undefined) {
  if (band === 'severe') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (band === 'moderate') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-card text-muted-foreground'
}

function congestionTone(level: CongestionLevel | undefined) {
  if (level === 'severe' || level === 'high') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (level === 'moderate') return 'border-primary/30 bg-primary/10 text-primary'
  return 'border-border bg-card text-muted-foreground'
}

function getTripTitle(trip: TripSummaryDetail, viewMode: 'confirmed' | 'history') {
  if (viewMode === 'confirmed') return 'Plan saved'

  const dateValue = trip.estimatedDepartureAt ?? trip.selectedAt ?? trip.createdAt
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return 'Your trip'

  return `Your trip on ${formatTripDateTime(date, trip.timeZone)}`
}

export default function TripSummary({
  tripHistoryId,
  viewMode,
}: {
  tripHistoryId: string
  viewMode: 'confirmed' | 'history'
}) {
  const [trip, setTrip] = useState<TripSummaryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetch(`/api/trip-input/history/${tripHistoryId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Trip lookup failed')
        return r.json()
      })
      .then((d) => {
        if (!active) return
        if (!d?.success) throw new Error(d?.message ?? 'Trip lookup failed')
        setTrip(d.trip)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load this trip. It may not exist or may not have a saved plan yet.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [tripHistoryId])

  if (loading) {
    return (
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Loading trip summary…
          </p>
        </div>
      </main>
    )
  }

  if (error || !trip) {
    return (
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
          <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? 'Trip not found.'}
          </p>
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            ← Back home
          </Link>
        </div>
      </main>
    )
  }

  const vehicleKey = trip.vehicle ? `${trip.vehicle.provider}-${trip.vehicle.vehicleType}` : ''
  const title = getTripTitle(trip, viewMode)

  async function copyPlan() {
    if (!trip) return

    const text = buildPlanSummary({
      originLabel: trip.originLabel,
      destinationLabel: trip.destinationLabel,
      stopCount: trip.stopCount,
      passengerCount: trip.passengerCount,
      distanceKm: trip.distanceKm,
      durationMin: trip.durationMin,
      vehicleName: trip.vehicle?.displayName ?? null,
      fare: trip.vehicle
        ? formatFare(trip.vehicle.fareLow, trip.vehicle.fareHigh, trip.country)
        : null,
      departure:
        trip.departureMode === 'scheduled' && trip.estimatedDepartureAt
          ? formatTripDateTime(trip.estimatedDepartureAt, trip.timeZone)
          : null,
    })

    // The clipboard is refused in some browsers and on plain http, so the
    // failure is said rather than left looking like success.
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Plan copied. Paste it into a message to share it.')
    } catch {
      setCopyStatus('Could not copy the plan from this browser.')
    }
  }

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <BackLink href="/" label="Back to planner" className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {/* Stacked on a phone: side by side, two long addresses truncate to
              a few characters each and name neither place. */}
          <p className="mt-2 flex min-w-0 flex-col text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate">{trip.originLabel}</span>
            <ArrowRight className="my-0.5 size-3 shrink-0 rotate-90 sm:my-0 sm:size-3.5 sm:rotate-0" />
            <span className="truncate">{trip.destinationLabel}</span>
          </p>
          {trip.vehicle && (
            <p className="mt-2 text-xs text-muted-foreground">
              A saved plan is not a booking. No ride provider has been contacted.
            </p>
          )}
        </div>

        {!trip.vehicle ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No vehicle chosen yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Go back to the fare results and pick a ride to see a summary here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Chosen vehicle + cost */}
            <div className="rounded-2xl border border-border bg-card px-4 py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
                  {ICONS[vehicleKey] ?? '🚘'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {trip.vehicle.displayName}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3" aria-hidden />
                    Up to {trip.vehicle.maxPassengers} · {trip.passengerCount} passenger
                    {trip.passengerCount > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {formatFare(trip.vehicle.fareLow, trip.vehicle.fareHigh, trip.country)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {getFareSourceLabel(trip.vehicle.fareSource) ?? 'Estimated'}
                  </div>
                </div>
              </div>
              {trip.vehicle.fareSourceNote && (
                <p className="mt-3 text-xs text-muted-foreground">{trip.vehicle.fareSourceNote}</p>
              )}
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total time</p>
                <p className="mt-0.5 font-semibold text-foreground">{formatMinutes(trip.durationMin)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {trip.distanceKm != null ? `${trip.distanceKm} km` : '—'}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" aria-hidden />
                  Est. departure
                </p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {trip.estimatedDepartureAt ? formatTripDateTime(trip.estimatedDepartureAt, trip.timeZone, { year: false }) : '—'}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" aria-hidden />
                  Est. arrival
                </p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {trip.estimatedArrivalAt ? formatTripDateTime(trip.estimatedArrivalAt, trip.timeZone, { year: false }) : '—'}
                </p>
              </div>
            </div>

            {trip.itinerary && (
              <div className="rounded-2xl border border-border bg-card px-4 py-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <MapPin className="size-3.5" aria-hidden />
                  Itinerary
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  {formatMinutes(trip.itinerary.travelDurationMin)} travel
                  {trip.itinerary.dwellDurationMin > 0
                    ? ` · ${formatMinutes(trip.itinerary.dwellDurationMin)} wait`
                    : ''}
                </p>
                <div className="mt-3 space-y-2">
                  {trip.itinerary.legs.map((leg, index) => (
                    <div
                      key={`${leg.fromLabel}-${leg.toLabel}-${index}`}
                      className="rounded-xl border border-border bg-background/40 px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-medium text-foreground">
                          {leg.fromLabel} → {leg.toLabel}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {leg.distanceKm} km
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatMinutes(leg.durationMin)}
                        {leg.dwellAfterMin > 0
                          ? ` · ${formatMinutes(leg.dwellAfterMin)} wait`
                          : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weather/traffic snapshot — explicitly a point-in-time reading */}
            <div className="rounded-2xl border border-border bg-card px-4 py-4">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <Camera className="size-3.5" aria-hidden />
                Conditions when you saved this plan
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                {trip.weather?.kind === 'forecast'
                  ? 'The forecast and traffic as they stood when you saved. The forecast can change before you leave.'
                  : 'A snapshot from the moment you saved — not a live reading, and not a forecast.'}
              </p>

              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <div
                  className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${weatherTone(trip.weather?.severityBand)}`}
                >
                  {trip.weatherUnavailable ? (
                    <CloudOff className="size-4 shrink-0" />
                  ) : trip.weather?.severityBand === 'severe' ? (
                    <AlertTriangle className="size-4 shrink-0" />
                  ) : trip.weather?.severityBand === 'moderate' ? (
                    <CloudRain className="size-4 shrink-0" />
                  ) : (
                    <Cloud className="size-4 shrink-0" />
                  )}
                  <div className="min-w-0">
                    {trip.weatherUnavailable || !trip.weather ? (
                      <p className="font-medium">Weather unavailable</p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {trip.weather.temperatureCelsius}°C · {trip.weather.precipitationMmPerHour} mm/h rain
                        </p>
                        <p className="text-xs opacity-75">
                          {getWeatherReadingLabel(trip.weather, trip.timeZone)}
                        </p>
                        <p className="text-xs opacity-75">
                          Wind {trip.weather.windKmh} km/h · {trip.weather.severityBand} impact
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${congestionTone(trip.traffic?.congestionLevel)}`}
                >
                  <TrafficCone className="size-4 shrink-0" />
                  <div className="min-w-0">
                    {trip.trafficUnavailable || !trip.traffic ? (
                      <p className="font-medium">
                        {hasLiveTraffic(trip.country)
                          ? 'Traffic unavailable'
                          : liveTrafficUnavailableMessage(trip.country)}
                      </p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {trip.traffic.congestionLevel.toUpperCase()} traffic ·{' '}
                          {trip.traffic.congestionIndexPercent >= 0 ? '+' : ''}
                          {trip.traffic.congestionIndexPercent}%
                        </p>
                        <p className="text-xs opacity-75">
                          {trip.traffic.durationInTrafficMin} min with traffic
                          {trip.traffic.isPeakHour ? ' · peak hour' : ''}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className={buttonVariants({ variant: 'outline', size: 'md' })}>
                <MapPin className="size-4" />
                Plan another trip
              </Link>
              <Link href="/trip-history" className={buttonVariants({ size: 'md' })}>
                <History className="size-4" />
                View trip history
              </Link>
              {/* Puts the plan on the clipboard as a few lines of text, to
                  paste into a message. Nothing is sent anywhere. */}
              <button
                type="button"
                onClick={() => void copyPlan()}
                className={buttonVariants({ variant: 'outline', size: 'md' })}
              >
                <Copy className="size-4" />
                Copy plan
              </button>
            </div>
            {copyStatus && (
              <p role="status" className="text-xs text-muted-foreground">
                {copyStatus}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
