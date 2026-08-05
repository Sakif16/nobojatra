'use client'
import { useEffect, useState } from 'react'

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
  const [results, setResults]   = useState<FareOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distanceKm, durationMin, passengers }),
    })
      .then(r => r.json())
      .then(d => { setResults(d.results); setLoading(false) })
  }, [distanceKm, durationMin, passengers])

  const eligible   = results.filter(r => r.eligible)
  const ineligible = results.filter(r => !r.eligible)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Available Services</h1>
        {from && to && <p className="text-sm text-gray-500 mt-1">{from} → {to}</p>}
        <p className="text-sm text-gray-500">{distanceKm} km · {durationMin} min · {passengers} passenger{passengers > 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <p className="text-gray-400">Calculating fares...</p>
      ) : (
        <>
          {/* Eligible vehicles */}
          <div className="flex flex-col gap-3">
            {eligible.map(v => {
              const key = `${v.provider}-${v.vehicleType}`
              const isSelected = selected === key
              return (
                <div
                  key={key}
                  onClick={() => setSelected(isSelected ? null : key)}
                  className={`flex items-center justify-between rounded-xl px-5 py-4 cursor-pointer border transition-all
                    ${isSelected ? 'border-violet-500 bg-violet-950/30' : 'border-transparent bg-zinc-900 hover:bg-zinc-800'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{ICONS[key] ?? '🚘'}</span>
                    <div>
                      <div className="font-semibold">{v.displayName}</div>
                      <div className="text-xs text-gray-400">{STARS(v.comfortScore)} · up to {v.maxPassengers}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">৳{v.fare.low}–{v.fare.high}</div>
                    <div className="text-xs text-gray-400">Estimated</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Ineligible vehicles */}
          {ineligible.length > 0 && (
            <div className="mt-8">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Not available for {passengers} passengers</p>
              <div className="flex flex-col gap-3 opacity-40">
                {ineligible.map(v => {
                  const key = `${v.provider}-${v.vehicleType}`
                  return (
                    <div key={key} className="flex items-center justify-between rounded-xl px-5 py-4 bg-zinc-900 cursor-not-allowed">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{ICONS[key] ?? '🚘'}</span>
                        <div>
                          <div className="font-semibold">{v.displayName}</div>
                          <div className="text-xs text-gray-400">Max {v.maxPassengers} passenger</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">৳{v.fare.low}–{v.fare.high}</div>
                        <div className="text-xs text-red-400">Passenger limit</div>
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
  )
}