import "server-only";

import { Types } from "mongoose";
import dbConnect from "@/lib/mongodb";
import AssistantConversation from "@/models/AssistantConversation";
import type { CountryCode } from "@/lib/country-config";
import { readPlace, readTrip } from "@/lib/assistant/request";
import {
  ASSISTANT_LIMITS,
  type AssistantCard,
  type AssistantContext,
  type AssistantMessage,
  type ChatDetail,
  type ChatSummary,
  type CurrentTrip,
  type ResolvedPlace,
  type StoredMessage,
  type Suggestion,
  type TripCard,
} from "@/lib/assistant/types";

/**
 * Stored trip-assistant chats. Every read and write is filtered by the owner,
 * so an id from another account behaves like one that does not exist.
 */

type StoredDoc = {
  _id: Types.ObjectId | string;
  userId: string;
  country: CountryCode;
  title: string;
  messages?: Array<Omit<StoredMessage, "createdAt"> & { createdAt?: Date | string }>;
  messageCount?: number;
  context?: { resolvedPlaces?: unknown; currentTrip?: unknown };
  updatedAt?: Date | string;
};

export type LoadedChat = {
  id: string;
  country: CountryCode;
  title: string;
  messages: StoredMessage[];
  context: AssistantContext;
};

export const TITLE_CHARS = 60;

const iso = (value: Date | string | undefined) => new Date(value ?? Date.now()).toISOString();

function toMessage(message: NonNullable<StoredDoc["messages"]>[number]): StoredMessage {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    text: typeof message.text === "string" ? message.text : "",
    cards: Array.isArray(message.cards) ? message.cards : [],
    suggestions: Array.isArray(message.suggestions) ? message.suggestions : [],
    error: message.error === true,
    createdAt: iso(message.createdAt),
  };
}

/** Stored context, read back through the same checks as anything else from outside. */
function toContext(context: StoredDoc["context"]): AssistantContext {
  const resolvedPlaces: Record<string, ResolvedPlace> = {};
  if (context?.resolvedPlaces && typeof context.resolvedPlaces === "object") {
    for (const [key, value] of Object.entries(context.resolvedPlaces as Record<string, unknown>).slice(-ASSISTANT_LIMITS.resolvedPlaces)) {
      const place = readPlace(value);
      if (place) resolvedPlaces[key] = place;
    }
  }
  return { resolvedPlaces, currentTrip: readTrip(context?.currentTrip) };
}

export function chatTitle(message: string) {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > TITLE_CHARS ? `${flat.slice(0, TITLE_CHARS - 1).trimEnd()}…` : flat;
}

/**
 * What the model sees of a chat: its last text messages. A turn that failed or
 * was stopped is left out whole — the error and the message that started it —
 * otherwise the model picks the abandoned request up again on the next turn.
 */
export function chatHistory(messages: StoredMessage[], limit: number = ASSISTANT_LIMITS.messages): AssistantMessage[] {
  return messages
    .filter((message, index) => {
      if (message.error || !message.text.trim()) return false;
      const answer = messages[index + 1];
      return !(message.role === "user" && answer?.role === "assistant" && answer.error);
    })
    .slice(-limit)
    .map((message) => ({ role: message.role, content: message.text }));
}

/** A trip from one of this chat's own cards, never from the browser. */
export function tripFromCards(messages: StoredMessage[], tripHistoryId: string, routeId: string): CurrentTrip | null {
  for (const message of [...messages].reverse()) {
    for (const card of message.cards) {
      if (card.kind !== "trip" || card.tripHistoryId !== tripHistoryId) continue;
      const trip = card as TripCard;
      if (!trip.routes.some((route) => route.id === routeId)) continue;
      return readTrip({ ...trip, routeId, leaveAt: trip.leaveAt ?? "now" });
    }
  }
  return null;
}

function validId(id: string) {
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
}

