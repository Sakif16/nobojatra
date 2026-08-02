import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileForm from "./profile-form";

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
        defaultTravelPriority: "time",
        defaultPassengerCount: 1,
      },
    },
    { returnDocument: "after", upsert: true },
  );

  return (
    <ProfileForm
      initialUser={{
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        createdAt: new Date(session.user.createdAt).toISOString(),
      }}
      initialProfile={{
        defaultTravelPriority: profile.defaultTravelPriority,
        defaultPassengerCount: profile.defaultPassengerCount,
      }}
    />
  );
}
