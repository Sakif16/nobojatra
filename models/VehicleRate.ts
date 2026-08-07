// models/VehicleRate.ts
import mongoose, { Schema, Document } from 'mongoose'

export const VEHICLE_PROVIDERS = ['uber', 'pathao', 'cng'] as const
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

VehicleRateSchema.index({ provider: 1, vehicleType: 1 }, { unique: true })

export default mongoose.models.VehicleRate || mongoose.model<IVehicleRate>('VehicleRate', VehicleRateSchema)
