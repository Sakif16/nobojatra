'use client'

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  Cloud,
  CloudOff,
  CloudRain,
  History,
  MapPin,
  TrafficCone,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatFare, type CountryCode } from '@/lib/country-config'

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
}

interface SummaryWeather {
  source: 'route_midpoint' | 'dhaka_fallback'
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

const timeFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const tripTitleFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

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
  if (viewMode === 'confirmed') return 'Trip confirmed'

  const dateValue = trip.estimatedDepartureAt ?? trip.selectedAt ?? trip.createdAt
  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return 'Your trip'

  return `Your trip on ${tripTitleFormatter.format(date)}`
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
        setError('Could not load this trip. It may not exist or may not be confirmed yet.')
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

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">{trip.originLabel}</span>
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="truncate">{trip.destinationLabel}</span>
          </p>
        </div>

        {!trip.vehicle ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No vehicle confirmed yet</p>
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
                <div className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                  {formatFare(trip.vehicle.fareLow, trip.vehicle.fareHigh, trip.country)}
                </div>
              </div>
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
                  {trip.estimatedDepartureAt ? timeFormatter.format(new Date(trip.estimatedDepartureAt)) : '—'}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" aria-hidden />
                  Est. arrival
                </p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {trip.estimatedArrivalAt ? timeFormatter.format(new Date(trip.estimatedArrivalAt)) : '—'}
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
                Conditions when you booked
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                A snapshot from the moment you confirmed — not a live reading.
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
                      <p className="font-medium">Traffic unavailable</p>
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

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <MapPin className="size-4" />
                Plan another trip
              </Link>
              <Link
                href="/trip-history"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <History className="size-4" />
                View trip history
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
