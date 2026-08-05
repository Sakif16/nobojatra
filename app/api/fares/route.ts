import { NextRequest, NextResponse } from 'next/server'
import connectMongoDB from '@/lib/mongodb'
import VehicleRate from '@/models/VehicleRate'

const PATHAO_API = process.env.PATHAO_FARE_API!
const BAND = 0.10 // ±10%

function applyBand(mid: number) {
  const low  = Math.round(mid * (1 - BAND))
  const high = Math.round(mid * (1 + BAND))
  return { low, mid: Math.round(mid), high }
}

async function getPathaоEstimate(vehicle: 'bike' | 'car' | 'cng', distanceKm: number, durationMin: number) {
  const url = `${PATHAO_API}/estimate?vehicle=${vehicle}&city=dhaka&distance_km=${distanceKm}&duration_min=${durationMin}`
  const res  = await fetch(url, { next: { revalidate: 0 } })
  const data = await res.json()
  return data.estimatedFare as number
}

export async function POST(req: NextRequest) {
  const { distanceKm, durationMin, passengers } = await req.json()

  if (!distanceKm || !durationMin || !passengers) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await connectMongoDB()

  // Fetch all active rates from DB
  const rates = await VehicleRate.find({ isActive: true })

  const results = []

  for (const rate of rates) {
    // Filter by passenger capacity
    const eligible = passengers <= rate.maxPassengers

    let fareEstimate

    // Use Pathao API for Pathao vehicles, hardcoded formula for others
    if (rate.provider === 'pathao') {
      const vehicle = rate.vehicleType === 'bike' ? 'bike' : 'car'
      const mid = await getPathaоEstimate(vehicle, distanceKm, durationMin)
      fareEstimate = applyBand(mid)
    } else {
      // Formula: base + (km × perKm) + (min × perMin)
      const mid = rate.baseFare + (distanceKm * rate.perKmRate) + (durationMin * rate.perMinRate)
      const clamped = Math.max(mid, rate.minimumFare)
      fareEstimate = applyBand(clamped)
    }

    results.push({
      provider:     rate.provider,
      vehicleType:  rate.vehicleType,
      displayName:  rate.displayName,
      maxPassengers: rate.maxPassengers,
      comfortScore: rate.comfortScore,
      eligible,
      fare: fareEstimate,
    })
  }

  // Sort: eligible first, then by low fare
  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    return a.fare.low - b.fare.low
  })

  return NextResponse.json({ results, distanceKm, durationMin, passengers })
}