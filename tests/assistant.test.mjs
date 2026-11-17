import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";
import { assistantStore } from "./support/assistant-store.mjs";

// No test here talks to Ollama, OpenStreetMap or the database.

class FakeBudgetError extends Error {}
const budget = (spend = async () => {}) => ({
  "@/lib/provider-budget": {
    spendProviderBudget: spend,
    ProviderBudgetError: FakeBudgetError,
    budgetReachedMessage: (feature) => `The demo has reached today's limit for ${feature}.`,
  },
});

const ollama = (mocks = {}) => load("lib/assistant/ollama.ts", { ...budget(), ...mocks });

// ── Ollama client ──

test("tool calls are read whatever shape the model sends them in", () => {
  const { parseToolCalls } = ollama();
  const call = { function: { name: "plan_trip", arguments: { origin: "A", destination: "B" } } };

  assert.deepEqual(parseToolCalls([call]), [{ name: "plan_trip", arguments: { origin: "A", destination: "B" } }]);
  // ollama/ollama#18506: the list arrives as a JSON string.
  assert.deepEqual(parseToolCalls(JSON.stringify([call])), [{ name: "plan_trip", arguments: { origin: "A", destination: "B" } }]);
  // Arguments as a string are read too; broken ones become null, not a throw.
  assert.deepEqual(parseToolCalls([{ function: { name: "get_fares", arguments: "{\"route_number\":2}" } }]), [{ name: "get_fares", arguments: { route_number: 2 } }]);
  assert.deepEqual(parseToolCalls([{ function: { name: "get_fares", arguments: "{not json" } }]), [{ name: "get_fares", arguments: null }]);
  for (const garbage of [undefined, null, "", "nonsense", 42, {}, [{}], [{ function: { arguments: {} } }]]) {
    assert.deepEqual(parseToolCalls(garbage), []);
  }
});

test("the client sends the configured model, no reasoning, and capped output", async () => {
  const { ollamaChat, getOllamaConfig } = ollama();
  assert.equal(getOllamaConfig({ OLLAMA_BASE_URL: "https://ollama.com/api/" }).url, "https://ollama.com/api/chat");
  assert.equal(getOllamaConfig({ OLLAMA_BASE_URL: "https://ollama.com" }).url, "https://ollama.com/api/chat");
  assert.equal(getOllamaConfig({}).model, "glm-5.3-flash");

  let sent;
  const result = await ollamaChat(
    { messages: [{ role: "user", content: "hi" }], tools: [] },
    {
      env: { OLLAMA_API_KEY: "key", OLLAMA_CHAT_MODEL: "glm-5.3-flash" },
      fetch: async (url, init) => {
        sent = { url, init, body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ message: { content: "Hello", tool_calls: [] }, prompt_eval_count: 120, eval_count: 9 }));
      },
    },
  );

  assert.equal(sent.url, "https://ollama.com/api/chat");
  assert.equal(sent.init.headers.Authorization, "Bearer key");
  assert.equal(sent.body.model, "glm-5.3-flash");
  assert.equal(sent.body.think, false);
  assert.equal(sent.body.stream, false);
  assert.equal(sent.body.options.num_predict, 600);
  assert.deepEqual(result, { content: "Hello", toolCalls: [], usage: { input: 120, output: 9 } });
});

test("model failures become messages a user can read", async () => {
  const { ollamaChat, AssistantError } = ollama();
  const input = { messages: [], tools: [] };
  const env = { OLLAMA_API_KEY: "key" };
  const failing = async (deps) => {
    try {
      await ollamaChat(input, { env, ...deps });
      return null;
    } catch (error) {
      assert.ok(error instanceof AssistantError);
      return error;
    }
  };

  assert.equal((await failing({ env: {} })).status, 503);
  assert.match((await failing({ fetch: async () => new Response("", { status: 401 }) })).userMessage, /not set up correctly/);
  assert.equal((await failing({ fetch: async () => new Response("", { status: 429 }) })).status, 429);
  assert.match((await failing({ fetch: async () => new Response("", { status: 500 }) })).userMessage, /unavailable/);
  assert.match((await failing({ fetch: async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); } })).userMessage, /took too long/);
  assert.match((await failing({ fetch: async () => new Response("not json") })).userMessage, /could not be read/);

  // The daily budget is checked before any request is made.
  let requested = false;
  const spent = await failing({ spend: async () => { throw new FakeBudgetError("spent"); }, fetch: async () => { requested = true; } });
  assert.equal(spent.status, 429);
  assert.match(spent.userMessage, /today's limit for the trip assistant/);
  assert.equal(requested, false);
});

// ── Place resolution ──

