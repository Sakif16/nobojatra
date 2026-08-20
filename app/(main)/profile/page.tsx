import { auth } from "@/lib/auth";
import { DEFAULT_COUNTRY, resolveCountry } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";

type SavedPlaceDoc = {
  label: string;
  place: { label: string; lat: number; lng: number };
};

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/signin");
  }

  await dbConnect();

  const profile = await UserProfile.findOneAndUpdate(
    { userId: session.user.id },
    {
      $setOnInsert: {
        userId: session.user.id,
        country: DEFAULT_COUNTRY,
        defaultTravelPriority: "time",
        defaultPassengerCount: 1,
      },
    },
    { returnDocument: "after", upsert: true },
  );

  const savedPlaces: SavedPlaceDoc[] = Array.isArray(profile.savedPlaces)
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
        country: resolveCountry(profile.country),
        defaultTravelPriority: profile.defaultTravelPriority,
        defaultPassengerCount: profile.defaultPassengerCount,
        savedPlaces,
      }}
    />
  );
}