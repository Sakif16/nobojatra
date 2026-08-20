import "server-only";

import { DEFAULT_COUNTRY, resolveCountry, type CountryCode } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";

/**
 * The signed-in user's chosen country.
 *
 * Use this only where a country is being *chosen* — planning a new trip,
 * listing the vehicles available to pick from, filtering place search. Anywhere
 * that works on an already-stored trip must read the country off that record
 * instead, because trips snapshot the country they were planned in and must
 * keep rendering in it after the user switches.
 *
 * Never throws: a missing profile, a profile written before the field existed,
 * or a value that is no longer a valid code all resolve to the default.
 */
export async function getUserCountry(userId: string): Promise<CountryCode> {
  if (!userId) return DEFAULT_COUNTRY;

  try {
    await dbConnect();
    const profile = await UserProfile.findOne({ userId }).select("country").lean();
    return resolveCountry((profile as { country?: unknown } | null)?.country);
  } catch (error) {
    console.warn("Could not resolve user country; falling back to default:", error);
    return DEFAULT_COUNTRY;
  }
}
