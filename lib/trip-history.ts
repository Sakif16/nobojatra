import "server-only";

import { DEFAULT_COUNTRY, resolveCountry, type CountryCode } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import type { RouteResult } from "@/lib/routing";
import type { TripLocation, ValidatedTripInput } from "@/lib/trip-input";
import TripHistory from "@/models/TripHistory";
import { Types } from "mongoose";

function serializeLocation(location: TripLocation) {
  return {
    label: location.label,
    lat: location.lat,
    lng: location.lng,
    ...("dwellMinutes" in location &&
    typeof location.dwellMinutes === "number" &&
    Number.isFinite(location.dwellMinutes)
      ? { dwellMinutes: location.dwellMinutes }
      : {}),
  };
}

function serializeRoute(route: RouteResult) {
  return {
    routeId: route.id,
    rank: route.rank,
    distanceKm: route.distanceKm,
    travelDurationMin: route.travelDurationMin ?? route.durationMin,
    dwellDurationMin: route.dwellDurationMin ?? 0,
    durationMin: route.durationMin,
    coords: route.coords,
    legs: route.legs,
  };
}

export type RecentTrip = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  passengerCount: number;
  distanceKm: number | null;
  durationMin: number | null;
  departureMode: "now" | "scheduled";
  scheduledAt: string | null;
  createdAt: string;
};

