"use client";

import { createContext, useContext } from "react";
import {
  COUNTRY_CONFIG,
  DEFAULT_COUNTRY,
  type CountryCode,
  type CountryConfig,
} from "@/lib/country-config";

/**
 * The active country, available to any client component under (main).
 *
 * A context rather than a prop because the country is needed at the leaves —
 * PlaceAutocomplete has eight call sites across four files, and threading a
 * prop to each would also mean routing it through MapDashboardSection and
 * RouteFinderForm, neither of which otherwise cares.
 *
 * The value is server-rendered in app/(main)/layout.tsx and only changes when
 * CountrySwitcher writes the profile and calls router.refresh(). There is no
 * client-side setter: the server stays the single source of truth, so the
 * context can never disagree with what is stored.
 */
const CountryContext = createContext<CountryCode>(DEFAULT_COUNTRY);

export function CountryProvider({
  country,
  children,
}: {
  country: CountryCode;
  children: React.ReactNode;
}) {
  return <CountryContext.Provider value={country}>{children}</CountryContext.Provider>;
}

/** The active country code. Falls back to the default outside a provider. */
export function useCountry(): CountryCode {
  return useContext(CountryContext);
}

/** The active country's full config — currency symbol, bounds, labels. */
export function useCountryConfig(): CountryConfig {
  return COUNTRY_CONFIG[useCountry()];
}