test("places come from chosen chips, then saved places, then search", async () => {
  const { resolvePlace } = load("lib/assistant/places.ts");
  const searches = [];
  const search = (results) => async (query) => { searches.push(query); return { ok: true, results }; };
  const dhanmondi = { label: "Dhanmondi, Dhaka", lat: 23.74, lng: 90.37 };
  const work = { label: "Gulshan Avenue, Dhaka", lat: 23.79, lng: 90.41 };

  assert.deepEqual(
    await resolvePlace("  Dhanmondi ", { resolvedPlaces: { dhanmondi }, search: search([]) }),
    { status: "ok", place: dhanmondi, alternatives: [], guessed: false },
  );
  // "my office" finds the saved place labelled "Work" without a search.
  assert.equal((await resolvePlace("my office", { savedPlaces: [{ label: "Work", place: work }], search: search([]) })).place, work);
  assert.equal(searches.length, 0);

  const clear = await resolvePlace("Gulshan", { search: search([{ ...work, importance: 0.6 }, { label: "Gulshan Lake", lat: 23.8, lng: 90.42, importance: 0.3 }]) });
  assert.equal(clear.status, "ok");
  assert.equal(clear.guessed, true);
  assert.equal(clear.alternatives.length, 1);

  const close = await resolvePlace("Kings Cross", { search: search([
    { label: "Kings Cross, Haddenham", lat: 51.7, lng: -0.9, importance: 0.41 },
    { label: "King's Cross, London", lat: 51.53, lng: -0.12, importance: 0.38 },
  ]) });
  assert.equal(close.status, "choice");
  assert.equal(close.options.length, 2);

  // An area among shops and lakes with close scores: the area is meant.
  const area = await resolvePlace("Dhanmondi", { search: search([
    { label: "gp center, dhanmondi", lat: 23.74, lng: 90.37, importance: 0.2, type: "commercial" },
    { label: "ধানমন্ডি, ঢাকা", lat: 23.746, lng: 90.374, importance: 0.19, type: "suburb" },
    { label: "Dhanmondi Lake", lat: 23.745, lng: 90.376, importance: 0.18, type: "water" },
  ]) });
  assert.equal(area.status, "ok");
  assert.equal(area.place.label, "ধানমন্ডি, ঢাকা");
  assert.equal(area.alternatives.length, 2);

  // A result named exactly as typed wins over a close one ("West Dhanmondi").
  const named = await resolvePlace("ধানমন্ডি", { search: search([
    { label: "ধানমন্ডি, ঢাকা", lat: 23.746, lng: 90.374, importance: 0.3, type: "suburb" },
    { label: "পশ্চিম ধানমন্ডি, ঢাকা", lat: 23.75, lng: 90.36, importance: 0.29, type: "neighbourhood" },
  ]) });
  assert.equal(named.status, "ok");
  assert.equal(named.place.label, "ধানমন্ডি, ঢাকা");

  // A station and the shops inside it are one place to drive to.
  const station = await resolvePlace("Waterloo station", { search: search([
    { label: "Pret A Manger, Waterloo Station", lat: 51.5031, lng: -0.1132, importance: 0.2 },
    { label: "Waterloo Station, The Balcony", lat: 51.5033, lng: -0.1128, importance: 0.19 },
    { label: "Whistlestop, Station Approach Road", lat: 51.5029, lng: -0.1135, importance: 0.19 },
  ]) });
  assert.equal(station.status, "ok");

  // The same label twice is offered once.
  const twice = await resolvePlace("New Market", { search: search([
    { label: "New Market, Mirpur Road", lat: 23.733, lng: 90.384, importance: 0.3 },
    { label: "New Market, Mirpur Road", lat: 23.734, lng: 90.385, importance: 0.3 },
    { label: "New Market, Keraniganj", lat: 23.7, lng: 90.4, importance: 0.29 },
  ]) });
  assert.deepEqual(twice.options.map((option) => option.label), ["New Market, Mirpur Road", "New Market, Keraniganj"]);

  assert.deepEqual(await resolvePlace("Nowhere", { search: search([]) }), { status: "none" });
  assert.deepEqual(await resolvePlace("x", { search: async () => ({ ok: false, message: "Too many place searches." }) }), { status: "error", message: "Too many place searches." });
});

// ── Tools ──

const ROUTES = [
  { id: "route-1", rank: 1, distanceKm: 8.7, durationMin: 9, coords: [], legs: [] },
  { id: "route-2", rank: 2, distanceKm: 9.3, durationMin: 10, coords: [], legs: [] },
];
const option = (displayName, mid, overrides = {}) => ({
  provider: displayName.toLowerCase(), vehicleType: "car", displayName, maxPassengers: 4, comfortScore: 3, eligible: true,
  fare: { low: mid - 10, mid, high: mid + 10 }, fareSource: "rate_card", ranking: null, ...overrides,
});
const FARES = {
  success: true,
  country: "BD",
  trafficUnavailable: true,
  weather: { severityBand: "low", kind: "current" },
  results: [
    option("Bike", 100, { comfortScore: 2, maxPassengers: 1, ranking: { rank: 3 } }),
    option("Go", 200, { comfortScore: 4, ranking: { rank: 2 } }),
    option("Premier", 350, { comfortScore: 5, ranking: { rank: 1 } }),
    option("XL", 400, { comfortScore: 4, maxPassengers: 8, ranking: { rank: 4 } }),
    option("Tiny", 90, { eligible: false, maxPassengers: 1 }),
  ],
};