type StoredLocation = { label?: unknown; lat?: unknown; lng?: unknown };
type StoredActivityTrip = {
  _id: unknown;
  origin?: unknown;
  destination?: unknown;
  stops?: unknown;
  passengerCount?: number;
  distanceKm?: number | null;
  durationMin?: number | null;
  departureMode?: unknown;
  scheduledAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type MonthlyTripActivityGroup = {
  monthKey: string;
  monthLabel: string;
  trips: RecentTrip[];
};

export type TripHistoryActivityData = {
  lastSevenDays: RecentTrip[];
  monthlyGroups: MonthlyTripActivityGroup[];
};

function getLocationLabel(location: unknown) {
  const label = (location as StoredLocation | null)?.label;
  return typeof label === "string" && label.trim() ? label : "Unknown place";
}

function mapRecentTrip(record: StoredActivityTrip): RecentTrip {
  return {
    id: String(record._id),
    originLabel: getLocationLabel(record.origin),
    destinationLabel: getLocationLabel(record.destination),
    stopCount: Array.isArray(record.stops) ? record.stops.length : 0,
    passengerCount: record.passengerCount ?? 1,
    distanceKm: record.distanceKm ?? null,
    durationMin: record.durationMin ?? null,
    departureMode: record.departureMode === "scheduled" ? "scheduled" : "now",
    scheduledAt: record.scheduledAt
      ? new Date(record.scheduledAt).toISOString()
      : null,
    createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
  };
}

/**
 * Home-page summary. Returns plain serializable values because these cross the
 * server/client boundary as props.
 */
export async function getHomeTripSummary(userId: string) {
  await dbConnect();

  const upcomingCount = await TripHistory.countDocuments({
    userId,
    departureMode: "scheduled",
    scheduledAt: { $gt: new Date() },
  });

  return { upcomingCount };
}

export type ScheduledTripListItem = {
  id: string;
  /** Country the trip was planned in — decides the currency it renders in. */
  country: CountryCode;
  routeId: string | null;
  originLabel: string;
  destinationLabel: string;
  stops: Array<{ label: string; dwellMinutes: number | null }>;
  passengerCount: number;
  scheduledAt: string;
  estimatedArrivalAt: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  travelDurationMin: number | null;
  dwellDurationMin: number;
  vehicle: {
    displayName: string;
    fareLow: number;
    fareHigh: number;
    currency: string;
  } | null;
  weather: SelectionWeatherSnapshot;
  weatherUnavailable: boolean;
  traffic: SelectionTrafficSnapshot;
  trafficUnavailable: boolean;
  itinerary: {
    travelDurationMin: number;
    dwellDurationMin: number;
    legs: TripSummaryItineraryLeg[];
  } | null;
  createdAt: string;
};

function getStopDwellMinutes(stop: unknown) {
  if (!stop || typeof stop !== "object") return null;

  const dwellMinutes = (stop as { dwellMinutes?: unknown }).dwellMinutes;

  return typeof dwellMinutes === "number" && Number.isFinite(dwellMinutes)
    ? dwellMinutes
    : null;
}

function getScheduledTripRouteId(record: {
  selectedRoute?: { routeId?: unknown } | null;
  routeOptions?: Array<{ routeId?: unknown }>;
}) {
  const selectedRouteId = record.selectedRoute?.routeId;

  if (typeof selectedRouteId === "string" && selectedRouteId.trim()) {
    return selectedRouteId;
  }

  const firstRouteId = Array.isArray(record.routeOptions)
    ? record.routeOptions[0]?.routeId
    : null;

  return typeof firstRouteId === "string" && firstRouteId.trim()
    ? firstRouteId
    : null;
}

export async function getScheduledTrips(userId: string): Promise<ScheduledTripListItem[]> {
  await dbConnect();

  const records = await TripHistory.find({
    userId,
    departureMode: "scheduled",
    scheduledAt: { $gt: new Date() },
  })
    .sort({ scheduledAt: 1 })
    .lean();

  return records.flatMap((record) => {
    if (!record.scheduledAt) return [];

    const scheduledAt = new Date(record.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return [];

    const selectedRoute = record.selectedRoute as StoredRouteSnapshot | null;
    const durationMin =
      record.selectedVehicle?.estimatedDurationMin ?? record.durationMin ?? null;
    const itinerary = getSummaryItinerary(selectedRoute);
    const dwellDurationMin = itinerary?.dwellDurationMin ?? 0;
    const travelDurationMin =
      itinerary?.travelDurationMin ??
      (durationMin != null ? Math.max(1, durationMin - dwellDurationMin) : null);
    const estimatedArrivalAt =
      durationMin != null
        ? new Date(scheduledAt.getTime() + durationMin * 60_000).toISOString()
        : null;

    return [
      {
        id: String(record._id),
        routeId: getScheduledTripRouteId(record),
        originLabel: getLocationLabel(record.origin),
        destinationLabel: getLocationLabel(record.destination),
        stops: Array.isArray(record.stops)
          ? (record.stops as unknown[]).map((stop) => ({
              label: getLocationLabel(stop),
              dwellMinutes: getStopDwellMinutes(stop),
            }))
          : [],
        passengerCount: record.passengerCount ?? 1,
        country: resolveCountry(record.country),
        scheduledAt: scheduledAt.toISOString(),
        estimatedArrivalAt,
        distanceKm: record.distanceKm ?? null,
        durationMin,
        travelDurationMin,
        dwellDurationMin,
        vehicle: record.selectedVehicle
          ? {
              displayName: record.selectedVehicle.displayName,
              fareLow: record.selectedVehicle.estimatedFareLow,
              fareHigh: record.selectedVehicle.estimatedFareHigh,
              currency: record.selectedVehicle.currency ?? "BDT",
            }
          : null,
        weather: record.selectionSnapshot?.weather ?? null,
        weatherUnavailable: Boolean(record.selectionSnapshot?.weatherUnavailable),
        traffic: record.selectionSnapshot?.traffic ?? null,
        trafficUnavailable: Boolean(record.selectionSnapshot?.trafficUnavailable),
        itinerary,
        createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
      },
    ];
  });
}

export async function getTripHistoryActivityData(userId: string): Promise<TripHistoryActivityData> {
  await dbConnect();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [lastSevenDayRecords, monthlyRecords] = (await Promise.all([
    TripHistory.find({ userId, createdAt: { $gte: sevenDaysAgo } })
      .sort({ createdAt: -1 })
      .lean(),
    TripHistory.find({ userId })
      .sort({ createdAt: -1 })
      .lean(),
  ])) as [StoredActivityTrip[], StoredActivityTrip[]];

  const monthFormatter = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  });

  const groups = new Map<string, MonthlyTripActivityGroup>();

  for (const record of monthlyRecords) {
    const trip = mapRecentTrip(record);
    const createdAt = new Date(trip.createdAt);
    const monthKey = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
    const existing = groups.get(monthKey);

    if (existing) {
      existing.trips.push(trip);
    } else {
      groups.set(monthKey, {
        monthKey,
        monthLabel: monthFormatter.format(createdAt),
        trips: [trip],
      });
    }
  }

  return {
    lastSevenDays: lastSevenDayRecords.map(mapRecentTrip),
    monthlyGroups: Array.from(groups.values()),
  };
}

