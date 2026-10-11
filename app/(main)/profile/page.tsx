import type { Metadata } from "next";
import { DEFAULT_COUNTRY, resolveCountry } from "@/lib/country-config";
import { getRequestProfile, getRequestSession } from "@/lib/request-context";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

export default async function ProfilePage() {
  const session = await getRequestSession();

  if (!session) {
    redirect("/signin");
  }

  const profile = await getRequestProfile(session.user.id);

  const savedPlaces: SavedPlaceDoc[] = Array.isArray(profile?.savedPlaces)
    ? profile.savedPlaces.map((sp: SavedPlaceDoc) => ({
        label: sp.label,
        place: { label: sp.place.label, lat: sp.place.lat, lng: sp.place.lng },
      }))
    : [];

  return (
    <ProfileForm
      initialUser={{
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        createdAt: new Date(session.user.createdAt).toISOString(),
      }}
      initialProfile={{
        country: resolveCountry(profile?.country ?? DEFAULT_COUNTRY),
        defaultTravelPriority: profile?.defaultTravelPriority ?? "time",
        defaultPassengerCount: profile?.defaultPassengerCount ?? 1,
        savedPlaces,
      }}
    />
  );
}