function toolContext({ search, planRoutes, getFares } = {}) {
  const events = [];
  const calls = { plan: [], fares: [] };
  const context = {
    country: "BD",
    defaultPassengers: 2,
    savedPlaces: [{ label: "Home", place: { label: "Home address, Dhaka", lat: 23.75, lng: 90.38 } }],
    state: { resolvedPlaces: {}, currentTrip: null },
    emit: (event) => events.push(event),
    deps: {
      searchPlaces: search ?? (async (query) => ({ ok: true, results: [{ label: `${query}, Dhaka`, lat: 23.79, lng: 90.41, importance: 0.5 }] })),
      planRoutes: async (payload) => { calls.plan.push(payload); return planRoutes ? planRoutes(payload) : { status: 200, body: { success: true, data: { routes: ROUTES, tripHistoryId: "trip-1" } } }; },
      getFares: async (tripHistoryId, routeId) => { calls.fares.push([tripHistoryId, routeId]); return getFares ? getFares() : { status: 200, body: FARES }; },
    },
  };
  return { context, events, calls };
}

const tools = () => load("lib/assistant/tools.ts");

test("plan_trip plans, prices, and shows the result as a card", async () => {
  const { runTool } = tools();
  const { context, events, calls } = toolContext();

  const outcome = await runTool({ name: "plan_trip", arguments: { origin: "home", destination: "Gulshan", preference: "cheapest" } }, context);

  // "home" was a saved place; the default passenger count applied; leaving now.
  assert.deepEqual(calls.plan[0].origin, { label: "Home address, Dhaka", lat: 23.75, lng: 90.38 });
  assert.equal(calls.plan[0].passengerCount, 2);
  assert.equal(calls.plan[0].departureMode, "now");
  assert.deepEqual(calls.fares, [["trip-1", "route-1"]]);

  const card = events.find((event) => event.type === "card").card;
  assert.equal(card.kind, "trip");
  assert.deepEqual(card.rides.map((ride) => ride.displayName), ["Bike", "Go", "Premier"]);
  assert.deepEqual(card.rides[0].tags, ["Cheapest"]);
  assert.deepEqual(card.rides[2].tags, ["Best overall", "Most comfortable"]);
  assert.equal(card.rides[0].fareText, "৳90–110");
  assert.equal(card.rides[0].sourceLabel, "Rate-card estimate");
  assert.equal(card.unavailable[0].displayName, "Tiny");
  assert.ok(card.notes.includes("Fares are estimates, not quotes."));
  assert.equal(context.state.currentTrip.tripHistoryId, "trip-1");

  // The model gets a short summary, not the whole fare table.
  const summary = JSON.parse(outcome.content);
  assert.equal(summary.status, "ok");
  assert.equal(summary.rides_available, 4);
  assert.equal(summary.rides_shown_in_card.length, 3);
  assert.equal(outcome.stop, undefined);
});

test("a scheduled trip, stops and passengers reach the routes endpoint as the planner sends them", async () => {
  const { runTool } = tools();
  const { context, calls, events } = toolContext();

  await runTool({ name: "plan_trip", arguments: { origin: "Dhanmondi", destination: "Gulshan", stops: ["Mohakhali"], passengers: 3, leave_at: "2026-11-17T09:00" } }, context);

  assert.equal(calls.plan[0].departureMode, "scheduled");
  assert.equal(calls.plan[0].scheduledLocal, "2026-11-17T09:00");
  assert.equal(calls.plan[0].passengerCount, 3);
  assert.equal(calls.plan[0].stops[0].label, "Mohakhali, Dhaka");
  assert.equal(calls.plan[0].stops[0].dwellMinutes, 5);
  assert.equal(events.find((event) => event.type === "card").card.departureLabel, "Tue 17 Nov, 9:00 am");
});

test("an ambiguous place stops the turn and asks the user to pick", async () => {
  const { runTool } = tools();
  const { context, events, calls } = toolContext({
    search: async () => ({ ok: true, results: [
      { label: "Kings Cross, Haddenham", lat: 51.7, lng: -0.9, importance: 0.41 },
      { label: "King's Cross, London", lat: 51.53, lng: -0.12, importance: 0.4 },
    ] }),
  });

  const outcome = await runTool({ name: "plan_trip", arguments: { origin: "Kings Cross", destination: "Waterloo" } }, context);

  assert.match(outcome.stop.reply, /Which "Kings Cross"/);
  assert.equal(events[events.length - 1].card.kind, "place-choice");
  assert.equal(calls.plan.length, 0);
});

