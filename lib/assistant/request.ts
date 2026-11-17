import { ASSISTANT_LIMITS, type CurrentTrip, type ResolvedPlace, type RidePreference } from "@/lib/assistant/types";

/**
 * Reads an assistant request, and the places and trips stored with a chat,
 * defensively.
 *
 * The panel sends only the new message and the chat it belongs to; history
 * and context are kept on the server (lib/assistant/conversations.ts). A pick
 * still goes through the routes endpoint's service-area check, and any trip id
 * through the fares endpoint's owner check.
 */

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function readPlace(value: unknown): ResolvedPlace | null {
  const place = value as Partial<ResolvedPlace> | null;
  return place && isText(place.label, 300) && isNumber(place.lat) && isNumber(place.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
    ? { label: place.label, lat: place.lat, lng: place.lng }
    : null;
}

export function readTrip(value: unknown): CurrentTrip | null {
  const trip = value as Partial<CurrentTrip> | null;
  if (!trip || !isText(trip.tripHistoryId, 64) || !isText(trip.routeId, 64)) return null;

  const routes = Array.isArray(trip.routes) ? trip.routes.slice(0, 5).flatMap((route) =>
    route && isText(route.id, 64) && isNumber(route.rank) && isNumber(route.distanceKm) && isNumber(route.durationMin)
      ? [{ id: route.id, rank: route.rank, distanceKm: route.distanceKm, durationMin: route.durationMin }]
      : []) : [];
  const origin = readPlace(trip.origin);
  const destination = readPlace(trip.destination);
  const stops = Array.isArray(trip.stops) ? trip.stops.slice(0, 6).map(readPlace) : [];
  const passengers = Number(trip.passengers);
  const preference: RidePreference = (["best", "cheapest", "comfort", "seats"] as const).includes(trip.preference as RidePreference)
    ? (trip.preference as RidePreference) : "best";

  if (!routes.length || !origin || !destination || stops.some((stop) => !stop) || !Number.isInteger(passengers) || passengers < 1 || passengers > 8) {
    return null;
  }

  return {
    tripHistoryId: trip.tripHistoryId,
    routeId: trip.routeId,
    routes,
    origin,
    destination,
    stops: stops as ResolvedPlace[],
    passengers,
    leaveAt: isText(trip.leaveAt, 16) ? trip.leaveAt : "now",
    preference,
  };
}

export type ReadRequest = {
  conversationId: string | null;
  message: string;
  pick: { query: string; place: ResolvedPlace } | null;
  focusTrip: { tripHistoryId: string; routeId: string } | null;
};

export function readAssistantRequest(body: Record<string, unknown>): ({ ok: true } & ReadRequest) | { ok: false; message: string } {
  // The panel before saved chats sent its own history. That shape is refused
  // rather than half-read: it would bypass the stored history.
  if ("messages" in body || "context" in body) {
    return { ok: false, message: "This page is out of date. Reload it to keep chatting." };
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, ASSISTANT_LIMITS.messageChars) : "";
  if (!message) return { ok: false, message: "Send a message to the assistant." };

  let conversationId: string | null = null;
  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (!isText(body.conversationId, 64)) return { ok: false, message: "That chat could not be found." };
    conversationId = body.conversationId;
  }

  let pick: ReadRequest["pick"] = null;
  if (body.pick !== undefined && body.pick !== null) {
    const raw = body.pick as { query?: unknown; place?: unknown };
    const place = readPlace(raw.place);
    if (!isText(raw.query, 120) || !place) return { ok: false, message: "That place choice could not be read." };
    pick = { query: raw.query, place };
  }

  let focusTrip: ReadRequest["focusTrip"] = null;
  if (body.focusTrip !== undefined && body.focusTrip !== null) {
    const raw = body.focusTrip as { tripHistoryId?: unknown; routeId?: unknown };
    if (!isText(raw.tripHistoryId, 64) || !isText(raw.routeId, 64)) return { ok: false, message: "That trip could not be read." };
    focusTrip = { tripHistoryId: raw.tripHistoryId, routeId: raw.routeId };
  }

  return { ok: true, conversationId, message, pick, focusTrip };
}