export async function loadChat(userId: string, id: string): Promise<LoadedChat | null> {
  if (!validId(id)) return null;
  await dbConnect();
  const doc = (await AssistantConversation.findOne({ _id: id, userId }).lean()) as StoredDoc | null;
  if (!doc) return null;

  return {
    id: String(doc._id),
    country: doc.country,
    title: doc.title,
    messages: (doc.messages ?? []).map(toMessage),
    context: toContext(doc.context),
  };
}

/** Starts a chat and prunes the oldest across all countries to the account cap. */
export async function createChat(userId: string, country: CountryCode, firstMessage: string): Promise<LoadedChat> {
  await dbConnect();
  const doc = (await AssistantConversation.create({ userId, country, title: chatTitle(firstMessage) })) as { _id: unknown; title: string };
  // Prune after creation so concurrent new chats see one another when
  // enforcing the cap, rather than both making room for the same slot.
  const existing = (await AssistantConversation.find({ userId }).sort({ updatedAt: -1, _id: -1 }).select("_id").lean()) as Array<{ _id: unknown }>;
  const overflow = existing.slice(ASSISTANT_LIMITS.chatsPerUser).map((item) => item._id);
  if (overflow.length > 0) await AssistantConversation.deleteMany({ userId, _id: { $in: overflow } });

  return { id: String(doc._id), country, title: doc.title, messages: [], context: { resolvedPlaces: {}, currentTrip: null } };
}

/** Adds one turn and the context it leaves behind, in a single write. */
export async function appendTurn(
  userId: string,
  id: string,
  turn: {
    user: string;
    startedAt?: Date;
    reply: { text: string; cards: AssistantCard[]; suggestions: Suggestion[]; error: boolean };
    context: AssistantContext;
  },
) {
  await dbConnect();
  const now = turn.startedAt ?? new Date();
  const messages = [
    { role: "user", text: turn.user, cards: [], suggestions: [], error: false, createdAt: now },
    { role: "assistant", ...turn.reply, createdAt: new Date(now.getTime() + 1) },
  ];

  const result = await AssistantConversation.updateOne(
    { _id: id, userId, messageCount: { $lte: ASSISTANT_LIMITS.messagesPerChat - messages.length } },
    {
      // Concurrent turns may finish in reverse order. Keep their messages
      // together in the order the requests arrived, without a read/write race.
      $push: { messages: { $each: messages, $sort: { createdAt: 1 } } },
      $inc: { messageCount: messages.length },
      $set: { context: { resolvedPlaces: turn.context.resolvedPlaces ?? {}, currentTrip: turn.context.currentTrip ?? null } },
    },
  );
  return result.matchedCount > 0;
}

export async function listChats(userId: string, country: CountryCode): Promise<ChatSummary[]> {
  await dbConnect();
  const docs = (await AssistantConversation.find({ userId, country })
    .sort({ updatedAt: -1 })
    .limit(ASSISTANT_LIMITS.chatsPerUser)
    .select("title updatedAt messageCount")
    .lean()) as StoredDoc[];

  return docs.map((doc) => ({ id: String(doc._id), title: doc.title, updatedAt: iso(doc.updatedAt), messageCount: doc.messageCount ?? 0 }));
}

export async function getChatDetail(userId: string, id: string): Promise<ChatDetail | null> {
  if (!validId(id)) return null;
  await dbConnect();
  const doc = (await AssistantConversation.findOne({ _id: id, userId }).lean()) as StoredDoc | null;
  if (!doc) return null;
  return { id: String(doc._id), title: doc.title, country: doc.country, updatedAt: iso(doc.updatedAt), messages: (doc.messages ?? []).map(toMessage) };
}

export async function deleteChat(userId: string, id: string) {
  if (!validId(id)) return false;
  await dbConnect();
  const result = (await AssistantConversation.deleteOne({ _id: id, userId })) as { deletedCount?: number };
  return (result.deletedCount ?? 0) > 0;
}
