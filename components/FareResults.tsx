'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface FareOption {
  provider: string
  vehicleType: string
  displayName: string
  maxPassengers: number
  comfortScore: number
  eligible: boolean
  fare: { low: number; mid: number; high: number }
}

const ICONS: Record<string, string> = {
  'uber-go': '🚗', 'uber-moto': '🛵', 'uber-premier': '🚙',
  'pathao-bike': '🏍️', 'pathao-car': '🚕', 'cng-auto': '🛺',
}
const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

export default function FareResults({ distanceKm, durationMin, passengers, from, to }: {
  distanceKm: number; durationMin: number; passengers: number; from: string; to: string
}) {
  const [results, setResults] = useState<FareOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    fetch('/api/fares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distanceKm, durationMin, passengers }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Fare service returned an error')
        return r.json()
      })
      .then((d) => {
        if (!active) return
        setResults(Array.isArray(d?.results) ? d.results : [])
        setError(null)
        setLoading(false)
      })
      // Without this the screen sat on "Calculating fares…" forever whenever
      // /api/fares failed.
      .catch(() => {
        if (!active) return
        setError('Could not load fare estimates. Please try again.')
        setResults([])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [distanceKm, durationMin, passengers])

  const eligible = results.filter(r => r.eligible)
  const ineligible = results.filter(r => !r.eligible)

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Available Services
            </h1>
            {from && to && (
              <p className="mt-2 text-sm text-muted-foreground">{from} → {to}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {distanceKm} km · {durationMin} min · {passengers} passenger{passengers > 1 ? 's' : ''}
            </p>
          </div>

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
              {/* Eligible vehicles */}
              {eligible.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {eligible.map(v => {
                    const key = `${v.provider}-${v.vehicleType}`
                    const isSelected = selected === key
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelected(isSelected ? null : key)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-muted'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
                            {ICONS[key] ?? '🚘'}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-foreground">{v.displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              {STARS(v.comfortScore)} · up to {v.maxPassengers}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-foreground">
                            ৳{v.fare.low}–{v.fare.high}
                          </div>
                          <div className="text-xs text-muted-foreground">Estimated</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Nothing fits {passengers} passengers
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try again with a smaller group.
                  </p>
                </div>
              )}

              {/* Ineligible vehicles */}
              {ineligible.length > 0 && (
                <div className="mt-8">
                  <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Not available for {passengers} passengers
                  </p>
                  <div className="flex flex-col gap-3 opacity-50">
                    {ineligible.map(v => {
                      const key = `${v.provider}-${v.vehicleType}`
                      return (
                        <div
                          key={key}
                          aria-disabled
                          className="flex cursor-not-allowed items-center justify-between rounded-2xl border border-border bg-card px-5 py-4"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
                              {ICONS[key] ?? '🚘'}
                            </span>
                            <div>
                              <div className="text-sm font-medium text-foreground">{v.displayName}</div>
                              <div className="text-xs text-muted-foreground">
                                Max {v.maxPassengers} passenger
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-foreground">
                              ৳{v.fare.low}–{v.fare.high}
                            </div>
                            <div className="text-xs text-destructive">Passenger limit</div>
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
      </div>
    </main>
  )
}
