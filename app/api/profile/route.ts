import { auth, authDb } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Alert from "@/models/Alert";
import Route from "@/models/Map_route";
import Place from "@/models/Place";
import TrafficData from "@/models/TrafficData";
import TripHistory from "@/models/TripHistory";
import UserProfile, { TRAVEL_PRIORITIES, type TravelPriority } from "@/models/UserProfile";
import { NextRequest, NextResponse } from "next/server";

type ProfileUpdateBody = {
  name?: unknown;
  email?: unknown;
  defaultTravelPriority?: unknown;
  defaultPassengerCount?: unknown;
};

type AuthUserDocument = {
  _id: string;
  id?: string;
  name?: string;
  updatedAt?: Date;
};

function isTravelPriority(value: unknown): value is TravelPriority {
  return typeof value === "string" && TRAVEL_PRIORITIES.includes(value as TravelPriority);
}

function serializeProfile(profile: {
  defaultTravelPriority: TravelPriority;
  defaultPassengerCount: number;
}) {
  return {
    defaultTravelPriority: profile.defaultTravelPriority,
    defaultPassengerCount: profile.defaultPassengerCount,
  };
}

async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

async function getOrCreateProfile(userId: string) {
  await dbConnect();

  return UserProfile.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        defaultTravelPriority: "time",
        defaultPassengerCount: 1,
      },
    },
    { returnDocument: "after", upsert: true },
  );
}

export async function GET(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const profile = await getOrCreateProfile(session.user.id);

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt,
      },
      profile: serializeProfile(profile),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as ProfileUpdateBody;
  const updates: Record<string, TravelPriority | number> = {};
  let emailVerificationSent = false;

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Display name is required." },
        { status: 400 },
      );
    }

    await authDb.collection<AuthUserDocument>("user").updateOne(
      { _id: session.user.id },
      {
        $set: {
          name: body.name.trim(),
          updatedAt: new Date(),
        },
      },
    );
  }

  if (body.email !== undefined) {
    if (typeof body.email !== "string" || !body.email.includes("@")) {
      return NextResponse.json(
        { success: false, message: "A valid email is required." },
        { status: 400 },
      );
    }

    const normalizedEmail = body.email.trim().toLowerCase();

    if (normalizedEmail !== session.user.email.toLowerCase()) {
      await auth.api.changeEmail({
        headers: req.headers,
        body: {
          newEmail: normalizedEmail,
          callbackURL: "/profile",
        },
      });
      emailVerificationSent = true;
    }
  }

  if (body.defaultTravelPriority !== undefined) {
    if (!isTravelPriority(body.defaultTravelPriority)) {
      return NextResponse.json(
        { success: false, message: "Travel priority must be time, cost, or comfort." },
        { status: 400 },
      );
    }

    updates.defaultTravelPriority = body.defaultTravelPriority;
  }

  if (body.defaultPassengerCount !== undefined) {
    const passengerCount = Number(body.defaultPassengerCount);

    if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 8) {
      return NextResponse.json(
        { success: false, message: "Passenger count must be between 1 and 8." },
        { status: 400 },
      );
    }

    updates.defaultPassengerCount = passengerCount;
  }

  await dbConnect();

  const profile = await UserProfile.findOneAndUpdate(
    { userId: session.user.id },
    {
      $set: updates,
      $setOnInsert: {
        userId: session.user.id,
      },
    },
    { returnDocument: "after", upsert: true },
  );

  return NextResponse.json({
    success: true,
    message: emailVerificationSent
      ? "Profile saved. Check your new email address to verify the change."
      : "Profile saved.",
    data: {
      profile: serializeProfile(profile),
      emailVerificationSent,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req.headers);

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as { confirmation?: unknown };

  if (body.confirmation !== "DELETE") {
    return NextResponse.json(
      { success: false, message: "Type DELETE to confirm account deletion." },
      { status: 400 },
    );
  }

  await dbConnect();

  const routes = await Route.find({ userId: session.user.id }).select("_id");
  const routeIds = routes.map((route) => route._id);

  const [
    alertResult,
    trafficResult,
    tripHistoryResult,
    routeResult,
    placeResult,
    profileResult,
  ] = await Promise.all([
    Alert.deleteMany({ userId: session.user.id }),
    routeIds.length > 0
      ? TrafficData.deleteMany({ routeId: { $in: routeIds } })
      : Promise.resolve({ deletedCount: 0 }),
    TripHistory.deleteMany({
      $or: [
        { userId: session.user.id },
        ...(routeIds.length > 0 ? [{ routeId: { $in: routeIds } }] : []),
      ],
    }),
    Route.deleteMany({ userId: session.user.id }),
    Place.deleteMany({ userId: session.user.id }),
    UserProfile.deleteOne({ userId: session.user.id }),
  ]);

  await Promise.all([
    authDb.collection("verification").deleteMany({
      $or: [
        { value: session.user.id },
        { identifier: { $regex: session.user.id } },
      ],
    }),
    authDb.collection("session").deleteMany({ userId: session.user.id }),
    authDb.collection("account").deleteMany({ userId: session.user.id }),
    authDb.collection<AuthUserDocument>("user").deleteOne({
      $or: [{ _id: session.user.id }, { id: session.user.id }],
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Account deleted.",
    data: {
      deleted: {
        alerts: alertResult.deletedCount,
        trafficData: trafficResult.deletedCount,
        tripHistory: tripHistoryResult.deletedCount,
        routes: routeResult.deletedCount,
        places: placeResult.deletedCount,
        profile: profileResult.deletedCount,
      },
    },
  });
}
