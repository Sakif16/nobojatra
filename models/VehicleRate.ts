// models/VehicleRate.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface IVehicleRate extends Document {
  provider: 'uber' | 'pathao' | 'cng'
  vehicleType: 'go' | 'moto' | 'premier' | 'bike' | 'car' | 'auto'
  displayName: string
  baseFare: number
  perKmRate: number
  perMinRate: number
  minimumFare: number
  maxPassengers: number
  comfortScore: number // 1–5
  isActive: boolean
}

const VehicleRateSchema = new Schema<IVehicleRate>({
  provider:     { type: String, enum: ['uber', 'pathao', 'cng'], required: true },
  vehicleType:  { type: String, enum: ['go', 'moto', 'premier', 'bike', 'car', 'auto'], required: true },
  displayName:  { type: String, required: true },
  baseFare:     { type: Number, required: true },
  perKmRate:    { type: Number, required: true },
  perMinRate:   { type: Number, required: true },
  minimumFare:  { type: Number, required: true },
  maxPassengers:{ type: Number, required: true },
  comfortScore: { type: Number, min: 1, max: 5, required: true },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.models.VehicleRate || mongoose.model<IVehicleRate>('VehicleRate', VehicleRateSchema)