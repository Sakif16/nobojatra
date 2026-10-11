import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { DEFAULT_COUNTRY, resolveCountry, type CountryCode } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";

/**
 * The session and profile for the page being rendered, read once.
 *
 * The layout, the navbar and the page each need the session, and the layout
 * and most pages need the profile. React's cache() shares one call between
 * them for the length of a single render, so a page costs one session lookup
 * and one profile read however many components ask.
 *
 * For server components only. Route handlers run outside a render, where
 * cache() shares nothing; they keep reading the request's own headers.
 */
export const getRequestSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The signed-in user's whole profile, or null when they have not saved one. */
export const getRequestProfile = cache(async (userId: string) => {
  await dbConnect();

  return UserProfile.findOne({ userId }).lean();
});

/**
 * The signed-in user's chosen country, from the shared profile read.
 *
 * Never throws, like getUserCountry: the layout calls this, and a database
 * hiccup there should cost the country choice, not the whole page.
 */
export async function getRequestCountry(userId: string): Promise<CountryCode> {
  try {
    const profile = await getRequestProfile(userId);

    return resolveCountry((profile as { country?: unknown } | null)?.country);
  } catch (error) {
    console.warn("Could not resolve user country; falling back to default:", error);
    return DEFAULT_COUNTRY;
  }
}
