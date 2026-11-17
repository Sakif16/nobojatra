import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isConfigured } from "@/lib/env";
import { reportFailure, withRequestLogging } from "@/lib/error-reporting";
import { createRateLimiter, getRateLimitHeaders } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";
import { resolveCountry } from "@/lib/country-config";
import dbConnect from "@/lib/mongodb";
import UserProfile from "@/models/UserProfile";
import { AssistantError, AssistantStopped, ollamaChat } from "@/lib/assistant/ollama";
import { appendTurn, chatHistory, createChat, loadChat, tripFromCards, type LoadedChat } from "@/lib/assistant/conversations";
import { normalizePlaceQuery } from "@/lib/assistant/places";
import { isInsideServiceArea } from "@/lib/trip-input";
import { readAssistantRequest } from "@/lib/assistant/request";
import { runAssistantTurn, TURN_DEADLINE_MS } from "@/lib/assistant/turn";
import type { ToolDeps } from "@/lib/assistant/tools";
import { ASSISTANT_LIMITS, type AssistantCard, type AssistantContext, type AssistantEvent, type Suggestion } from "@/lib/assistant/types";
import { GET as placeSearchHandler } from "@/app/api/trip-input/autocomplete/route";
import { POST as routesHandler } from "@/app/api/trip-input/routes/route";
import { POST as faresHandler } from "@/app/api/fares/route";

/**
 * The trip assistant behind the chat button. See docs/AI_ASSISTANT_PLAN.md.
 *
 * Answers one user message as a stream of newline-delimited JSON events
 * (status, card, reply, context, error, done). The model only decides what to
 * do; places, routes and fares come from the app's own endpoints, called here
 * in-process with the user's own session so their checks, limits, cache and
 * trip-history records apply unchanged. Nothing is saved on the user's behalf
 * beyond what a planner search records; saving is left to the card buttons.
 */

// Process-local, like the other limiters: abuse dampening per account. The
// daily ceiling for the whole app is the `ollama` provider budget.
const perMinute = createRateLimiter({ windowMs: 60_000, max: 6 });
const perDay = createRateLimiter({ windowMs: 24 * 60 * 60_000, max: 40 });

// glm-5.3-flash on Ollama Cloud, per million tokens. Used only for the usage log.
const USD_PER_MILLION = { input: 0.15, output: 0.5 };

type SavedPlaceDoc = { label?: unknown; place?: { label?: unknown; lat?: unknown; lng?: unknown } };

async function callEndpoint(
  handler: (request: NextRequest) => Promise<Response>,
  url: URL,
  cookie: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new AssistantStopped();
  const request = new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const response = await handler(request);
  if (signal?.aborted) throw new AssistantStopped();
  let parsed: unknown = null;

  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  return { status: response.status, body: parsed };
}

function endpointDeps(req: NextRequest, country: string, signal: AbortSignal): ToolDeps {
  const cookie = req.headers.get("cookie") ?? "";
  const at = (path: string) => new URL(path, req.nextUrl.origin);

  return {
    async searchPlaces(query) {
      const url = at("/api/trip-input/autocomplete");
      url.searchParams.set("query", query);
      url.searchParams.set("country", country);
      const { status, body } = await callEndpoint(placeSearchHandler, url, cookie, undefined, signal);
      const value = body as { success?: boolean; data?: unknown; message?: unknown } | null;

      if (status !== 200 || !value?.success || !Array.isArray(value.data)) {
        return { ok: false, message: typeof value?.message === "string" ? value.message : "Place search is unavailable right now." };
      }
      return {
        ok: true,
        results: value.data.flatMap((item: { label?: unknown; lat?: unknown; lng?: unknown; importance?: unknown; type?: unknown }) =>
          typeof item.label === "string" && Number.isFinite(item.lat) && Number.isFinite(item.lng)
            ? [{ label: item.label, lat: Number(item.lat), lng: Number(item.lng), importance: Number(item.importance) || 0, type: typeof item.type === "string" ? item.type : undefined }]
            : []),
      };
    },
    planRoutes: (payload) => callEndpoint(routesHandler, at("/api/trip-input/routes"), cookie, payload, signal),
    getFares: (tripHistoryId, routeId) => callEndpoint(faresHandler, at("/api/fares"), cookie, { tripHistoryId, routeId }, signal),
  };
}