test("errors from the app are handed to the model to explain", async () => {
  const { runTool } = tools();

  const invalid = toolContext({ planRoutes: async () => ({ status: 400, body: { success: false, errors: { destination: "Origin and destination cannot be the same." } } }) });
  const result = JSON.parse((await runTool({ name: "plan_trip", arguments: { origin: "A", destination: "A" } }, invalid.context)).content);
  assert.deepEqual(result, { status: "error", message: "Origin and destination cannot be the same." });
  assert.equal(invalid.calls.fares.length, 0);

  const missing = toolContext({ search: async () => ({ ok: true, results: [] }) });
  assert.match(JSON.parse((await runTool({ name: "plan_trip", arguments: { origin: "Atlantis", destination: "Gulshan" } }, missing.context)).content).message, /No place called "Atlantis"/);

  const bad = toolContext();
  for (const args of [null, {}, { origin: "A" }, { origin: "A", destination: "B", passengers: 12 }, { origin: "A", destination: "B", leave_at: "tomorrow" }, { origin: "A", destination: "B", stops: Array(7).fill("x") }]) {
    assert.equal(JSON.parse((await runTool({ name: "plan_trip", arguments: args }, bad.context)).content).status, "error");
  }
  assert.equal(bad.calls.plan.length, 0);
  assert.match(JSON.parse((await runTool({ name: "book_ride", arguments: {} }, bad.context)).content).message, /Unknown tool/);
});

test("a place with a namesake far away is the one near the rest of the trip", async () => {
  const { runTool } = tools();
  const { context, calls } = toolContext({
    search: async (query) => ({ ok: true, results: query === "Banani"
      ? [{ label: "Banani, Sylhet", lat: 24.9, lng: 91.87, importance: 0.5 }, { label: "বনানী, ঢাকা", lat: 23.79, lng: 90.4, importance: 0.3 }]
      : [{ label: `${query}, Dhaka`, lat: 23.75, lng: 90.38, importance: 0.5 }] }),
  });

  await runTool({ name: "plan_trip", arguments: { origin: "Dhanmondi", destination: "Gulshan", stops: ["Banani"] } }, context);
  assert.equal(calls.plan[0].stops[0].label, "বনানী, ঢাকা");

  // On its own, with nothing to be near, the better-known one is kept.
  const { resolvePlace } = load("lib/assistant/places.ts");
  const alone = await resolvePlace("Banani", { search: async () => ({ ok: true, results: [{ label: "Banani, Sylhet", lat: 24.9, lng: 91.87, importance: 0.5 }, { label: "বনানী, ঢাকা", lat: 23.79, lng: 90.4, importance: 0.3 }] }) });
  assert.equal(alone.place.label, "Banani, Sylhet");
});

test("places found once are not searched again in a follow-up", async () => {
  const { runTool } = tools();
  const searched = [];
  const { context } = toolContext({
    search: async (query) => { searched.push(query); return { ok: true, results: [{ label: `${query === "Dhanmondi" ? "ধানমন্ডি" : query}, Dhaka`, lat: 23.75, lng: 90.37, importance: 0.5 }] }; },
  });

  await runTool({ name: "plan_trip", arguments: { origin: "Dhanmondi", destination: "Gulshan" } }, context);
  // The model plans again with the names the card showed.
  await runTool({ name: "plan_trip", arguments: { origin: "ধানমন্ডি", destination: "Gulshan", passengers: 4 } }, context);

  assert.deepEqual(searched, ["Dhanmondi", "Gulshan"]);
  assert.ok(Object.keys(context.state.resolvedPlaces).length <= 20);
});

test("get_fares switches route on the trip already planned", async () => {
  const { runTool } = tools();
  const { context, calls, events } = toolContext();

  assert.match(JSON.parse((await runTool({ name: "get_fares", arguments: { route_number: 2 } }, context)).content).message, /No trip has been planned/);

  await runTool({ name: "plan_trip", arguments: { origin: "Dhanmondi", destination: "Gulshan" } }, context);
  await runTool({ name: "get_fares", arguments: { route_number: 2, preference: "comfort" } }, context);

  assert.deepEqual(calls.fares[1], ["trip-1", "route-2"]);
  const card = events.filter((event) => event.type === "card").at(-1).card;
  assert.equal(card.routeId, "route-2");
  assert.equal(card.rides[0].displayName, "Premier");
  assert.match(JSON.parse((await runTool({ name: "get_fares", arguments: { route_number: 5 } }, context)).content).message, /has 2 routes/);
});

// ── A whole turn ──

const turnModule = () => load("lib/assistant/turn.ts");
const PROFILE = {
  country: "BD", defaultPassengers: 1, priority: "time",
  savedPlaces: [{ label: "Home", place: { label: "House 9, Road 4, Dhanmondi", lat: 23.75, lng: 90.38 } }],
};

