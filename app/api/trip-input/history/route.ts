import { auth } from "@/lib/auth";
import connectMongoDB from "@/lib/mongodb";
import { getTripHistoryPage } from "@/lib/trip-history";
import { getUserCountry } from "@/lib/user-country";
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
  // Deliberately NOT scoped to the user's current country. History is
  // append-only and can span countries — someone who planned trips in Dhaka and
  // then switched to the US still needs the Pathao and CNG options here to
  // filter their older trips. Since the same provider/vehicleType can exist in
  // several markets (UberX is seeded for both US and UK), the list is deduped
  // on the fields the filter actually queries by.
  const vehicles = await VehicleRate.find({ isActive: true })
    .select("country provider vehicleType displayName")
    .sort({ displayName: 1 })
    .lean();

  // When the same provider/vehicleType exists in several markets, prefer the
  // user's own country's name for it. The filter queries on provider and
  // vehicleType alone, so any label would return the right trips — but showing
  // a BD user "Uber Black" for the rides their history calls "Uber Premier"
  // makes the dropdown look like it belongs to someone else's account.
  const country = await getUserCountry(session.user.id);

  const byKey = new Map<string, (typeof vehicles)[number]>();
  for (const v of vehicles) {
    const key = `${v.provider}:${v.vehicleType}`;
    const existing = byKey.get(key);

    if (!existing || (v.country === country && existing.country !== country)) {
      byKey.set(key, v);
    }
  }

  const uniqueVehicles = [...byKey.values()]
    .map((v) => ({
      provider: v.provider,
      vehicleType: v.vehicleType,
      displayName: v.displayName,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({
    success: true,
    trips: page.trips,
    summary: page.summary,
    vehicles: uniqueVehicles,
  });
}