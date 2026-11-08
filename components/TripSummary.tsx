'use client'

import {
  AlertTriangle,
  Camera,
  Cloud,
  CloudOff,
  CloudRain,
  Copy,
  History,
  MapPin,
  TrafficCone,
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
import PageHeader from '@/components/ui/page-header'
import Panel from '@/components/ui/panel'
import Chip from '@/components/ui/chip'
import ListRow from '@/components/ui/list-row'
import EmptyState from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'

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
          <SkeletonRows label="Loading trip summary…" />
        </div>
      </main>
    )
  }

  if (error || !trip) {
    return (
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
          <div role="alert"><EmptyState title="Trip not found" description={error ?? 'Trip not found.'} action={<Link href="/" className="text-sm font-medium text-primary hover:underline">Back to planner</Link>} /></div>
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
        <div className="mb-6"><PageHeader title={title} back={{ href: '/', label: 'Back to planner' }} subtitle={trip.vehicle ? 'A saved plan is not a booking. No ride provider has been contacted.' : 'Route details from your trip history.'} /></div>
        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="text-sm font-semibold text-foreground">Route</h2>
            <ol className="mt-3 space-y-0">
              <li className="flex gap-3"><span aria-hidden="true" className="flex w-6 shrink-0 justify-center border-l-2 border-border text-primary">●</span><span className="min-w-0 pb-4 text-sm text-foreground">{trip.originLabel}</span></li>
              {trip.itinerary ? trip.itinerary.legs.map((leg, index) => {
                const last = index === trip.itinerary!.legs.length - 1
                return <li key={`${leg.fromLabel}-${leg.toLabel}-${index}`} className="flex gap-3"><span aria-hidden="true" className={`flex w-6 shrink-0 justify-center text-primary ${last ? '' : 'border-l-2 border-border'}`}>{last ? '■' : '●'}</span><span className={`min-w-0 text-sm text-foreground ${last ? '' : 'pb-4'}`}><span className="block">{leg.toLabel}</span><span className="block text-xs text-muted-foreground">{leg.distanceKm} km · {formatMinutes(leg.durationMin)}{leg.dwellAfterMin > 0 ? ` · ${formatMinutes(leg.dwellAfterMin)} wait` : ''}</span></span></li>
              }) : <>
                {trip.stopCount > 0 && <li className="flex gap-3"><span aria-hidden="true" className="flex w-6 shrink-0 justify-center border-l-2 border-border text-primary">●</span><span className="pb-4 text-sm text-muted-foreground">{trip.stopCount} stop{trip.stopCount === 1 ? '' : 's'} · details unavailable</span></li>}
                <li className="flex gap-3"><span aria-hidden="true" className="flex w-6 shrink-0 justify-center text-primary">■</span><span className="text-sm text-foreground">{trip.destinationLabel}</span></li>
              </>}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip label>{trip.distanceKm != null ? `${trip.distanceKm} km` : 'Distance unavailable'}</Chip>
              <Chip label>{formatMinutes(trip.durationMin)}</Chip><Chip label>{trip.passengerCount} passenger{trip.passengerCount === 1 ? '' : 's'}</Chip>
              <Chip label>Est. departure: {trip.estimatedDepartureAt ? formatTripDateTime(trip.estimatedDepartureAt, trip.timeZone, { year: false }) : '—'}</Chip>
              <Chip label>Est. arrival: {trip.estimatedArrivalAt ? formatTripDateTime(trip.estimatedArrivalAt, trip.timeZone, { year: false }) : '—'}</Chip>
            </div>
            {trip.itinerary && <p className="mt-3 text-xs text-muted-foreground">{formatMinutes(trip.itinerary.travelDurationMin)} travel{trip.itinerary.dwellDurationMin > 0 ? ` · ${formatMinutes(trip.itinerary.dwellDurationMin)} wait` : ''}</p>}
            {trip.vehicle ? <>
              <ListRow staticRow className="mt-4 border-border bg-background/40" leading={ICONS[vehicleKey] ?? '🚘'} title={trip.vehicle.displayName}
                meta={`Up to ${trip.vehicle.maxPassengers} · ${trip.passengerCount} passenger${trip.passengerCount === 1 ? '' : 's'}`}
                trailing={<span className="block text-right"><span className="block text-sm font-bold tabular-nums text-foreground">{formatFare(trip.vehicle!.fareLow, trip.vehicle!.fareHigh, trip.country)}</span><span className="block text-xs text-muted-foreground">{getFareSourceLabel(trip.vehicle!.fareSource) ?? 'Estimated'}</span></span>} />
              {trip.vehicle.fareSourceNote && <p className="mt-2 text-xs text-muted-foreground">{trip.vehicle.fareSourceNote}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link href="/" className={buttonVariants({ variant: 'outline', size: 'md' })}><MapPin className="size-4" /> Plan another trip</Link>
                <Link href="/trip-history" className={buttonVariants({ size: 'md' })}><History className="size-4" /> View trip history</Link>
                <button type="button" onClick={() => void copyPlan()} className={buttonVariants({ variant: 'outline', size: 'md' })}><Copy className="size-4" /> Copy plan</button>
              </div>
              {copyStatus && <p role="status" className="mt-2 text-xs text-muted-foreground">{copyStatus}</p>}
            </> : <div className="mt-4"><EmptyState title="No vehicle chosen yet" description="Go back to the fare results and pick a ride to see a summary here." /></div>}
          </Panel>
          {trip.vehicle && <>
            {/* Weather/traffic snapshot — explicitly a point-in-time reading */}
            <Panel>
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
            </Panel>

          </>}
        </div>
      </div>
    </main>
  )
}