export async function createTripHistoryRecord({
  userId,
  trip,
  routes,
  country,
}: {
  userId: string;
  trip: ValidatedTripInput;
  routes: RouteResult[];
  country: CountryCode;
}) {
  await dbConnect();

  const selectedRoute = routes[0] ? serializeRoute(routes[0]) : null;

  const record = await TripHistory.create({
    userId,
    country,
    origin: serializeLocation(trip.origin),
    destination: serializeLocation(trip.destination),
    stops: trip.stops.map(serializeLocation),
    passengerCount: trip.passengerCount,
    departureMode: trip.departureMode,
    scheduledAt: trip.scheduledAt ? new Date(trip.scheduledAt) : null,
    routeOptions: routes.map(serializeRoute),
    selectedRoute,
    distanceKm: selectedRoute?.distanceKm ?? null,
    durationMin: selectedRoute?.durationMin ?? null,
    completedAt: new Date(),
  });

  return String(record._id);
}

export async function updateSelectedTripRoute({
  userId,
  tripHistoryId,
  routeId,
}: {
  userId: string;
  tripHistoryId: string;
  routeId: string;
}) {
  if (!Types.ObjectId.isValid(tripHistoryId)) {
    return null;
  }

  await dbConnect();

  const record = await TripHistory.findOne({
    _id: tripHistoryId,
    userId,
  });

  if (!record) {
    return null;
  }

  const routeOptions = Array.isArray(record.routeOptions)
    ? record.routeOptions
    : [];
  const selectedRoute = routeOptions.find(
    (route: { routeId?: string }) => route.routeId === routeId
  );

  if (!selectedRoute) {
    return null;
  }

  record.selectedRoute = selectedRoute;
  record.distanceKm = selectedRoute.distanceKm;
  record.durationMin = selectedRoute.durationMin;
  await record.save();

  return {
    id: String(record._id),
    selectedRoute,
  };
}

// ── Trip Summary & Trip History ─────────────────────────────────────────

export type SelectedVehicleInput = {
  vehicleRateId?: string | null;
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  estimatedFareLow: number;
  estimatedFareHigh: number;
  estimatedDurationMin: number | null;
  currency?: string;
};

export type SelectionWeatherSnapshot = {
  source: "route_midpoint" | "dhaka_fallback";
  temperatureCelsius: number;
  precipitationMmPerHour: number;
  windKmh: number;
  visibilityMeters: number | null;
  severityScore: number;
  severityBand: "low" | "moderate" | "severe";
} | null;

export type SelectionTrafficSnapshot = {
  congestionIndexPercent: number;
  congestionLevel: "low" | "moderate" | "high" | "severe";
  isPeakHour: boolean;
  durationInTrafficMin: number;
  baselineDurationMin: number;
} | null;

export type SelectionSnapshotInput = {
  weather: SelectionWeatherSnapshot;
  weatherUnavailable: boolean;
  traffic: SelectionTrafficSnapshot;
  trafficUnavailable: boolean;
};

export type TripSummaryItineraryLeg = {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  durationMin: number;
  dwellAfterMin: number;
};

type StoredRouteSnapshot = {
  travelDurationMin?: unknown;
  dwellDurationMin?: unknown;
  durationMin?: unknown;
  legs?: unknown;
};

function normalizeSummaryLegs(legs: unknown): TripSummaryItineraryLeg[] {
  if (!Array.isArray(legs)) return [];

  return legs.reduce<TripSummaryItineraryLeg[]>((normalized, leg, index) => {
    if (!leg || typeof leg !== "object") return normalized;

    const candidate = leg as Record<string, unknown>;
    const fromLabel =
      typeof candidate.fromLabel === "string" && candidate.fromLabel.trim()
        ? candidate.fromLabel.trim()
        : `Point ${index + 1}`;
    const toLabel =
      typeof candidate.toLabel === "string" && candidate.toLabel.trim()
        ? candidate.toLabel.trim()
        : `Point ${index + 2}`;
    const distanceKm =
      typeof candidate.distanceKm === "number" && Number.isFinite(candidate.distanceKm)
        ? candidate.distanceKm
        : 0;
    const durationMin =
      typeof candidate.durationMin === "number" && Number.isFinite(candidate.durationMin)
        ? candidate.durationMin
        : 0;
    const dwellAfterMin =
      typeof candidate.dwellAfterMin === "number" && Number.isFinite(candidate.dwellAfterMin)
        ? candidate.dwellAfterMin
        : 0;

    normalized.push({
      fromLabel,
      toLabel,
      distanceKm,
      durationMin,
      dwellAfterMin,
    });

    return normalized;
  }, []);
}