test("a turn runs the tool the model asks for, then replies", async () => {
  const { runAssistantTurn } = turnModule();
  const { context: { deps } } = toolContext();
  const prompts = [];
  const answers = [
    { content: "", toolCalls: [{ name: "plan_trip", arguments: { origin: "home", destination: "Gulshan" } }], usage: { input: 900, output: 30 } },
    { content: "**Route 1** is fastest; Bike is cheapest at ৳90–110.", toolCalls: [], usage: { input: 1500, output: 25 } },
  ];
  const events = [];

  const usage = await runAssistantTurn({
    history: [{ role: "user", content: "home to gulshan" }],
    context: {},
    profile: PROFILE,
    deps,
    chat: async ({ messages, tools }) => { prompts.push({ messages: structuredClone(messages), tools }); return answers.shift(); },
    emit: (event) => events.push(event),
    now: new Date("2026-11-16T10:00:00Z"),
  });

  assert.deepEqual(events.map((event) => event.type), ["status", "status", "status", "status", "card", "context", "reply", "suggestions", "context"]);
  assert.equal(events.find((event) => event.type === "reply").text, "Route 1 is fastest; Bike is cheapest at ৳90–110.");
  assert.equal(events.at(-1).context.currentTrip.tripHistoryId, "trip-1");
  assert.deepEqual(usage.usage, { calls: 2, input: 2400, output: 55 });

  // The tool result goes back to the model as a tool message.
  const second = prompts[1].messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.equal(second.at(-1).role, "tool");
  assert.equal(second.at(-1).tool_name, "plan_trip");

  // The prompt names saved places by label only — never their addresses.
  const system = prompts[0].messages[0].content;
  assert.match(system, /"Home"/);
  assert.doesNotMatch(system, /House 9|Road 4/);
  assert.match(system, /Bangladesh/);
  assert.match(system, /2026-11-16 16:00/);
  assert.deepEqual(prompts[0].tools.map((tool) => tool.function.name), ["plan_trip", "get_fares"]);
});

test("a turn stops after four model calls, and a choice ends it without one", async () => {
  const { runAssistantTurn, MAX_MODEL_CALLS } = turnModule();
  const loop = toolContext();
  let calls = 0;
  const events = [];

  await runAssistantTurn({
    history: [{ role: "user", content: "go" }],
    context: {},
    profile: PROFILE,
    deps: loop.context.deps,
    chat: async () => { calls += 1; return { content: "", toolCalls: [{ name: "get_fares", arguments: { route_number: 1 } }], usage: { input: 1, output: 1 } }; },
    emit: (event) => events.push(event),
  });
  assert.equal(calls, MAX_MODEL_CALLS);
  assert.ok(events.some((event) => event.type === "reply"));

  const choice = toolContext({ search: async () => ({ ok: true, results: [
    { label: "A1", lat: 23.7, lng: 90.4, importance: 0.5 }, { label: "A2", lat: 23.71, lng: 90.41, importance: 0.49 },
  ] }) });
  let choiceCalls = 0;
  const choiceEvents = [];
  await runAssistantTurn({
    history: [{ role: "user", content: "A to B" }],
    context: {},
    profile: PROFILE,
    deps: choice.context.deps,
    chat: async () => { choiceCalls += 1; return { content: "", toolCalls: [{ name: "plan_trip", arguments: { origin: "A", destination: "B" } }], usage: { input: 1, output: 1 } }; },
    emit: (event) => choiceEvents.push(event),
  });
  assert.equal(choiceCalls, 1);
  assert.match(choiceEvents.find((event) => event.type === "reply").text, /Which "A"/);
});

test("replies are plain, short, and free of tool-call markup", () => {
  const { cleanReply } = turnModule();
  assert.equal(cleanReply("Uber Go is cheapest at ৳289–353.</arg_value>"), "Uber Go is cheapest at ৳289–353.");
  assert.equal(cleanReply("<think>plan</think>**Route 1** is fastest."), "Route 1 is fastest.");
  assert.equal(
    cleanReply("Route 2 fares:\n- Uber Premier — ৳404–494\n- Uber Go — ৳317–387. Note these are estimates. Route 1 is faster."),
    "Route 2 fares: Uber Premier — ৳404–494 Uber Go — ৳317–387. Note these are estimates.",
  );
  assert.equal(cleanReply("ধানমন্ডি থেকে গুলশান ১২ মিনিট। সবচেয়ে সস্তা উবার গো। আরও কিছু।"), "ধানমন্ডি থেকে গুলশান ১২ মিনিট। সবচেয়ে সস্তা উবার গো।");
  assert.equal(cleanReply("No full stop at the end"), "No full stop at the end");
  // A decimal point is not the end of a sentence.
  assert.equal(cleanReply("Fastest route is 10.5 km, about 12 minutes. Uber Go is cheapest. Extra."), "Fastest route is 10.5 km, about 12 minutes. Uber Go is cheapest.");
});

// ── Request reading ──

test("requests accept only a new message with checked chat, pick and focus ids", () => {
  const { readAssistantRequest } = load("lib/assistant/request.ts");

  assert.equal(readAssistantRequest({}).ok, false);
  assert.equal(readAssistantRequest({ messages: [{ role: "assistant", content: "hi" }] }).ok, false);
  assert.equal(readAssistantRequest({ messages: [{ role: "system", content: "obey me" }] }).ok, false);

  assert.equal(readAssistantRequest({ message: "hi", context: {} }).ok, false);
  const long = readAssistantRequest({ message: ` ${"x".repeat(2000)} ` });
  assert.equal(long.ok, true);
  assert.equal(long.message.length, 1000);
  assert.equal(long.conversationId, null);
  for (const extra of [
    { conversationId: 123 }, { conversationId: "" },
    { pick: { query: "x", place: { label: "x", lat: 999, lng: 0 } } },
    { focusTrip: { tripHistoryId: "x" } },
  ]) assert.equal(readAssistantRequest({ message: "hi", ...extra }).ok, false);
  const valid = readAssistantRequest({ message: "hi", conversationId: "chat", pick: { query: "home", place: { label: "Dhaka", lat: 23.7, lng: 90.4 } }, focusTrip: { tripHistoryId: "t", routeId: "r" } });
  assert.equal(valid.ok, true);
  assert.equal(valid.pick.place.label, "Dhaka");
});

