import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SavedTripsManager from "@/components/saved-trips/SavedTripsManager";
import type { VehicleOption } from "@/components/saved-trips/types";
import { auth } from "@/lib/auth";
import { resolveCountry } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import { filterPlacesInServiceArea } from "@/lib/trip-input";
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

  const profile = await UserProfile.findOne({ userId: session.user.id }).lean();

  // Sequenced rather than parallel with the profile read because the vehicle
  // list has to be scoped to the country the profile names — a UK user picking
  // a preferred vehicle should be offered Uber and Bolt, not CNG.
  const country = resolveCountry((profile as { country?: unknown } | null)?.country);

  const rates = await VehicleRate.find({ country, isActive: true })
    .select("displayName maxPassengers")
    .sort({ displayName: 1 })
    .lean();

  // Scoped to the active country: a Dhaka shortcut offered to someone planning
  // in London only leads to a validation error.
  const savedPlaces: SavedPlaceDoc[] = filterPlacesInServiceArea(
    Array.isArray(profile?.savedPlaces)
      ? profile.savedPlaces.map((sp: SavedPlaceDoc) => ({
          label: sp.label,
          place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
        }))
      : [],
    country,
  );

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
