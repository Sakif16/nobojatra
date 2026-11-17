/**
 * Shapes shared by the trip assistant's endpoint and its chat panel.
 *
 * Client-safe: no server imports. See docs/AI_ASSISTANT_PLAN.md.
 */

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = { role: AssistantRole; content: string };

export type ResolvedPlace = { label: string; lat: number; lng: number };

export type TripRouteSummary = {
  id: string;
  rank: number;
  distanceKm: number;
  durationMin: number;
};

/** The trip a conversation is about, kept with the chat on the server. */
export type CurrentTrip = {
  tripHistoryId: string;
  routeId: string;
  routes: TripRouteSummary[];
  origin: ResolvedPlace;
  destination: ResolvedPlace;
  stops: ResolvedPlace[];
  passengers: number;
  /** "now", or the local departure the user asked for ("2026-11-17T09:00"). */
  leaveAt: string;
  preference: RidePreference;
};

/** What the next turn of a chat needs. Stored with the chat on the server. */
export type AssistantContext = {
  /** Places chosen or found in this chat, keyed by the lower-cased name. */
  resolvedPlaces?: Record<string, ResolvedPlace>;
  currentTrip?: CurrentTrip | null;
};

/** One message from the panel. History and context are the server's. */
export type AssistantRequest = {
  conversationId?: string;
  message: string;
  /** A place the user picked from chips, for the query it answers. */
  pick?: { query: string; place: ResolvedPlace };
  /** A trip from an earlier card in this chat, to work on again (Refresh). */
  focusTrip?: { tripHistoryId: string; routeId: string };
};

/** A next step offered under an answer. `fill` puts the text in the box instead of sending it. */
export type Suggestion = { label: string; message: string; fill?: boolean };

/** A message as stored with a chat and sent back to the panel. */
export type StoredMessage = {
  role: AssistantRole;
  text: string;
  cards: AssistantCard[];
  suggestions: Suggestion[];
  error: boolean;
  createdAt: string;
};

export type ChatSummary = { id: string; title: string; updatedAt: string; messageCount: number };

export type ChatDetail = { id: string; title: string; country: string; updatedAt: string; messages: StoredMessage[] };

export type RidePreference = "best" | "cheapest" | "comfort" | "seats";

export type RideSummary = {
  provider: string;
  vehicleType: string;
  displayName: string;
  /** Already formatted in the trip's currency, e.g. "৳180–220". */
  fareText: string;
  sourceLabel: string | null;
  comfortScore: number;
  maxPassengers: number;
  tags: string[];
};

export type PlaceChoiceCard = {
  kind: "place-choice";
  role: "origin" | "destination" | "stop";
  query: string;
  options: ResolvedPlace[];
};

export type TripCard = {
  kind: "trip";
  tripHistoryId: string;
  routeId: string;
  routes: TripRouteSummary[];
  origin: ResolvedPlace;
  destination: ResolvedPlace;
  stops: ResolvedPlace[];
  passengers: number;
  /** Formatted local departure, or null for "now". */
  departureLabel: string | null;
  /** "now", or the local departure as asked for, so an old card can be priced again. */
  leaveAt?: string;
  preference: RidePreference;
  rides: RideSummary[];
  unavailable: { displayName: string; reason: string }[];
  notes: string[];
  /** Places picked automatically, with the other matches the user can switch to. */
  guessedPlaces: { query: string; chosen: ResolvedPlace; alternatives: ResolvedPlace[] }[];
};

export type AssistantCard = PlaceChoiceCard | TripCard;

export type AssistantEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "status"; text: string }
  | { type: "card"; card: AssistantCard }
  /** Reply text as the model writes it. */
  | { type: "delta"; text: string }
  /** Withdraws text streamed before a tool call: it was not the answer. */
  | { type: "reset" }
  /** The finished, cleaned reply; replaces whatever was streamed. */
  | { type: "reply"; text: string }
  | { type: "suggestions"; items: Suggestion[] }
  | { type: "context"; context: AssistantContext }
  | { type: "error"; message: string }
  | { type: "done" };

/** Request bounds, shared so the panel trims before sending. */
export const ASSISTANT_LIMITS = {
  /** Messages of history sent to the model each turn. */
  messages: 12,
  messageChars: 1000,
  resolvedPlaces: 20,
  chatsPerUser: 20,
  messagesPerChat: 50,
} as const;
