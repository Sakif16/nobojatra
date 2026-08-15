import { auth } from "@/lib/auth";
import connectMongoDB from "@/lib/mongodb";
import { getTripHistoryPage } from "@/lib/trip-history";
import VehicleRate from "@/models/VehicleRate";
import { NextRequest, NextResponse } from "next/server";

// GET /api/trip-input/history?from=&to=&provider=&vehicleType=
// Reverse-chronological trip history, filterable by date range and/or
// vehicle, plus a summary header (total cost, most-used vehicle, average
// cost) computed over the filtered set, and the vehicle list to populate the
// filter dropdown.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")?.trim() || undefined;
  const to = searchParams.get("to")?.trim() || undefined;
  const provider = searchParams.get("provider")?.trim() || undefined;
  const vehicleType = searchParams.get("vehicleType")?.trim() || undefined;

  const page = await getTripHistoryPage(session.user.id, { from, to, provider, vehicleType });

  await connectMongoDB();
  const vehicles = await VehicleRate.find({ isActive: true })
    .select("provider vehicleType displayName")
    .sort({ displayName: 1 })
    .lean();

  return NextResponse.json({
    success: true,
    trips: page.trips,
    summary: page.summary,
    vehicles: vehicles.map((v) => ({
      provider: v.provider,
      vehicleType: v.vehicleType,
      displayName: v.displayName,
    })),
  });
}