async function handlePost(req: NextRequest) {
  const startedAt = new Date();
  if (!isConfigured(process.env.OLLAMA_API_KEY)) {
    return NextResponse.json({ success: false, message: "The trip assistant is not set up on this server." }, { status: 503 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  const parsed = await readJsonObject<Record<string, unknown>>(req);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message }, { status: 400 });
  }
  const request = readAssistantRequest(parsed.body);
  if (!request.ok) {
    return NextResponse.json({ success: false, message: request.message }, { status: 400 });
  }

  for (const [limit, message] of [
    [perMinute, "You're sending messages quickly. Please wait a moment."],
    [perDay, "You've reached today's limit for the trip assistant. The planner still works as usual."],
  ] as const) {
    const result = limit(session.user.id);
    if (!result.allowed) {
      return NextResponse.json(
        { success: false, message },
        { status: 429, headers: { ...getRateLimitHeaders(result), "Retry-After": String(result.retryAfter) } },
      );
    }
  }

  await dbConnect();
  const profile = (await UserProfile.findOne({ userId: session.user.id })
    .select("country defaultPassengerCount defaultTravelPriority savedPlaces")
    .lean()) as { country?: unknown; defaultPassengerCount?: unknown; defaultTravelPriority?: unknown; savedPlaces?: SavedPlaceDoc[] } | null;
  const country = resolveCountry(profile?.country);
  const savedPlaces = (profile?.savedPlaces ?? []).flatMap((saved) =>
    typeof saved.label === "string" && typeof saved.place?.label === "string" && Number.isFinite(saved.place?.lat) && Number.isFinite(saved.place?.lng)
      ? [{ label: saved.label, place: { label: saved.place.label, lat: Number(saved.place.lat), lng: Number(saved.place.lng) } }]
      : []);
  const passengers = Number(profile?.defaultPassengerCount);

  const userId = session.user.id;
  const cancellation = new AbortController();
  const deadline = AbortSignal.timeout(TURN_DEADLINE_MS);
  const signal = AbortSignal.any([req.signal, cancellation.signal, deadline]);
  const deps = endpointDeps(req, country, signal);

  // The chat: an existing one of this user's, in this country, with room, or
  // a new one. A pick or a Refresh is checked before anything is created.
  if (request.pick && !isInsideServiceArea(request.pick.place, country)) {
    return NextResponse.json({ success: false, message: "That place is outside the area this app plans in." }, { status: 400 });
  }
  if (request.focusTrip && !request.conversationId) {
    return NextResponse.json({ success: false, message: "That trip is not in this chat." }, { status: 400 });
  }

  let chat: LoadedChat;
  if (request.conversationId) {
    const found = await loadChat(userId, request.conversationId);
    if (!found) {
      return NextResponse.json({ success: false, message: "That chat could not be found. Start a new chat." }, { status: 404 });
    }
    if (found.country !== country) {
      return NextResponse.json({ success: false, message: "This chat is from another country. Start a new chat." }, { status: 409 });
    }
    if (found.messages.length + 2 > ASSISTANT_LIMITS.messagesPerChat) {
      return NextResponse.json({ success: false, code: "chat_full", message: "This chat is full. Start a new chat." }, { status: 409 });
    }
    chat = found;
  } else {
    chat = await createChat(userId, country, request.message);
  }

  const context: AssistantContext = {
    resolvedPlaces: { ...chat.context.resolvedPlaces },
    currentTrip: chat.context.currentTrip ?? null,
  };
  if (request.pick) {
    context.resolvedPlaces![normalizePlaceQuery(request.pick.query)] = request.pick.place;
  }
  if (request.focusTrip) {
    const trip = tripFromCards(chat.messages, request.focusTrip.tripHistoryId, request.focusTrip.routeId);
    if (!trip) return NextResponse.json({ success: false, message: "That trip is not in this chat." }, { status: 400 });
    context.currentTrip = trip;
  }
  const history = [...chatHistory(chat.messages, ASSISTANT_LIMITS.messages - 1), { role: "user" as const, content: request.message }];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // After Stop the browser has gone; anything still emitted is dropped.
      const emit = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* the reader has gone */
        }
      };
      const shownCards: AssistantCard[] = [];
      let latestContext = context;
      const capture = (event: AssistantEvent) => {
        if (event.type === "card") shownCards.push(event.card);
        if (event.type === "context") latestContext = event.context;
        emit(event);
      };
      let stored: { text: string; cards: AssistantCard[]; suggestions: Suggestion[]; error: boolean } | null = null;

      emit({ type: "conversation", id: chat.id, title: chat.title });

      try {
        const result = await runAssistantTurn({
          history,
          context,
          profile: {
            country,
            defaultPassengers: Number.isInteger(passengers) && passengers >= 1 && passengers <= 8 ? passengers : 1,
            priority: typeof profile?.defaultTravelPriority === "string" ? profile.defaultTravelPriority : "time",
            savedPlaces,
          },
          deps,
          chat: (input) => ollamaChat(input),
          emit: capture,
          signal,
        });
        stored = { text: result.reply, cards: result.cards, suggestions: result.suggestions, error: false };
        latestContext = result.context;

        // Token counts only; never the messages.
        console.info(JSON.stringify({
          event: "assistant_usage",
          modelCalls: result.usage.calls,
          inputTokens: result.usage.input,
          outputTokens: result.usage.output,
          estimatedUsd: Number(((result.usage.input * USD_PER_MILLION.input + result.usage.output * USD_PER_MILLION.output) / 1_000_000).toFixed(6)),
        }));
      } catch (error) {
        if (deadline.aborted && !req.signal.aborted && !cancellation.signal.aborted) {
          const message = "The trip assistant took too long to answer. Please try again.";
          emit({ type: "error", message });
          stored = { text: message, cards: shownCards, suggestions: [], error: true };
        } else if (error instanceof AssistantStopped || req.signal.aborted || cancellation.signal.aborted) {
          stored = { text: "Stopped.", cards: shownCards, suggestions: [], error: true };
        } else if (error instanceof AssistantError) {
          if (error.status !== 429) reportFailure("assistant", "ollama", error.cause ?? error);
          emit({ type: "error", message: error.userMessage });
          stored = { text: error.userMessage, cards: shownCards, suggestions: [], error: true };
        } else {
          reportFailure("assistant", "ollama", error);
          const message = "The trip assistant ran into a problem. Please try again.";
          emit({ type: "error", message });
          stored = { text: message, cards: shownCards, suggestions: [], error: true };
        }
      } finally {
        // The turn is kept even when it failed or was stopped, so a reload
        // shows what happened. Errors are never sent to the model as history.
        if (stored) {
          try {
            const saved = await appendTurn(userId, chat.id, { user: request.message, startedAt, reply: stored, context: latestContext });
            if (!saved) emit({ type: "error", message: "This chat was deleted or filled by another tab. Start a new chat to continue." });
          } catch (error) {
            reportFailure("assistant", "mongodb", error);
            emit({ type: "error", message: "This answer could not be saved. Please try again before leaving the page." });
          }
        }
        emit({ type: "done" });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancellation.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export const POST = withRequestLogging("assistant", "ollama", handlePost);
