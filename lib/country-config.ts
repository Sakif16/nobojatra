/**
 * The single source of truth for everything that varies by country.
 *
 * The app was built Dhaka-first, and the Bangladesh assumptions had settled
 * into six independent layers: the service-area box in ./trip-input, the
 * Nominatim viewbox, the seeded rate cards, the currency rendered in the fare
 * UI, the weather fallback coordinate in the three pricing routes, and the
 * copy. This module exists so those become one lookup rather than six
 * scattered `if (country === "BD")` branches.
 *
 * Two things deliberately do NOT live here, because they do not actually vary:
 *
 *   - The map. ../components/map/RouteMap centres on the trip origin and both
 *     of its tile sources (Mapbox streets-v12, OpenStreetMap) are worldwide.
 *     There is nothing country-specific to select.
 *   - The weather provider. ./weather queries OpenWeather by raw lat/lng, which
 *     is global. Only the *fallback coordinate* below is country-specific.
 *
 * Routing is likewise global (OpenRouteService), so it needs no entry either.
 */

export const COUNTRY_OPTIONS = ["BD", "US", "UK"] as const;
export type CountryCode = (typeof COUNTRY_OPTIONS)[number];

/**
 * Existing profiles, trips and saved trips predate the country field. They read
 * back as BD so behaviour is unchanged for everyone who was using the app when
 * this shipped — there is no backfill migration.
 */
export const DEFAULT_COUNTRY: CountryCode = "BD";

export type CountryBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type CountryConfig = {
  /** Shown in the country selector and in user-facing copy. */
  label: string;
  /** Named in validation errors: "Origin must be inside the X service area." */
  serviceAreaName: string;
  /** Gate for isInsideServiceArea() and the Nominatim viewbox. */
  bounds: CountryBounds;
  /** ISO 3166-1 alpha-2, for Nominatim's `countrycodes` filter. */
  nominatimCountryCode: string;
  /**
   * Whether to additionally send `viewbox` + `bounded=1` to Nominatim.
   *
   * No country sets this today: all three service areas are whole countries,
   * where `countrycodes` is both sufficient and more accurate than a
   * rectangle. It stays because the knob is what a sub-national service area
   * would need — BD used it while it was limited to Dhaka Division, and any
   * future city- or region-scoped entry would need it again.
   */
  useBoundedViewbox: boolean;
  /** ISO 4217, stored on trip records so history renders in its own currency. */
  currency: string;
  currencySymbol: string;
  /** Used when a route has no usable midpoint to read weather at. */
  fallbackWeatherPoint: { lat: number; lng: number };
};

export const COUNTRY_CONFIG: Record<CountryCode, CountryConfig> = {
  /**
   * The whole country, not the Dhaka Division rectangle this started as.
   *
   * The box spans Tetulia in the north to St Martin's in the south and the
   * Chittagong Hill Tracts in the east, so it also takes in slivers of India
   * and Myanmar — acceptable for the same reason the US box is, since the box
   * is only the coarse validation gate while `countrycodes=bd` does the real
   * filtering on the autocomplete that feeds it.
   *
   * The fallback weather point stays Dhaka: it is the country's largest city
   * and only applies when a route has no usable midpoint to read.
   */
  BD: {
    label: "Bangladesh",
    serviceAreaName: "Bangladesh",
    bounds: { west: 88.0, south: 20.5, east: 92.7, north: 26.7 },
    nominatimCountryCode: "bd",
    useBoundedViewbox: false,
    currency: "BDT",
    currencySymbol: "৳",
    fallbackWeatherPoint: { lat: 23.8103, lng: 90.4125 },
  },
  /**
   * Wide enough to contain Alaska (west to -179.15) and Hawaii (south to
   * ~18.9) as well as the contiguous states. It therefore also contains parts
   * of Canada and Mexico — acceptable because the box is only the coarse
   * validation gate, while `countrycodes=us` does the real filtering on the
   * autocomplete that feeds it.
   */
  US: {
    label: "United States",
    serviceAreaName: "the United States",
    bounds: { west: -179.15, south: 18.9, east: -66.9, north: 71.4 },
    nominatimCountryCode: "us",
    useBoundedViewbox: false,
    currency: "USD",
    currencySymbol: "$",
    fallbackWeatherPoint: { lat: 40.7128, lng: -74.006 },
  },
  /** Shetland in the north, the Isles of Scilly in the south-west. */
  UK: {
    label: "United Kingdom",
    serviceAreaName: "the United Kingdom",
    bounds: { west: -8.65, south: 49.85, east: 1.77, north: 60.86 },
    nominatimCountryCode: "gb",
    useBoundedViewbox: false,
    currency: "GBP",
    currencySymbol: "£",
    fallbackWeatherPoint: { lat: 51.5072, lng: -0.1276 },
  },
};

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && COUNTRY_OPTIONS.includes(value as CountryCode);
}

/**
 * Every read of a persisted country goes through here. Records written before
 * the field existed, and anything a client sends that is not a known code,
 * resolve to BD rather than throwing.
 */
export function resolveCountry(value: unknown): CountryCode {
  return isCountryCode(value) ? value : DEFAULT_COUNTRY;
}

export function getCountryConfig(value: unknown): CountryConfig {
  return COUNTRY_CONFIG[resolveCountry(value)];
}

export function getCountryBounds(value: unknown): CountryBounds {
  return getCountryConfig(value).bounds;
}

/**
 * Nominatim wants the viewbox corners in west,north,east,south order — note
 * that this is not the order the bounds object declares them in.
 */
export function getNominatimViewbox(value: unknown) {
  const { west, north, east, south } = getCountryBounds(value);
  return [west, north, east, south].join(",");
}

/**
 * Fares are integer bands throughout the app, so this is a symbol prefix rather
 * than Intl.NumberFormat — the latter would introduce ".00" on every figure and
 * change how every existing BD fare reads.
 */
export function formatFare(low: number, high: number, country: unknown) {
  const { currencySymbol } = getCountryConfig(country);

  if (low === high) {
    return `${currencySymbol}${low}`;
  }

  return `${currencySymbol}${low}–${high}`;
}

/** A single amount, for totals and averages rather than estimate bands. */
export function formatAmount(amount: number, country: unknown) {
  return `${getCountryConfig(country).currencySymbol}${amount}`;
}