function getSummaryItinerary(route: StoredRouteSnapshot | null | undefined) {
  if (!route) return null;

  const legs = normalizeSummaryLegs(route.legs);
  if (legs.length <= 1) return null;

  const dwellDurationMin =
    typeof route.dwellDurationMin === "number" &&
    Number.isFinite(route.dwellDurationMin)
      ? route.dwellDurationMin
      : legs.reduce((total, leg) => total + leg.dwellAfterMin, 0);
  const totalDurationMin =
    typeof route.durationMin === "number" && Number.isFinite(route.durationMin)
      ? route.durationMin
      : null;
  const travelDurationMin =
    typeof route.travelDurationMin === "number" &&
    Number.isFinite(route.travelDurationMin)
      ? route.travelDurationMin
      : totalDurationMin !== null
        ? Math.max(1, totalDurationMin - dwellDurationMin)
        : legs.reduce((total, leg) => total + leg.durationMin, 0);

  return {
    travelDurationMin,
    dwellDurationMin,
    legs,
  };
}

/**
 * Confirms a vehicle for a trip: re-anchors the selected route (in case the
 * user picked a different route card than what was last saved), stores the
 * vehicle by value, and stamps a weather/traffic snapshot for that instant.
 * Returns null if the trip or route isn't found/owned by this user.
 */
export async function saveVehicleSelection({
  userId,
  tripHistoryId,
  routeId,
  vehicle,
  snapshot,
}: {
  userId: string;
  tripHistoryId: string;
  routeId: string;
  vehicle: SelectedVehicleInput;
  snapshot: SelectionSnapshotInput;
}) {
  if (!Types.ObjectId.isValid(tripHistoryId)) return null;

  await dbConnect();

  const record = await TripHistory.findOne({ _id: tripHistoryId, userId });
  if (!record) return null;

  const routeOptions = Array.isArray(record.routeOptions) ? record.routeOptions : [];
  const matchedRoute =
    routeOptions.find((route: { routeId?: string }) => route.routeId === routeId) ??
    (record.selectedRoute?.routeId === routeId ? record.selectedRoute : null);

  if (!matchedRoute) return null;

  record.selectedRoute = matchedRoute;
  record.distanceKm = matchedRoute.distanceKm;
  record.durationMin = matchedRoute.durationMin;
  record.selectedVehicle = vehicle;
  record.selectionSnapshot = {
    ...snapshot,
    capturedAt: new Date(),
  };
  record.selectedAt = new Date();

  await record.save();

  return { id: String(record._id) };
}

export type TripSummaryDetail = {
  id: string;
  /** Country the trip was planned in — decides the currency it renders in. */
  country: CountryCode;
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  passengerCount: number;
  distanceKm: number | null;
  durationMin: number | null;
  vehicle: {
    provider: string;
    vehicleType: string;
    displayName: string;
    maxPassengers: number;
    fareLow: number;
    fareHigh: number;
    currency: string;
  } | null;
  departureMode: "now" | "scheduled";
  estimatedDepartureAt: string | null;
  estimatedArrivalAt: string | null;
  weather: SelectionWeatherSnapshot;
  weatherUnavailable: boolean;
  traffic: SelectionTrafficSnapshot;
  trafficUnavailable: boolean;
  itinerary: {
    travelDurationMin: number;
    dwellDurationMin: number;
    legs: TripSummaryItineraryLeg[];
  } | null;
  selectedAt: string | null;
  createdAt: string;
};

