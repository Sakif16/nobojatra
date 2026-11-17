import { COUNTRY_CONFIG, formatFare, type CountryCode } from "@/lib/country-config";
import { describeUnavailable } from "@/lib/fare-sorting";
import { getFareSourceLabel } from "@/lib/fare-source";
import { DEFAULT_STOP_DWELL_MINUTES } from "@/lib/trip-input";
import {
  decidePlace,
  lookupPlace,
  normalizePlaceQuery,
  type PlaceLookup,
  type PlaceResolution,
  type SavedPlace,
  type SearchResult,
} from "@/lib/assistant/places";
import type { OllamaTool, ToolCall } from "@/lib/assistant/ollama";
import { AssistantStopped } from "@/lib/assistant/ollama";
import type {
  AssistantEvent,
  CurrentTrip,
  ResolvedPlace,
  RidePreference,
  RideSummary,
  TripCard,
  TripRouteSummary,
} from "@/lib/assistant/types";

/**
 * The two things the model can ask the app to do. Neither writes anything the
 * user did not ask for: planning a trip records it in trip history exactly as
 * the planner form does, and saving is left to buttons on the cards.
 *
 * Every number the user sees — distances, times, fares, ranks — comes from the
 * app's own endpoints, reached through `ToolDeps`. The model only gets a short
 * summary to talk about; the full detail goes to the client as a card.
 */

export type EndpointResult = { status: number; body: unknown };

export type ToolDeps = {
  searchPlaces: (query: string) => Promise<{ ok: true; results: SearchResult[] } | { ok: false; message: string }>;
  planRoutes: (payload: Record<string, unknown>) => Promise<EndpointResult>;
  getFares: (tripHistoryId: string, routeId: string) => Promise<EndpointResult>;
};

export type ToolState = {
  resolvedPlaces: Record<string, ResolvedPlace>;
  currentTrip: CurrentTrip | null;
};

export type ToolContext = {
  deps: ToolDeps;
  country: CountryCode;
  defaultPassengers: number;
  savedPlaces: SavedPlace[];
  state: ToolState;
  emit: (event: AssistantEvent) => void;
  signal?: AbortSignal;
};

/** `stop` ends the turn with a fixed reply, without another model call. */
export type ToolOutcome = { content: string; stop?: { reply: string } };

const PREFERENCES: RidePreference[] = ["best", "cheapest", "comfort", "seats"];
const MAX_PLACE_CHARS = 120;
const MAX_STOPS = 6;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SHOWN_RIDES = 3;

export const TOOL_DEFINITIONS: OllamaTool[] = [
  {
    type: "function",
    function: {
      name: "plan_trip",
      description:
        "Plan a car-route trip in the user's country and price every ride option for it. Call this as soon as you know an origin and a destination. Places are plain text as the user said them (\"Dhanmondi\", \"home\", \"St Pancras\").",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Where the trip starts." },
          destination: { type: "string", description: "Where the trip ends." },
          stops: { type: "array", items: { type: "string" }, description: "Stops on the way, in order. At most 6." },
          passengers: { type: "integer", minimum: 1, maximum: 8, description: "Number of passengers. Omit to use the user's default." },
          leave_at: { type: "string", description: "\"now\", or a local departure time as YYYY-MM-DDTHH:mm in the trip's country, up to 5 days ahead." },
          preference: { type: "string", enum: PREFERENCES, description: "How to order rides: best (overall ranking), cheapest, comfort, or seats." },
        },
        required: ["origin", "destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fares",
      description: "Show ride options for another route of the trip already planned, or reorder its rides. Only after plan_trip.",
      parameters: {
        type: "object",
        properties: {
          route_number: { type: "integer", minimum: 1, description: "Route number as listed (1 is the suggested route)." },
          preference: { type: "string", enum: PREFERENCES },
        },
        required: ["route_number"],
      },
    },
  },
];

const shortName = (label: string) => label.split(",")[0]?.trim() || label;

const REMEMBERED_PLACES = 20;

/**
 * Keeps a resolved place for the rest of the chat, under what the user typed
 * and under the name the card showed. A follow-up ("make it 4 people") makes
 * the model plan again with those names; without this they were searched
 * again and could come back as a question the user had already answered.
 * The newest REMEMBERED_PLACES are kept, matching the request bound.
 */
function remember(state: ToolState, query: string, place: ResolvedPlace) {
  const keys = new Set([normalizePlaceQuery(query), normalizePlaceQuery(shortName(place.label))]);
  const entries = Object.entries(state.resolvedPlaces).filter(([key]) => !keys.has(key));
  for (const key of keys) entries.push([key, place]);
  state.resolvedPlaces = Object.fromEntries(entries.slice(-REMEMBERED_PLACES));
}

