'use client'

import { ArrowRight, CalendarClock, ChevronDown, MapPin, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { COUNTRY_CONFIG, formatAmount, formatFare, type CountryCode } from '@/lib/country-config'
import type { RecentTrip, TripHistoryActivityData } from '@/lib/trip-history'
import BackLink from "@/components/BackLink";

interface HistoryVehicleOption {
  provider: string
  vehicleType: string
  displayName: string
}

interface HistoryTrip {
  id: string
  country: CountryCode
  originLabel: string
  destinationLabel: string
  vehicleProvider: string | null
  vehicleType: string | null
  vehicleDisplayName: string | null
  fareLow: number | null
  fareHigh: number | null
  fareMid: number | null
  distanceKm: number | null
  durationMin: number | null
  selectedAt: string | null
  createdAt: string
}

interface HistorySummary {
  tripCount: number
  totalCost: number
  averageCost: number
  mostUsedVehicle: string | null
  // History can span countries. The cost figures cover only the trips planned
  // in `costCountry`, and `costTripCount` says how many of the listed trips
  // that is — see getTripHistoryPage in lib/trip-history.
  costCountry: CountryCode
  costTripCount: number
}

type Props = {
  activityData: TripHistoryActivityData
}

const CONFIRMED_VIEW = 'confirmed-trips'
const LAST_SEVEN_DAYS_VIEW = 'last-7-days'

const ICONS: Record<string, string> = {
  'uber-go': '🚗',
  'uber-moto': '🛵',
  'uber-premier': '🚙',
  'pathao-bike': '🏍️',
  'pathao-car': '🚕',
  'cng-auto': '🛺',
  'uber-xl': '🚐',
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function formatActivityMetrics(trip: RecentTrip) {
  const parts: string[] = []

  if (trip.distanceKm !== null) parts.push(`${trip.distanceKm} km`)
  if (trip.durationMin !== null) parts.push(`${trip.durationMin} min`)
  if (trip.stopCount > 0) {
    parts.push(`${trip.stopCount} stop${trip.stopCount === 1 ? '' : 's'}`)
  }
  parts.push(`${trip.passengerCount} passenger${trip.passengerCount === 1 ? '' : 's'}`)

  return parts.join(' · ')
}

function ActivityRows({ trips }: { trips: RecentTrip[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {trips.map((trip) => (
        <li
          key={trip.id}
          className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
        >
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            {trip.departureMode === 'scheduled' ? (
              <CalendarClock className="size-4" />
            ) : (
              <MapPin className="size-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="truncate">{trip.originLabel}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{trip.destinationLabel}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatActivityMetrics(trip)}
            </p>
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {dateFormatter.format(new Date(trip.scheduledAt ?? trip.createdAt))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function TripHistoryList({ activityData }: Props) {
  const [trips, setTrips] = useState<HistoryTrip[]>([])
  const [summary, setSummary] = useState<HistorySummary | null>(null)
  const [vehicles, setVehicles] = useState<HistoryVehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [vehicleKey, setVehicleKey] = useState('')
  const [historyView, setHistoryView] = useState(CONFIRMED_VIEW)

  const hasFilters = Boolean(from || to || vehicleKey)
  const showingConfirmedTrips = historyView === CONFIRMED_VIEW

  useEffect(() => {
    let active = true

    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (vehicleKey) {
      const [provider, vehicleType] = vehicleKey.split('::')
      if (provider) params.set('provider', provider)
      if (vehicleType) params.set('vehicleType', vehicleType)
    }

    Promise.resolve()
      .then(() => {
        if (active) setLoading(true)
      })
      .then(() => fetch(`/api/trip-input/history?${params.toString()}`))
      .then(async (r) => {
        if (!r.ok) throw new Error('History lookup failed')
        return r.json()
      })
      .then((d) => {
        if (!active) return
        if (!d?.success) throw new Error(d?.message ?? 'History lookup failed')
        setTrips(Array.isArray(d.trips) ? d.trips : [])
        setSummary(d.summary ?? null)
        setVehicles(Array.isArray(d.vehicles) ? d.vehicles : [])
        setError(null)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load trip history. Please try again.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [from, to, vehicleKey])

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((v) => ({
        key: `${v.provider}::${v.vehicleType}`,
        label: v.displayName,
      })),
    [vehicles],
  )

  const selectedMonth = useMemo(
    () => activityData.monthlyGroups.find((group) => group.monthKey === historyView) ?? null,
    [activityData.monthlyGroups, historyView],
  )

  const selectedActivityTrips =
    historyView === LAST_SEVEN_DAYS_VIEW
      ? activityData.lastSevenDays
      : selectedMonth?.trips ?? []
  const selectedActivityLabel =
    historyView === LAST_SEVEN_DAYS_VIEW
      ? 'Last 7 days'
      : selectedMonth?.monthLabel ?? 'Route searches'
  const selectedActivityEmpty =
    historyView === LAST_SEVEN_DAYS_VIEW
      ? 'No route searches in the last 7 days.'
      : 'No route searches found for this month.'

  function clearFilters() {
    setFrom('')
    setTo('')
    setVehicleKey('')
  }

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <BackLink href="/" label="Back to planner" className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Trip History
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confirmed rides and route searches in one place.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <label className="relative inline-flex items-center">
            <span className="sr-only">Trip history view</span>
            <select
              value={historyView}
              onChange={(e) => setHistoryView(e.target.value)}
              className="h-10 appearance-none rounded-lg border border-border bg-card py-2 pr-9 pl-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted focus:border-primary"
            >
              <option value={CONFIRMED_VIEW}>Confirmed trips</option>
              <option value={LAST_SEVEN_DAYS_VIEW}>Last 7 days searches</option>
              {activityData.monthlyGroups.map((group) => (
                <option key={group.monthKey} value={group.monthKey}>
                  {group.monthLabel}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
          </label>

          {!showingConfirmedTrips && (
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {selectedActivityTrips.length} trip{selectedActivityTrips.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {!showingConfirmedTrips ? (
          <>
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              {selectedActivityLabel}
            </h2>
            {selectedActivityTrips.length > 0 ? (
              <ActivityRows trips={selectedActivityTrips} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">{selectedActivityEmpty}</p>
              </div>
            )}
          </>
        ) : (
          <>
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground scheme-dark [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground scheme-dark [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Vehicle
            <select
              value={vehicleKey}
              onChange={(e) => setVehicleKey(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
            >
              <option value="">All vehicles</option>
              {vehicleOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear filters
            </button>
          )}
        </div>

        {/* Summary header */}
        {summary && summary.tripCount > 0 && (
          <div className="mb-6 rounded-2xl border border-border bg-card px-4 py-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Total cost</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {formatAmount(summary.totalCost, summary.costCountry)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Most-used vehicle</p>
              <p className="mt-0.5 truncate text-lg font-bold text-foreground">
                {summary.mostUsedVehicle ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average cost</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {formatAmount(summary.averageCost, summary.costCountry)}
              </p>
            </div>
          </div>
          {/* Only shown once history actually spans more than one country, so
              the common single-country case stays uncluttered. */}
          {summary.costTripCount < summary.tripCount && (
            <p className="mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground">
              Costs cover the {summary.costTripCount} of {summary.tripCount} trips planned in{' '}
              {COUNTRY_CONFIG[summary.costCountry].label}. Trips from other countries are listed
              but not totalled, since their fares are in a different currency.
            </p>
          )}
          </div>
        )}

        {loading ? (
          <p className="rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Loading trip history…
          </p>
        ) : error ? (
          <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No confirmed trips</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? 'No trips match these filters.'
                : 'Confirm a ride from the fare results page and it will show up here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {trips.map((trip) => {
              const key =
                trip.vehicleProvider && trip.vehicleType
                  ? `${trip.vehicleProvider}-${trip.vehicleType}`
                  : ''
              return (
                <li key={trip.id}>
                  <Link
                    href={`/trip-summary?tripHistoryId=${trip.id}&source=history`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-base">
                      {ICONS[key] ?? '🚘'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="truncate">{trip.originLabel}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{trip.destinationLabel}</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3" aria-hidden />
                        {dateFormatter.format(new Date(trip.selectedAt ?? trip.createdAt))}
                        {trip.vehicleDisplayName && <span>· {trip.vehicleDisplayName}</span>}
                        {trip.distanceKm != null && <span>· {trip.distanceKm} km</span>}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {trip.fareLow != null && trip.fareHigh != null
                        ? formatFare(trip.fareLow, trip.fareHigh, trip.country)
                        : '—'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
          </>
        )}
      </div>
    </main>
  )
}