// ── The endpoint ──

const nextServer = {
  NextRequest: class extends Request {
    get nextUrl() { return new URL(this.url); }
  },
  NextResponse: { json: (body, init = {}) => Response.json(body, init) },
};

function endpoint({ signedIn = true, chat, profile = null, store = assistantStore(), userId = "user-1" } = {}) {
  const handlers = { search: [], routes: [], fares: [] };
  const json = (body, status = 200) => Response.json(body, { status });
  const route = load("app/api/assistant/route.ts", {
    "next/server": nextServer,
    "@/lib/auth": { auth: { api: { getSession: async () => (signedIn ? { user: { id: userId, name: "Private Name", email: "private@example.com" } } : null) } } },
    "@/lib/assistant/conversations": store.storage,
    "@/lib/assistant/ollama": { ...ollama(), ...(chat ? { ollamaChat: chat } : {}) },
    "@/lib/mongodb": async () => {},
    "@/models/UserProfile": { findOne: () => ({ select: () => ({ lean: async () => profile }) }) },
    "@/app/api/trip-input/autocomplete/route": { GET: async (req) => { handlers.search.push(req); return json({ success: true, data: [{ label: "Gulshan, Dhaka", lat: 23.79, lng: 90.41, importance: 0.6 }] }); } },
    "@/app/api/trip-input/routes/route": { POST: async (req) => { handlers.routes.push(req); return json({ success: true, data: { routes: ROUTES, tripHistoryId: "trip-1" } }); } },
    "@/app/api/fares/route": { POST: async (req) => { handlers.fares.push(req); return json(FARES); } },
    ...budget(),
  });
  return { POST: route.POST, handlers, store };
}

const post = (handler, body, cookie = "session=abc", signal) =>
  handler.POST(new nextServer.NextRequest("http://localhost/api/assistant", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body), signal }));

async function events(response) {
  return (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
}

test("the endpoint needs a key and a session, and checks its input", async () => {
  const previous = process.env.OLLAMA_API_KEY;
  try {
    delete process.env.OLLAMA_API_KEY;
    assert.equal((await post(endpoint(), { message: "hi" })).status, 503);

    process.env.OLLAMA_API_KEY = "test-key";
    assert.equal((await post(endpoint({ signedIn: false }), { message: "hi" })).status, 401);
    assert.equal((await post(endpoint(), { messages: [] })).status, 400);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous;
  }
});

test("the endpoint streams a full answer using the app's own endpoints, with the user's session", async () => {
  const previous = { key: process.env.OLLAMA_API_KEY, fetch: globalThis.fetch };
  const sent = [];
  const answers = [
    { message: { content: "", tool_calls: JSON.stringify([{ function: { name: "plan_trip", arguments: { origin: "Gulshan", destination: "Gulshan 2" } } }]) }, prompt_eval_count: 800, eval_count: 20 },
    { message: { content: "Route 1 is quickest.", tool_calls: [] }, prompt_eval_count: 1200, eval_count: 10 },
  ];
  process.env.OLLAMA_API_KEY = "test-key";
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(answers.shift()) + "\n"); };

  try {
    const api = endpoint({ profile: { country: "BD", defaultPassengerCount: 2, savedPlaces: [] } });
    const response = await post(api, { message: "Gulshan to Gulshan 2" });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /ndjson/);
    const stream = await events(response);
    assert.deepEqual(stream.map((event) => event.type).filter((type) => !["status", "context", "delta"].includes(type)), ["conversation", "card", "reply", "suggestions", "done"]);
    assert.equal(api.store.docs[0].messages.length, 2);
    assert.equal(stream.find((event) => event.type === "card").card.passengers, 2);

    // Place search, routes and fares were the app's endpoints, called as this user.
    assert.equal(api.handlers.search.length, 2);
    assert.equal(api.handlers.search[0].headers.get("cookie"), "session=abc");
    assert.equal(new URL(api.handlers.search[0].url).searchParams.get("country"), "BD");
    assert.equal(api.handlers.routes.length, 1);
    assert.equal(api.handlers.fares.length, 1);
    assert.equal(api.handlers.routes[0].headers.get("cookie"), "session=abc");

    // The user's name and email never reach the model.
    assert.doesNotMatch(JSON.stringify(sent), /Private Name|private@example\.com|user-1/);
  } finally {
    process.env.OLLAMA_API_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
});

