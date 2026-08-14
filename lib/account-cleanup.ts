// lib/account-cleanup.ts
// The single application-data cascade for account deletion.
//
// Better Auth owns the auth collections — its internal adapter removes
// `session`, `account`, and `user`, in that order, keyed correctly as
// ObjectIds. This module owns everything else the app wrote for that user.
// It runs from the `deleteUser.beforeDelete` hook in lib/auth.ts, so BOTH
// delete entry points — the built-in `/api/auth/delete-user` and
// `DELETE /api/profile` — cascade through exactly this code. No route writes
// the auth collections directly any more; the raw string-keyed deletes that
// used to live in the profile route never matched the adapter's ObjectId keys
// and reported success anyway.
//
// Two properties this module is responsible for:
//
//   Idempotent — every step is a `deleteMany`/`deleteOne` on a filter, so
//   re-running it against an already-clean account is a no-op that returns
//   zeroes rather than an error.
//
//   Fails closed — it throws rather than swallowing. `beforeDelete` runs
//   before Better Auth removes the user, so a throw here aborts the whole
//   deletion. The account stays intact and retryable instead of becoming an
//   unreachable pile of orphaned rows.
import "server-only";
import type { Db } from "mongodb";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Alert from "@/models/Alert";
import Route from "@/models/Map_route";
import Place from "@/models/Place";
import TrafficData from "@/models/TrafficData";
import TripHistory from "@/models/TripHistory";
import UserProfile from "@/models/UserProfile";

export type AccountCleanupSummary = {
  alerts: number;
  trafficData: number;
  tripHistory: number;
  routes: number;
  places: number;
  profile: number;
  tripInputRequests: number;
  verification: number;
};

/**
 * `tripinputrequests` carries a `userId` but has no model, route, or script
 * left in the repository — it is residue from code that no longer exists. It
 * is still user data, so deletion has to reach it; without this the collection
 * would accumulate rows no owner can ever remove. Named here rather than
 * silently skipped so the next person can drop it outright if the collection
 * is confirmed dead.
 */
const LEGACY_USER_COLLECTIONS = ["tripinputrequests"] as const;

/**
 * Removes every non-auth document belonging to `userId`, plus the auth
 * `verification` rows Better Auth's own cascade leaves behind.
 *
 * `authDb` is passed in rather than imported so this module stays independent
 * of lib/auth.ts, which imports it.
 */
export async function deleteAccountData(
  userId: string,
  authDb: Db,
): Promise<AccountCleanupSummary> {
  await dbConnect();

  // TrafficData is keyed by routeId, not userId, so the owned route ids have
  // to be collected before the routes themselves are deleted.
  const routes = await Route.find({ userId }).select("_id");
  const routeIds = routes.map((route) => route._id);

  const [alerts, trafficData, tripHistory, routesDeleted, places, profile] =
    await Promise.all([
      Alert.deleteMany({ userId }),
      routeIds.length > 0
        ? TrafficData.deleteMany({ routeId: { $in: routeIds } })
        : Promise.resolve({ deletedCount: 0 }),
      TripHistory.deleteMany({
        $or: [
          { userId },
          ...(routeIds.length > 0 ? [{ routeId: { $in: routeIds } }] : []),
        ],
      }),
      Route.deleteMany({ userId }),
      Place.deleteMany({ userId }),
      UserProfile.deleteOne({ userId }),
    ]);

  const appDb = mongoose.connection.db;

  if (!appDb) {
    throw new Error("Mongoose connection has no database handle.");
  }

  const legacyCounts = await Promise.all(
    LEGACY_USER_COLLECTIONS.map((name) =>
      appDb.collection(name).deleteMany({ userId }),
    ),
  );

  // Better Auth's internal delete covers `session`, `account`, and `user`, but
  // never `verification`. Both row types that reference a user — reset-password
  // and delete-account — store the user id in `value`, and email verification
  // uses signed JWTs with no row at all, so an exact match on `value` is the
  // complete set. (The previous implementation used
  // `{ identifier: { $regex: userId } }`, which interpolated a value into a
  // regex for no benefit.)
  const verification = await authDb
    .collection("verification")
    .deleteMany({ value: userId });

  return {
    alerts: alerts.deletedCount,
    trafficData: trafficData.deletedCount,
    tripHistory: tripHistory.deletedCount,
    routes: routesDeleted.deletedCount,
    places: places.deletedCount,
    profile: profile.deletedCount,
    tripInputRequests: legacyCounts.reduce((sum, result) => sum + result.deletedCount, 0),
    verification: verification.deletedCount,
  };
}
