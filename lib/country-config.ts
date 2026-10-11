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
  /**
   * The country's default IANA zone: the one a trip is read in when it has no
   * zone of its own (records written before trips stored one) and the one the
   * planner assumes before an origin is chosen.
   *
   * A trip's actual zone comes from its origin — see ./trip-time-zone — and is
   * always one of `timeZones` below.
   */
  timeZone: string;
  /**
   * Every IANA zone a trip in this country can be in. The peak windows below
   * are local times, so they apply in whichever of these the trip is in.
   */
  timeZones: string[];
  /**
   * Whether the traffic provider has live traffic data in this country.
   *
   * TomTom routes in Bangladesh but has no real-time traffic there: its
   * answers come back with no delay at all, which reads as free-flowing roads
   * and blank overlay tiles. Where this is false the app asks for no traffic,
   * shows none, and says so — an absent reading must never become a "low" one.
   * Peak hours are unaffected: they come from the clock, not from this.
   */
  liveTraffic: boolean;
  /**
   * Local-time windows when demand is high, as minutes from midnight.
   * `isPeakHour` feeds a fare multiplier, so these are pricing inputs:
   * treat them as estimates and tune them against real data.
   */
  peakWindows: Array<{ startMinute: number; endMinute: number }>;
  /** Weekdays exempt from the windows above. 0 = Sunday, 6 = Saturday. */
  nonPeakWeekdays: number[];
};

/** Readable minute-of-day, so the windows below stay legible. */
function at(hour: number, minute = 0) {
  return hour * 60 + minute;
}

/**
 * Every zone in the fifty states, east to west. Indiana, Kentucky, North Dakota
 * and Alaska each have counties on their own rules, which is why this is far
 * longer than the six zones people usually count.
 */
const US_TIME_ZONES = [
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Indiana/Tell_City",
  "America/Indiana/Knox",
  "America/Chicago",
  "America/Menominee",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
  "America/North_Dakota/Beulah",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Juneau",
  "America/Sitka",
  "America/Metlakatla",
  "America/Yakutat",
  "America/Nome",
  "America/Adak",
  "Pacific/Honolulu",
];

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
    timeZone: "Asia/Dhaka",
    timeZones: ["Asia/Dhaka"],
    liveTraffic: false,
    peakWindows: [
      { startMinute: at(8), endMinute: at(10, 30) },
      { startMinute: at(17), endMinute: at(20, 30) },
    ],
    // Bangladesh's weekend is Friday and Saturday, so neither has a rush hour.
    // This was Friday alone, a value carried over from before the country
    // config existed; Saturday was added by decision, and takes the peak-hour
    // fare adjustment off Saturday trips.
    nonPeakWeekdays: [5, 6],
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
    // Eastern time covers the largest share of the population.
    timeZone: "America/New_York",
    timeZones: US_TIME_ZONES,
    liveTraffic: true,
    peakWindows: [
      { startMinute: at(7), endMinute: at(9, 30) },
      { startMinute: at(16), endMinute: at(19) },
    ],
    nonPeakWeekdays: [0, 6],
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
    timeZone: "Europe/London",
    timeZones: ["Europe/London"],
    liveTraffic: true,
    peakWindows: [
      { startMinute: at(7), endMinute: at(9, 30) },
      { startMinute: at(16), endMinute: at(19) },
    ],
    nonPeakWeekdays: [0, 6],
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

/**
 * The zone a stored trip is read in. Every display, filter and peak-hour check
 * on a persisted trip goes through here.
 *
 * Trips written before the zone was stored have none, and read back in their
 * country's default zone. A stored value that is not one of the country's
 * zones is treated the same way rather than trusted.
 */
export function getTripTimeZone(timeZone: unknown, country: unknown): string {
  const config = getCountryConfig(country);

  return typeof timeZone === "string" && config.timeZones.includes(timeZone)
    ? timeZone
    : config.timeZone;
}

export function hasLiveTraffic(country: unknown): boolean {
  return getCountryConfig(country).liveTraffic;
}

/** The one sentence shown wherever a traffic reading would otherwise be. */
export function liveTrafficUnavailableMessage(country: unknown) {
  return `Live traffic is not available in ${getCountryConfig(country).label}.`;
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
