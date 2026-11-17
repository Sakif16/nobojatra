import assert from "node:assert/strict";
import test from "node:test";
import { load, requirePackage } from "./support/load.mjs";
import { assistantStore } from "./support/assistant-store.mjs";

const reply = { text: "Found it.", cards: [], suggestions: [], error: false };
const turn = (user = "hello", extra = {}) => ({ user, reply, context: {}, ...extra });

test("chats have a 30-day TTL and an owner/country index", () => {
  const mongoose = requirePackage("mongoose");
  const { default: model, ASSISTANT_CHAT_RETENTION_SECONDS } = load("models/AssistantConversation.ts", { mongoose });
  assert.equal(ASSISTANT_CHAT_RETENTION_SECONDS, 30 * 86400);
  assert.ok(model.schema.indexes().some(([keys, options]) => keys.updatedAt === 1 && options.expireAfterSeconds === 30 * 86400));
  assert.ok(model.schema.indexes().some(([keys]) => keys.userId === 1 && keys.country === 1 && keys.updatedAt === -1));
});

test("create and append restore messages, cards, suggestions and checked context", async () => {
  const { storage, docs } = assistantStore();
  const chat = await storage.createChat("owner", "BD", "  Home\n to work  ");
  assert.equal(chat.title, "Home to work");
  assert.equal(storage.chatTitle("x".repeat(100)).length, 60);
  const card = { kind: "place-choice", query: "Work", role: "destination", options: [{ label: "Work", lat: 23.7, lng: 90.4 }] };
  const suggestions = [{ label: "Next", message: "Next" }];
  assert.equal(await storage.appendTurn("owner", chat.id, turn("hello", {
    reply: { ...reply, cards: [card], suggestions },
    context: { resolvedPlaces: { work: card.options[0], invalid: { label: "bad", lat: 100, lng: 0 } }, currentTrip: { routeId: "fake" } },
  })), true);
  const restored = await storage.loadChat("owner", chat.id);
  assert.equal(restored.messages.length, 2);
  assert.equal(docs[0].messageCount, 2);
  assert.deepEqual(restored.messages[1].cards, [card]);
  assert.deepEqual(restored.messages[1].suggestions, suggestions);
  assert.deepEqual(Object.keys(restored.context.resolvedPlaces), ["work"]);
  assert.equal(restored.context.currentTrip, null);
  assert.equal((await storage.getChatDetail("owner", chat.id)).messages[0].text, "hello");
});

test("list is country and owner scoped, newest first, capped across all countries", async () => {
  const { storage, docs } = assistantStore();
  const oldest = await storage.createChat("owner", "UK", "oldest");
  docs[0].updatedAt = new Date(0);
  await storage.createChat("other", "BD", "private");
  for (let index = 0; index < 20; index++) {
    const chat = await storage.createChat("owner", index === 19 ? "US" : "BD", `chat ${index}`);
    docs.find((doc) => doc._id === chat.id).updatedAt = new Date(1000 + index);
  }
  assert.equal(await storage.loadChat("owner", oldest.id), null);
  assert.equal(docs.filter((doc) => doc.userId === "owner").length, 20);
  const listed = await storage.listChats("owner", "BD");
  assert.equal(listed.length, 19);
  assert.equal(listed[0].title, "chat 18");
  assert.equal((await storage.listChats("owner", "US"))[0].title, "chat 19");
  assert.equal((await storage.listChats("other", "BD"))[0].title, "private");
});

test("load, append, get and delete cannot access another owner's chat", async () => {
  const { storage } = assistantStore();
  const chat = await storage.createChat("owner", "BD", "secret");
  assert.equal(await storage.loadChat("other", chat.id), null);
  assert.equal(await storage.getChatDetail("other", chat.id), null);
  assert.equal(await storage.appendTurn("other", chat.id, turn()), false);
  assert.equal(await storage.deleteChat("other", chat.id), false);
  assert.equal(await storage.loadChat("owner", "not-an-id"), null);
  assert.equal(await storage.deleteChat("owner", chat.id), true);
  assert.equal(await storage.getChatDetail("owner", chat.id), null);
});