const toPlace = (value: { label: string; lat: number; lng: number }): ResolvedPlace => ({
  label: value.label,
  lat: value.lat,
  lng: value.lng,
});

function json(value: unknown) {
  return JSON.stringify(value);
}

function errorOutcome(message: string): ToolOutcome {
  return { content: json({ status: "error", message }) };
}

/** "2026-11-17T09:00" → "Tue 17 Nov, 9:00 am", read as the wall-clock time it is. */
export function formatLeaveAt(leaveAt: string) {
  if (!LOCAL_TIME.test(leaveAt)) return null;
  const [date, time] = leaveAt.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, hour, minute)));
}

type PlanArgs = {
  origin: string;
  destination: string;
  stops: string[];
  passengers: number | null;
  leaveAt: string;
  preference: RidePreference;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPreference(value: unknown): RidePreference {
  return PREFERENCES.includes(value as RidePreference) ? (value as RidePreference) : "best";
}

export function validatePlanArgs(args: Record<string, unknown> | null): { ok: true; value: PlanArgs } | { ok: false; message: string } {
  if (!args) return { ok: false, message: "plan_trip needs a JSON object of arguments." };

  const origin = text(args.origin);
  const destination = text(args.destination);
  if (!origin) return { ok: false, message: "origin is required." };
  if (!destination) return { ok: false, message: "destination is required." };
  if (origin.length > MAX_PLACE_CHARS || destination.length > MAX_PLACE_CHARS) {
    return { ok: false, message: "A place name is too long." };
  }

  const stops = Array.isArray(args.stops) ? args.stops.map(text).filter(Boolean) : [];
  if (stops.length > MAX_STOPS) return { ok: false, message: `At most ${MAX_STOPS} stops.` };
  if (stops.some((stop) => stop.length > MAX_PLACE_CHARS)) return { ok: false, message: "A stop name is too long." };

  let passengers: number | null = null;
  if (args.passengers !== undefined && args.passengers !== null) {
    const count = Number(args.passengers);
    if (!Number.isInteger(count) || count < 1 || count > 8) {
      return { ok: false, message: "passengers must be a whole number from 1 to 8." };
    }
    passengers = count;
  }

  const leaveAt = text(args.leave_at) || "now";
  if (leaveAt !== "now" && !LOCAL_TIME.test(leaveAt)) {
    return { ok: false, message: "leave_at must be \"now\" or YYYY-MM-DDTHH:mm." };
  }

  return { ok: true, value: { origin, destination, stops, passengers, leaveAt, preference: readPreference(args.preference) } };
}

// ── Fares → card rows ──

type FareOption = {
  provider: string;
  vehicleType: string;
  displayName: string;
  maxPassengers: number;
  comfortScore: number;
  eligible: boolean;
  weatherBlocked?: boolean;
  restrictionReason?: string | null;
  fare: { low: number; mid: number; high: number };
  fareSource?: string;
  ranking?: { rank: number } | null;
};

type FaresBody = {
  success?: boolean;
  message?: string;
  country?: CountryCode;
  results?: FareOption[];
  weather?: { severityBand?: string; kind?: string } | null;
  trafficUnavailable?: boolean;
};

function orderRides(options: FareOption[], preference: RidePreference) {
  const compare: Record<RidePreference, (a: FareOption, b: FareOption) => number> = {
    best: (a, b) => (a.ranking?.rank ?? Infinity) - (b.ranking?.rank ?? Infinity) || a.fare.mid - b.fare.mid,
    cheapest: (a, b) => a.fare.mid - b.fare.mid,
    comfort: (a, b) => b.comfortScore - a.comfortScore || a.fare.mid - b.fare.mid,
    seats: (a, b) => b.maxPassengers - a.maxPassengers || a.fare.mid - b.fare.mid,
  };
  return [...options].sort(compare[preference]);
}

export function buildRides(body: FaresBody, country: CountryCode, passengers: number, preference: RidePreference) {
  const results = Array.isArray(body.results) ? body.results : [];
  const available = results.filter((option) => option.eligible && !option.weatherBlocked);
  const unavailable = results.filter((option) => !option.eligible || option.weatherBlocked);
  const cheapest = Math.min(...available.map((option) => option.fare.mid));
  const comfiest = Math.max(...available.map((option) => option.comfortScore));
  const ordered = orderRides(available, preference);

  const rides: RideSummary[] = ordered.slice(0, SHOWN_RIDES).map((option) => {
    const tags: string[] = [];
    if (available.length > 1 && option.ranking?.rank === 1) tags.push("Best overall");
    if (available.length > 1 && option.fare.mid === cheapest) tags.push("Cheapest");
    if (available.length > 1 && option.comfortScore === comfiest && ordered.find((o) => o.comfortScore === comfiest) === option) tags.push("Most comfortable");

    return {
      provider: option.provider,
      vehicleType: option.vehicleType,
      displayName: option.displayName,
      fareText: formatFare(option.fare.low, option.fare.high, country),
      sourceLabel: getFareSourceLabel(option.fareSource),
      comfortScore: option.comfortScore,
      maxPassengers: option.maxPassengers,
      tags,
    };
  });

  const notes: string[] = [];
  const band = body.weather?.severityBand;
  if (band === "moderate" || band === "severe") {
    notes.push(`${band === "severe" ? "Severe" : "Moderate"} weather${body.weather?.kind === "forecast" ? " forecast" : ""}: some rides may be held back or cost more.`);
  }
  if (body.trafficUnavailable) notes.push("No live traffic here; times are estimates.");
  notes.push("Fares are estimates, not quotes.");

  return {
    rides,
    totalAvailable: available.length,
    unavailable: unavailable.slice(0, 4).map((option) => ({
      displayName: option.displayName,
      reason: describeUnavailable(option, passengers),
    })),
    notes,
  };
}

function firstError(body: unknown, fallback: string) {
  const value = body as { errors?: Record<string, unknown>; message?: unknown } | null;
  const errors = value?.errors ? Object.values(value.errors).flat().filter((e) => typeof e === "string") : [];
  return (errors[0] as string | undefined) ?? (typeof value?.message === "string" ? value.message : fallback);
}

/** The short version the model talks about. The card carries the rest. */
function summarize(card: TripCard, totalAvailable: number) {
  return json({
    status: "ok",
    from: shortName(card.origin.label),
    to: shortName(card.destination.label),
    stops: card.stops.map((stop) => shortName(stop.label)),
    passengers: card.passengers,
    departure: card.departureLabel ?? "now",
    shown_route: card.routes.findIndex((route) => route.id === card.routeId) + 1,
    routes: card.routes.map((route, index) => ({ route: index + 1, km: route.distanceKm, min: route.durationMin })),
    rides_shown_in_card: card.rides.map((ride) => ({ name: ride.displayName, fare: ride.fareText, tags: ride.tags })),
    rides_available: totalAvailable,
    unavailable: card.unavailable.map((item) => item.displayName),
    guessed_places: card.guessedPlaces.map((guess) => ({ asked: guess.query, used: shortName(guess.chosen.label) })),
  });
}

async function priceTrip(context: ToolContext, trip: CurrentTrip, guessedPlaces: TripCard["guessedPlaces"]): Promise<ToolOutcome> {
  if (context.signal?.aborted) throw new AssistantStopped();
  context.emit({ type: "status", text: "Pricing rides…" });
  const fares = await context.deps.getFares(trip.tripHistoryId, trip.routeId);
  if (context.signal?.aborted) throw new AssistantStopped();
  const body = (fares.body ?? {}) as FaresBody;
  const country = body.country ?? context.country;

  if (fares.status !== 200 || !Array.isArray(body.results)) {
    return errorOutcome(firstError(body, "Fares could not be loaded for this trip."));
  }

  const built = buildRides(body, country, trip.passengers, trip.preference);
  const card: TripCard = {
    kind: "trip",
    tripHistoryId: trip.tripHistoryId,
    routeId: trip.routeId,
    routes: trip.routes,
    origin: trip.origin,
    destination: trip.destination,
    stops: trip.stops,
    passengers: trip.passengers,
    departureLabel: trip.leaveAt === "now" ? null : formatLeaveAt(trip.leaveAt),
    leaveAt: trip.leaveAt,
    preference: trip.preference,
    rides: built.rides,
    unavailable: built.unavailable,
    notes: built.notes,
    guessedPlaces,
  };

  context.state.currentTrip = trip;
  context.emit({ type: "card", card });
  return { content: summarize(card, built.totalAvailable) };
}

async function planTrip(args: Record<string, unknown> | null, context: ToolContext): Promise<ToolOutcome> {
  const parsed = validatePlanArgs(args);
  if (!parsed.ok) return errorOutcome(parsed.message);
  const plan = parsed.value;
  const area = COUNTRY_CONFIG[context.country].serviceAreaName;

  context.emit({ type: "status", text: "Finding places…" });

  const wanted: { role: "origin" | "destination" | "stop"; query: string }[] = [
    { role: "origin", query: plan.origin },
    ...plan.stops.map((query) => ({ role: "stop" as const, query })),
    { role: "destination", query: plan.destination },
  ];
  const resolved: ResolvedPlace[] = [];
  const guessedPlaces: TripCard["guessedPlaces"] = [];

  // Look every place up first (one search each, one after another), so each
  // can then be decided with the trip's other places as its neighbourhood.
  const lookups: PlaceLookup[] = [];
  for (const { query } of wanted) {
    if (context.signal?.aborted) throw new AssistantStopped();
    const looked = await lookupPlace(query, {
      resolvedPlaces: context.state.resolvedPlaces,
      savedPlaces: context.savedPlaces,
      search: context.deps.searchPlaces,
    });
    if (looked.status === "error") return errorOutcome(looked.message);
    lookups.push(looked);
  }
  const tripPoints = context.state.currentTrip
    ? [context.state.currentTrip.origin, ...context.state.currentTrip.stops, context.state.currentTrip.destination]
    : [];

  for (const [index, { role, query }] of wanted.entries()) {
    const looked = lookups[index];
    const near = [
      ...tripPoints,
      ...lookups.flatMap((other, otherIndex) =>
        otherIndex === index ? [] : other.status === "known" ? [other.place] : other.status === "results" ? other.results.slice(0, 4) : []),
    ];
    const result: PlaceResolution = looked.status === "known"
      ? { status: "ok", place: looked.place, alternatives: [], guessed: false }
      : looked.status === "results"
        ? decidePlace(query, looked.results, near)
        : { status: "error", message: looked.message };

    if (result.status === "error") return errorOutcome(result.message);
    if (result.status === "none") return errorOutcome(`No place called "${query}" was found in ${area}.`);
    if (result.status === "choice") {
      context.emit({ type: "card", card: { kind: "place-choice", role, query, options: result.options } });
      return {
        content: json({ status: "needs_user_choice", place: query }),
        stop: { reply: `Which "${query}" do you mean? Pick one below.` },
      };
    }
    if (result.guessed) guessedPlaces.push({ query, chosen: result.place, alternatives: result.alternatives });
    resolved.push(result.place);
    remember(context.state, query, result.place);
  }

  const origin = resolved[0];
  const destination = resolved[resolved.length - 1];
  const stops = resolved.slice(1, -1);
  const passengers = plan.passengers ?? context.defaultPassengers;

  context.emit({ type: "status", text: "Planning routes…" });
  if (context.signal?.aborted) throw new AssistantStopped();
  const routed = await context.deps.planRoutes({
    origin: toPlace(origin),
    destination: toPlace(destination),
    stops: stops.map((stop) => ({ ...toPlace(stop), dwellMinutes: DEFAULT_STOP_DWELL_MINUTES })),
    passengerCount: passengers,
    departureMode: plan.leaveAt === "now" ? "now" : "scheduled",
    scheduledLocal: plan.leaveAt === "now" ? null : plan.leaveAt,
  });
  const data = (routed.body as { data?: { routes?: Array<TripRouteSummary & Record<string, unknown>>; tripHistoryId?: string | null } } | null)?.data;

  if (routed.status !== 200 || !data?.routes?.length) {
    return errorOutcome(firstError(routed.body, "No route could be found for this trip."));
  }
  if (!data.tripHistoryId) {
    return errorOutcome("The trip could not be saved to history, so its fares cannot be priced.");
  }

  const routes: TripRouteSummary[] = data.routes.map((route) => ({
    id: String(route.id),
    rank: Number(route.rank),
    distanceKm: Number(route.distanceKm),
    durationMin: Number(route.durationMin),
  }));

  return priceTrip(context, {
    tripHistoryId: data.tripHistoryId,
    routeId: routes[0].id,
    routes,
    origin,
    destination,
    stops,
    passengers,
    leaveAt: plan.leaveAt,
    preference: plan.preference,
  }, guessedPlaces);
}

async function getFares(args: Record<string, unknown> | null, context: ToolContext): Promise<ToolOutcome> {
  const trip = context.state.currentTrip;
  if (!trip) return errorOutcome("No trip has been planned yet. Call plan_trip first.");

  const number = Number(args?.route_number);
  const route = Number.isInteger(number) ? trip.routes[number - 1] : undefined;
  if (!route) return errorOutcome(`This trip has ${trip.routes.length} route${trip.routes.length === 1 ? "" : "s"}.`);

  return priceTrip(context, {
    ...trip,
    routeId: route.id,
    preference: args?.preference === undefined ? trip.preference : readPreference(args.preference),
  }, []);
}

export async function runTool(call: ToolCall, context: ToolContext): Promise<ToolOutcome> {
  if (call.name === "plan_trip") return planTrip(call.arguments, context);
  if (call.name === "get_fares") return getFares(call.arguments, context);
  return errorOutcome(`Unknown tool "${call.name}". Use plan_trip or get_fares.`);
}

export { normalizePlaceQuery };
