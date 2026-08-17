import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SavedTripsManager from "@/components/saved-trips/SavedTripsManager";
import type { VehicleOption } from "@/components/saved-trips/types";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import VehicleRate from "@/models/VehicleRate";

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

type VehicleRateDoc = {
  _id: unknown;
  displayName: string;
  maxPassengers: number;
};

/**
 * Saved trips and their alert conditions.
 *
 * Saved places and vehicle rates are read here rather than fetched by the
 * client, matching how the dashboard hands MapDashboardSection its props —
 * it saves two round trips and keeps the rate table off the public API.
 */
export default async function SavedTripsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/signin");
  }

  await dbConnect();

  const [profile, rates] = await Promise.all([
    UserProfile.findOne({ userId: session.user.id }).lean(),
    VehicleRate.find({ isActive: true })
      .select("displayName maxPassengers")
      .sort({ displayName: 1 })
      .lean(),
  ]);

  const savedPlaces: SavedPlaceDoc[] = Array.isArray(profile?.savedPlaces)
    ? profile.savedPlaces.map((sp: SavedPlaceDoc) => ({
        label: sp.label,
        place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
      }))
    : [];

  const vehicles: VehicleOption[] = (rates as VehicleRateDoc[]).map((rate) => ({
    id: String(rate._id),
    displayName: rate.displayName,
    maxPassengers: rate.maxPassengers,
  }));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <SavedTripsManager savedPlaces={savedPlaces} vehicles={vehicles} />
    </main>
  );
}