test("model failures arrive as an error event, and each account is limited", async () => {
  const previous = { key: process.env.OLLAMA_API_KEY, fetch: globalThis.fetch };
  process.env.OLLAMA_API_KEY = "test-key";
  globalThis.fetch = async () => new Response("", { status: 503 });

  try {
    const api = endpoint();
    const first = await events(await post(api, { message: "hi" }));
    assert.deepEqual(first.map((event) => event.type), ["conversation", "status", "error", "done"]);
    assert.match(first[2].message, /unavailable/);
    assert.equal(api.store.docs[0].messages[1].error, true);

    for (let count = 1; count < 6; count += 1) {
      await events(await post(api, { message: "hi" }));
    }
    const limited = await post(api, { message: "hi" });
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).message, /quickly/);
  } finally {
    process.env.OLLAMA_API_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
});

test("streaming parses split UTF-8, string tool calls and a final line without a newline", async () => {
  const { ollamaChat } = ollama();
  const encoder = new TextEncoder();
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }));
  const deltas = [];
  const pending = ollamaChat({ messages: [], tools: [], onDelta: (text) => deltas.push(text) }, {
    env: { OLLAMA_API_KEY: "test" }, fetch: async () => response,
  });
  const bytes = encoder.encode(JSON.stringify({ message: { content: "ঢাকা " } }) + "\n");
  const split = bytes.indexOf(0xe0) + 1;
  controller.enqueue(bytes.slice(0, split));
  controller.enqueue(bytes.slice(split));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(deltas, ["ঢাকা "]); // Visible while the response is still open.
  controller.enqueue(encoder.encode(JSON.stringify({ message: { content: "trip", tool_calls: JSON.stringify([{ function: { name: "get_fares", arguments: '{"route_number":2}' } }]) }, done: true, prompt_eval_count: 100, eval_count: 20 })));
  controller.close();
  const result = await pending;
  assert.equal(result.content, "ঢাকা trip");
  assert.deepEqual(result.toolCalls, [{ name: "get_fares", arguments: { route_number: 2 } }]);
  assert.deepEqual(result.usage, { input: 100, output: 20 });
});