/** Post-selection summary for the Trip Summary page — a single owned trip. */
export async function getTripSummary(
  userId: string,
  tripHistoryId: string,
): Promise<TripSummaryDetail | null> {
  if (!Types.ObjectId.isValid(tripHistoryId)) return null;

  await dbConnect();

  const record = await TripHistory.findOne({ _id: tripHistoryId, userId }).lean();
  if (!record) return null;

  const vehicle = record.selectedVehicle
    ? {
        provider: record.selectedVehicle.provider,
        vehicleType: record.selectedVehicle.vehicleType,
        displayName: record.selectedVehicle.displayName,
        maxPassengers: record.selectedVehicle.maxPassengers,
        fareLow: record.selectedVehicle.estimatedFareLow,
        fareHigh: record.selectedVehicle.estimatedFareHigh,
        currency: record.selectedVehicle.currency ?? "BDT",
      }
    : null;

  const durationMin =
    record.selectedVehicle?.estimatedDurationMin ?? record.durationMin ?? null;
  const itinerary = getSummaryItinerary(record.selectedRoute as StoredRouteSnapshot | null);

  // "now" trips depart when the user confirmed; scheduled trips depart at the
  // chosen time. Arrival is derived, not stored, so it never drifts from the
  // duration actually shown.
  const departureBase =
    record.departureMode === "scheduled" && record.scheduledAt
      ? new Date(record.scheduledAt)
      : record.selectedAt
        ? new Date(record.selectedAt)
        : new Date(record.createdAt ?? Date.now());

  const estimatedDepartureAt = departureBase.toISOString();
  const estimatedArrivalAt =
    durationMin != null
      ? new Date(departureBase.getTime() + durationMin * 60_000).toISOString()
      : null;

  return {
    id: String(record._id),
    country: resolveCountry(record.country),
    originLabel: getLocationLabel(record.origin),
    destinationLabel: getLocationLabel(record.destination),
    stopCount: Array.isArray(record.stops) ? record.stops.length : 0,
    passengerCount: record.passengerCount ?? 1,
    distanceKm: record.distanceKm ?? null,
    durationMin,
    vehicle,
    departureMode: record.departureMode === "scheduled" ? "scheduled" : "now",
    estimatedDepartureAt,
    estimatedArrivalAt,
    weather: record.selectionSnapshot?.weather ?? null,
    weatherUnavailable: Boolean(record.selectionSnapshot?.weatherUnavailable),
    traffic: record.selectionSnapshot?.traffic ?? null,
    trafficUnavailable: Boolean(record.selectionSnapshot?.trafficUnavailable),
    itinerary,
    selectedAt: record.selectedAt ? new Date(record.selectedAt).toISOString() : null,
    createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
  };
}

export type TripHistoryListItem = {
  id: string;
  /** Country the trip was planned in — decides the currency it renders in. */
  country: CountryCode;
  originLabel: string;
  destinationLabel: string;
  vehicleProvider: string | null;
  vehicleType: string | null;
  vehicleDisplayName: string | null;
  fareLow: number | null;
  fareHigh: number | null;
  fareMid: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  selectedAt: string | null;
  createdAt: string;
};

export type TripHistoryFilters = {
  from?: string;
  to?: string;
  provider?: string;
  vehicleType?: string;
};

export type TripHistoryPage = {
  trips: TripHistoryListItem[];
  summary: {
    tripCount: number;
    totalCost: number;
    averageCost: number;
    mostUsedVehicle: string | null;
    /**
     * The country the cost figures are denominated in, and how many of the
     * listed trips they cover. History can span countries once a user switches,
     * and adding 110 BDT to 14 USD would produce a meaningless total — so the
     * costs below are computed over one country's trips only.
     */
    costCountry: CountryCode;
    costTripCount: number;
  };
};

/**
 * Trip History list — only trips with a confirmed vehicle count (a search
 * that was never booked isn't trip history), reverse-chronological, with an
 * optional date-range and/or vehicle filter and a summary header computed
 * over the filtered set.
 */