test("atomic appends keep concurrent messages in arrival order and enforce 50 messages", async () => {
  const { storage } = assistantStore();
  const chat = await storage.createChat("owner", "BD", "hello");
  // The later request finishes first.
  await storage.appendTurn("owner", chat.id, turn("second", { startedAt: new Date(2000) }));
  await storage.appendTurn("owner", chat.id, turn("first", { startedAt: new Date(1000) }));
  assert.deepEqual((await storage.loadChat("owner", chat.id)).messages.map((message) => message.text), ["first", "Found it.", "second", "Found it."]);
  for (let index = 0; index < 22; index++) await storage.appendTurn("owner", chat.id, turn());
  assert.deepEqual(await Promise.all([
    storage.appendTurn("owner", chat.id, turn("last")),
    storage.appendTurn("owner", chat.id, turn("overflow")),
  ]), [true, false]);
  assert.equal((await storage.loadChat("owner", chat.id)).messages.length, 50);
});

test("model history contains the last text messages without cards, errors or stopped replies", () => {
  const { storage } = assistantStore();
  const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `message ${index}`, cards: [{ secret: true }], error: false }));
  messages.push({ role: "assistant", text: "Stopped.", error: true }, { role: "assistant", text: "Provider failed", error: true });
  const history = storage.chatHistory(messages);
  assert.equal(history.length, 12);
  assert.deepEqual(history[0], { role: "user", content: "message 8" });
  assert.equal(history.at(-1).content, "message 19");

  // A stopped turn is left out whole, so the model does not pick the
  // abandoned request up again.
  const stopped = [
    { role: "user", text: "Dhanmondi to Gulshan", error: false },
    { role: "assistant", text: "Route 1 is fastest.", error: false },
    { role: "user", text: "Banani to Uttara tomorrow", error: false },
    { role: "assistant", text: "Stopped.", error: true },
    { role: "user", text: "Show the fares for route 2.", error: false },
  ];
  assert.deepEqual(storage.chatHistory(stopped).map((message) => message.content), ["Dhanmondi to Gulshan", "Route 1 is fastest.", "Show the fares for route 2."]);
});

test("refresh context only comes from a trip and route in the stored cards", () => {
  const { storage } = assistantStore();
  const place = { label: "Dhaka", lat: 23.7, lng: 90.4 };
  const card = { kind: "trip", tripHistoryId: "stored", routeId: "r1", routes: [{ id: "r1", rank: 1, distanceKm: 5, durationMin: 10 }, { id: "r2", rank: 2, distanceKm: 6, durationMin: 12 }], origin: place, destination: place, stops: [], passengers: 2, leaveAt: "2026-11-20T09:00", preference: "cheapest" };
  const messages = [{ cards: [card] }];
  assert.equal(storage.tripFromCards(messages, "foreign", "r1"), null);
  assert.equal(storage.tripFromCards(messages, "stored", "foreign"), null);
  const trip = storage.tripFromCards(messages, "stored", "r2");
  assert.equal(trip.routeId, "r2");
  assert.equal(trip.leaveAt, "2026-11-20T09:00");
});

const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
function endpoints(store, userId = "owner", country = "BD") {
  const mocks = {
    "next/server": next,
    "@/lib/auth": { auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } },
    "@/lib/assistant/conversations": store.storage,
    "@/lib/user-country": { getUserCountry: async () => country },
  };
  return { list: load("app/api/assistant/conversations/route.ts", mocks), detail: load("app/api/assistant/conversations/[id]/route.ts", mocks) };
}

test("list/get/delete endpoints require sign-in and enforce owner access and country listing", async () => {
  const store = assistantStore();
  const chat = await store.storage.createChat("owner", "BD", "BD trip");
  await store.storage.createChat("owner", "UK", "UK trip");
  const request = new Request("http://localhost/api/assistant/conversations");
  const context = { params: Promise.resolve({ id: chat.id }) };
  const signedOut = endpoints(store, null);
  for (const response of [await signedOut.list.GET(request), await signedOut.detail.GET(request, context), await signedOut.detail.DELETE(request, context)]) assert.equal(response.status, 401);
  const foreign = endpoints(store, "other");
  assert.deepEqual((await (await foreign.list.GET(request)).json()).chats, []);
  assert.equal((await foreign.detail.GET(request, context)).status, 404);
  assert.equal((await foreign.detail.DELETE(request, context)).status, 404);
  const owner = endpoints(store);
  const listed = await owner.list.GET(request);
  assert.equal(listed.headers.get("cache-control"), "no-store");
  assert.deepEqual((await listed.json()).chats.map((item) => item.title), ["BD trip"]);
  assert.equal((await (await owner.detail.GET(request, context)).json()).chat.title, "BD trip");
  assert.equal((await owner.detail.DELETE(request, context)).status, 200);
  assert.equal((await owner.detail.GET(request, context)).status, 404);
});