test("Stop aborts an active model stream and an already stopped turn makes no provider call", async () => {
  const { ollamaChat, AssistantStopped } = ollama();
  const controller = new AbortController();
  let spent = 0;
  let cancelled = false;
  const pending = ollamaChat({ messages: [], tools: [], onDelta() {}, signal: controller.signal }, {
    env: { OLLAMA_API_KEY: "test" }, spend: async () => { spent++; },
    fetch: async (_url, init) => new Response(new ReadableStream({
      start(stream) { init.signal.addEventListener("abort", () => stream.error(new DOMException("Aborted", "AbortError")), { once: true }); },
      cancel() { cancelled = true; },
    })),
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, AssistantStopped);
  assert.equal(spent, 1);
  await assert.rejects(ollamaChat({ messages: [], tools: [], signal: controller.signal }, {
    env: { OLLAMA_API_KEY: "test" }, spend: async () => { spent++; },
  }), AssistantStopped);
  assert.equal(spent, 1);
  // An errored stream is already closed; no additional cancel is necessary.
  assert.equal(cancelled, false);
});

test("text preceding a tool call is reset and completed tool context survives a model failure", async () => {
  const { runAssistantTurn } = turnModule();
  const { context } = toolContext();
  const seen = [];
  let call = 0;
  await assert.rejects(runAssistantTurn({
    history: [{ role: "user", content: "home to Gulshan" }], context: {}, profile: PROFILE, deps: context.deps,
    chat: async ({ onDelta }) => {
      if (call++ > 0) throw new Error("model failed");
      onDelta("Checking…");
      return { content: "Checking…", toolCalls: [{ name: "plan_trip", arguments: { origin: "home", destination: "Gulshan" } }], usage: { input: 1, output: 1 } };
    }, emit: (event) => seen.push(event),
  }), /model failed/);
  assert.ok(seen.findIndex((event) => event.type === "reset") > seen.findIndex((event) => event.type === "delta"));
  assert.equal(seen.at(-1).type, "context");
  assert.equal(seen.at(-1).context.currentTrip.tripHistoryId, "trip-1");
});

test("suggested next steps match the card, skip repeats and fill Add a stop", async () => {
  const { context, events: seen } = toolContext();
  await tools().runTool({ name: "plan_trip", arguments: { origin: "home", destination: "Gulshan" } }, context);
  const card = seen.find((event) => event.type === "card").card;
  const { suggestNextSteps } = load("lib/assistant/followups.ts");
  assert.deepEqual(suggestNextSteps(null, []), []);
  const first = suggestNextSteps(card, []);
  assert.equal(first.length, 4);
  assert.ok(first.some((item) => item.label === "Cheapest ride"));
  // "Add a stop…" is always offered, last.
  assert.equal(first.at(-1).label, "Add a stop…");
  assert.equal(suggestNextSteps({ ...card, stops: Array(6).fill(card.origin) }, []).some((item) => item.fill), false);
  const history = first.map((item) => ({ role: "user", content: item.message.toUpperCase() }));
  // Once the first three have been asked, the next one surfaces.
  const next = suggestNextSteps(card, history);
  assert.deepEqual(next.map((item) => item.label), ["Return trip", "Add a stop…"]);
  const all = suggestNextSteps(card, [...history, { role: "user", content: next[0].message }]);
  assert.deepEqual(all, [{ label: "Add a stop…", message: "Add a stop at ", fill: true }]);
  const scheduled = suggestNextSteps({ ...card, routes: [card.routes[0]], preference: "cheapest", departureLabel: "Tomorrow" }, []);
  assert.deepEqual(scheduled.map((item) => item.label), ["Return trip", "Add a stop…"]);
});

test("saved chat follow-ups use server history and context after a reload", async () => {
  const previous = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = "test";
  try {
    let calls = 0;
    const api = endpoint({ profile: PROFILE, chat: async ({ messages }) => {
      const latest = messages.at(-1);
      if (latest.role === "tool") return { content: "Here are the rides.", toolCalls: [], usage: { input: 1, output: 1 } };
      if (calls++ === 0) return { content: "", toolCalls: [{ name: "plan_trip", arguments: { origin: "home", destination: "Gulshan" } }], usage: { input: 1, output: 1 } };
      assert.ok(messages.some((message) => message.content === "Home to Gulshan"));
      assert.match(messages[0].content, /Current trip:.*Gulshan/);
      return { content: "", toolCalls: [{ name: "get_fares", arguments: { route_number: 2 } }], usage: { input: 1, output: 1 } };
    } });
    const first = await events(await post(api, { message: "Home to Gulshan" }));
    const id = first[0].id;
    const second = await events(await post(api, { conversationId: id, message: "Show route 2" }));
    assert.equal(second.find((event) => event.type === "card").card.routeId, "route-2");
    assert.equal(api.store.docs.length, 1);
    assert.equal(api.store.docs[0].messages.length, 4);
    assert.equal(api.handlers.routes.length, 1);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous;
  }
});

test("foreign chats, another country, full chats and forged focus trips are rejected before the model", async () => {
  const previous = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = "test";
  try {
    const store = assistantStore();
    const own = await store.storage.createChat("user-1", "BD", "own");
    const foreign = await store.storage.createChat("other", "BD", "secret");
    const uk = await store.storage.createChat("user-1", "UK", "UK");
    const api = endpoint({ store, chat: async () => { throw new Error("must not call model"); } });
    for (const [extra, status] of [
      [{ conversationId: foreign.id }, 404], [{ conversationId: uk.id }, 409],
      [{ focusTrip: { tripHistoryId: "fake", routeId: "fake" } }, 400],
      [{ conversationId: own.id, focusTrip: { tripHistoryId: "fake", routeId: "fake" } }, 400],
      [{ pick: { query: "home", place: { label: "London", lat: 51.5, lng: -0.1 } } }, 400],
    ]) assert.equal((await post(api, { message: "hi", ...extra })).status, status);
    store.docs.find((doc) => doc._id === own.id).messages = Array.from({ length: 50 }, () => ({ role: "user", text: "hi", cards: [] }));
    assert.equal((await post(api, { message: "hi", conversationId: own.id })).status, 409);
    assert.equal(store.docs.length, 3);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous;
  }
});

test("a validated place pick is remembered with the chat, and Stop is persisted", async () => {
  const previous = process.env.OLLAMA_API_KEY;
  process.env.OLLAMA_API_KEY = "test";
  try {
    const controller = new AbortController();
    const api = endpoint({ chat: async () => {
      controller.abort();
      throw new Error("aborted");
    } });
    const pick = { query: "my stop", place: { label: "Dhaka", lat: 23.7, lng: 90.4 } };
    const stream = await events(await post(api, { message: "use this", pick }, "session=abc", controller.signal));
    const chat = await api.store.storage.loadChat("user-1", stream[0].id);
    assert.deepEqual(chat.context.resolvedPlaces.stop, pick.place);
    assert.equal(chat.messages[1].text, "Stopped.");
    assert.equal(chat.messages[1].error, true);
    assert.equal(api.store.storage.chatHistory(chat.messages).some((message) => message.content === "Stopped."), false);
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY; else process.env.OLLAMA_API_KEY = previous;
  }
});

// ── Placement ──

test("the chat button is on every signed-in page and keeps clear of the map", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  assert.match(read("app/(main)/layout.tsx"), /\{session && <AssistantLauncher \/>\}/);
  const launcher = read("components/assistant/AssistantLauncher.tsx");
  assert.match(launcher, /if \(!assistant\) return null;/);
  assert.match(launcher, /fixed right-4 bottom-4/);
  // The route card sits above the button; the map credits move bottom-left.
  assert.match(read("components/layout/MapShell.tsx"), /lg:bottom-24/);
  assert.match(read("components/map/RouteMap.tsx"), /<AttributionControl position="bottomleft" \/>/);
  // The key is read on the server only.
  assert.doesNotMatch(launcher, /OLLAMA/);
  assert.doesNotMatch(read("components/assistant/AssistantCards.tsx"), /OLLAMA/);
});
