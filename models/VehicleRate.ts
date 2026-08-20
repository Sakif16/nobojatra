// models/VehicleRate.ts
import mongoose, { Schema, Document } from 'mongoose'
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY, type CountryCode } from '@/lib/country-config'

// Not every provider operates in every country — the country field below is
// what scopes them. Pathao and CNG are Bangladesh-only, Lyft is US-only and
// Bolt is UK-only here; Uber is the one provider seeded in all three.
export const VEHICLE_PROVIDERS = ['uber', 'pathao', 'cng', 'lyft', 'bolt'] as const

// Deliberately unchanged. The US and UK fleets reuse the existing classes —
// `go` for the standard car, `xl` for the large one, `premier` for the premium
// tier — because these names already describe a tier rather than a brand, and
// because lib/fare-providers keys its weather multipliers off them.
export const VEHICLE_TYPES = [
  'go',
  'moto',
  'premier',
  'bike',
  'car',
  'auto',
  'xl',
] as const

export type VehicleProvider = (typeof VEHICLE_PROVIDERS)[number]
export type VehicleType = (typeof VEHICLE_TYPES)[number]

export interface IVehicleRate extends Document {
  country: CountryCode
  provider: VehicleProvider
  vehicleType: VehicleType
  displayName: string
  baseFare: number
  perKmRate: number
  perMinRate: number
  minimumFare: number
  maxPassengers: number
  comfortScore: number // 1–5

  speedFactor: number
  isActive: boolean
}

const VehicleRateSchema = new Schema<IVehicleRate>({
  country:      { type: String, enum: COUNTRY_OPTIONS, default: DEFAULT_COUNTRY, required: true },
  provider:     { type: String, enum: VEHICLE_PROVIDERS, required: true },
  vehicleType:  { type: String, enum: VEHICLE_TYPES, required: true },
  displayName:  { type: String, required: true },
  baseFare:     { type: Number, required: true },
  perKmRate:    { type: Number, required: true },
  perMinRate:   { type: Number, required: true },
  minimumFare:  { type: Number, required: true },
  maxPassengers:{ type: Number, required: true },
  comfortScore: { type: Number, min: 1, max: 5, required: true },
  speedFactor:  { type: Number, min: 0.5, max: 2, default: 1 },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true })

// Country leads the key because the same provider/vehicleType pair exists in
// several markets with entirely different economics — an Uber Go is ~110 BDT in
// Dhaka and ~$14 in New York. Replacing the old { provider, vehicleType }
// unique index requires dropping it by hand before reseeding; a stale
// provider_1_vehicleType_1 will reject the second country's rows.
VehicleRateSchema.index({ country: 1, provider: 1, vehicleType: 1 }, { unique: true })

export default mongoose.models.VehicleRate || mongoose.model<IVehicleRate>('VehicleRate', VehicleRateSchema)