export async function getTripHistoryPage(
  userId: string,
  filters: TripHistoryFilters = {},
): Promise<TripHistoryPage> {
  await dbConnect();

  const query: Record<string, unknown> = {
    userId,
    selectedVehicle: { $ne: null },
  };

  const createdAtRange: Record<string, Date> = {};
  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.getTime())) createdAtRange.$gte = from;
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999); // inclusive of the whole "to" day
      createdAtRange.$lte = to;
    }
  }
  if (Object.keys(createdAtRange).length > 0) {
    query.createdAt = createdAtRange;
  }

  if (filters.provider) query["selectedVehicle.provider"] = filters.provider;
  if (filters.vehicleType) query["selectedVehicle.vehicleType"] = filters.vehicleType;

  const records = await TripHistory.find(query).sort({ createdAt: -1 }).lean();

  const trips: TripHistoryListItem[] = records.map((record) => {
    const fareLow = record.selectedVehicle?.estimatedFareLow ?? null;
    const fareHigh = record.selectedVehicle?.estimatedFareHigh ?? null;
    const fareMid =
      fareLow != null && fareHigh != null ? (fareLow + fareHigh) / 2 : null;

    return {
      id: String(record._id),
      country: resolveCountry(record.country),
      originLabel: getLocationLabel(record.origin),
      destinationLabel: getLocationLabel(record.destination),
      vehicleProvider: record.selectedVehicle?.provider ?? null,
      vehicleType: record.selectedVehicle?.vehicleType ?? null,
      vehicleDisplayName: record.selectedVehicle?.displayName ?? null,
      fareLow,
      fareHigh,
      fareMid,
      distanceKm: record.distanceKm ?? null,
      durationMin: record.durationMin ?? null,
      selectedAt: record.selectedAt ? new Date(record.selectedAt).toISOString() : null,
      createdAt: new Date(record.createdAt ?? Date.now()).toISOString(),
    };
  });

  // Costs are summed within a single currency only. The country chosen is the
  // one most of the priced trips were planned in; trips from other countries
  // still appear in the list, they just do not contribute to the totals.
  const pricedTrips = trips.filter((t) => t.fareMid != null);

  const countryCounts = new Map<CountryCode, number>();
  for (const trip of pricedTrips) {
    countryCounts.set(trip.country, (countryCounts.get(trip.country) ?? 0) + 1);
  }

  let costCountry: CountryCode = DEFAULT_COUNTRY;
  let bestCountryCount = 0;
  for (const [code, count] of countryCounts) {
    if (count > bestCountryCount) {
      bestCountryCount = count;
      costCountry = code;
    }
  }

  const costs = pricedTrips
    .filter((t) => t.country === costCountry)
    .map((t) => t.fareMid as number);
  const totalCost = Math.round(costs.reduce((sum, v) => sum + v, 0));
  const averageCost = costs.length > 0 ? Math.round(totalCost / costs.length) : 0;

  const usage = new Map<string, { label: string; count: number }>();
  for (const trip of trips) {
    if (!trip.vehicleDisplayName || !trip.vehicleProvider || !trip.vehicleType) continue;
    const key = `${trip.vehicleProvider}-${trip.vehicleType}`;
    const existing = usage.get(key);
    if (existing) existing.count += 1;
    else usage.set(key, { label: trip.vehicleDisplayName, count: 1 });
  }

  let mostUsedVehicle: string | null = null;
  let mostUsedCount = 0;
  for (const entry of usage.values()) {
    if (entry.count > mostUsedCount) {
      mostUsedCount = entry.count;
      mostUsedVehicle = entry.label;
    }
  }

  return {
    trips,
    summary: {
      tripCount: trips.length,
      totalCost,
      averageCost,
      mostUsedVehicle,
      costCountry,
      costTripCount: costs.length,
    },
  };
}

// ── Saved Places & Frequent Routes ──────────────────────────────────────

export type FrequentTripSuggestion = {
  origin: TripLocation;
  destination: TripLocation;
  passengerCount: number;
  tripCount: number;
};

// Rounds to 4 decimal places (~11m precision) so two trips to the "same"
// address don't get split into separate groups over GPS noise, while still
// telling apart genuinely different nearby places.
function roundCoord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10_000) / 10_000
    : null;
}

function toGroupableLocation(location: unknown): TripLocation | null {
  const record = location as StoredLocation | null;
  const lat = roundCoord(record?.lat);
  const lng = roundCoord(record?.lng);
  const label = typeof record?.label === "string" && record.label.trim() ? record.label : null;

  if (lat === null || lng === null || !label) return null;

  return { label, lat, lng };
}

/**
 * Groups trip history from the last N days by origin+destination pair and
 * returns the most-repeated ones, for the home screen's "Plan Again" cards.
 * A pair must occur at least `minOccurrences` times to count as "frequent" —
 * a one-off trip isn't a pattern worth surfacing.
 */
export async function getFrequentTrips(
  userId: string,
  options: { days?: number; limit?: number; minOccurrences?: number } = {},
): Promise<FrequentTripSuggestion[]> {
  await dbConnect();

  const days = options.days ?? 30;
  const limit = options.limit ?? 3;
  const minOccurrences = options.minOccurrences ?? 2;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const records = await TripHistory.find({ userId, createdAt: { $gte: cutoff } })
    .select("origin destination passengerCount createdAt")
    .sort({ createdAt: -1 }) // newest first, so the first hit per group is the most recent passenger count
    .lean();

  type Group = {
    origin: TripLocation;
    destination: TripLocation;
    passengerCount: number;
    count: number;
  };

  const groups = new Map<string, Group>();

  for (const record of records) {
    const origin = toGroupableLocation(record.origin);
    const destination = toGroupableLocation(record.destination);
    if (!origin || !destination) continue;

    const key = `${origin.lat},${origin.lng}=>${destination.lat},${destination.lng}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        origin,
        destination,
        passengerCount: record.passengerCount ?? 1,
        count: 1,
      });
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((group) => ({
      origin: group.origin,
      destination: group.destination,
      passengerCount: group.passengerCount,
      tripCount: group.count,
    }));
}
