import type { CountryCode } from "@/lib/country-config";
import { AssistantStopped, type ChatResult, type OllamaMessage, type OllamaTool } from "@/lib/assistant/ollama";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import type { SavedPlace } from "@/lib/assistant/places";
import { runTool, TOOL_DEFINITIONS, type ToolDeps } from "@/lib/assistant/tools";
import { suggestNextSteps } from "@/lib/assistant/followups";
import type { AssistantCard, AssistantContext, AssistantEvent, AssistantMessage, Suggestion, TripCard } from "@/lib/assistant/types";

/**
 * One user message, answered.
 *
 * Asks the model what to do, runs the tools it asks for, and hands their
 * results back, until the model replies in words or the limits below are
 * reached. Cards and progress are emitted as they happen.
 */

export const MAX_MODEL_CALLS = 4;
export const MAX_TOOL_CALLS_PER_STEP = 2;
export const TURN_DEADLINE_MS = 45_000;
const MAX_REPLY_CHARS = 600;

export type TurnProfile = {
  country: CountryCode;
  defaultPassengers: number;
  priority: string;
  savedPlaces: SavedPlace[];
};

export type TurnUsage = { calls: number; input: number; output: number };

/** What a turn leaves behind, to be stored with the chat. */
export type TurnResult = {
  usage: TurnUsage;
  reply: string;
  cards: AssistantCard[];
  suggestions: Suggestion[];
  context: AssistantContext;
};

const MAX_REPLY_SENTENCES = 2;

/**
 * Plain text only, and short: the cards carry the detail.
 *
 * Drops reasoning blocks and stray tool-call markup (glm-5.3-flash sometimes
 * leaves fragments such as `</arg_value>` in its text), markdown emphasis,
 * headings and list bullets, then keeps the first two sentences — the model
 * does not always keep to the two-sentence rule it is given. Sentences end in
 * ".", "!", "?" or the Bangla "।".
 */
export function cleanReply(text: string) {
  const flat = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?[a-z_][a-z0-9_]*(\s[^>]*)?>/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*(#+|[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  // A sentence ends at punctuation followed by a space, so "10.5 km" and
  // "৳289.50" stay whole.
  const sentences = flat.split(/(?<=[.!?।])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const short = sentences.slice(0, MAX_REPLY_SENTENCES).join(" ") || flat;

  return short.length > MAX_REPLY_CHARS ? `${short.slice(0, MAX_REPLY_CHARS - 1).trimEnd()}…` : short;
}

export async function runAssistantTurn({
  history,
  context,
  profile,
  deps,
  chat,
  emit,
  now = new Date(),
  clock = Date.now,
  signal,
}: {
  history: AssistantMessage[];
  context: AssistantContext;
  profile: TurnProfile;
  deps: ToolDeps;
  chat: (input: { messages: OllamaMessage[]; tools: OllamaTool[]; onDelta?: (text: string) => void; signal?: AbortSignal }) => Promise<ChatResult>;
  emit: (event: AssistantEvent) => void;
  now?: Date;
  clock?: () => number;
  /** The user's Stop. */
  signal?: AbortSignal;
}): Promise<TurnResult> {
  const startedAt = clock();
  const state = {
    resolvedPlaces: { ...(context.resolvedPlaces ?? {}) },
    currentTrip: context.currentTrip ?? null,
  };
  const cards: AssistantCard[] = [];
  let lastTrip: TripCard | null = null;
  let choiceAsked = false;
  const track = (event: AssistantEvent) => {
    if (event.type === "card") {
      cards.push(event.card);
      if (event.card.kind === "trip") lastTrip = event.card;
      if (event.card.kind === "place-choice") choiceAsked = true;
    }
    emit(event);
  };
  const toolContext = {
    deps,
    country: profile.country,
    defaultPassengers: profile.defaultPassengers,
    savedPlaces: profile.savedPlaces,
    state,
    emit: track,
    signal,
  };

  const messages: OllamaMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        country: profile.country,
        now,
        defaultPassengers: profile.defaultPassengers,
        priority: profile.priority,
        savedPlaceLabels: profile.savedPlaces.map((place) => place.label),
        currentTrip: state.currentTrip,
      }),
    },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];
  const usage: TurnUsage = { calls: 0, input: 0, output: 0 };
  let reply: string | null = null;

  emit({ type: "status", text: "Thinking…" });

  while (usage.calls < MAX_MODEL_CALLS && reply === null) {
    if (signal?.aborted) throw new AssistantStopped();
    if (clock() - startedAt > TURN_DEADLINE_MS) break;

    // Reply text is shown as it is written. Text that turns out to precede a
    // tool call ("I'll check that…") was not the answer, and is withdrawn.
    let streamed = false;
    const result = await chat({
      messages,
      tools: TOOL_DEFINITIONS,
      signal,
      onDelta: (text) => {
        streamed = true;
        emit({ type: "delta", text });
      },
    });
    if (signal?.aborted) throw new AssistantStopped();
    if (streamed && result.toolCalls.length > 0) emit({ type: "reset" });
    usage.calls += 1;
    usage.input += result.usage.input;
    usage.output += result.usage.output;

    if (result.toolCalls.length === 0) {
      reply = cleanReply(result.content);
      break;
    }

    const calls = result.toolCalls.slice(0, MAX_TOOL_CALLS_PER_STEP);
    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: calls.map((call) => ({ function: { name: call.name, arguments: call.arguments ?? {} } })),
    });

    for (const call of calls) {
      if (signal?.aborted) throw new AssistantStopped();
      let outcome;
      try {
        outcome = await runTool(call, toolContext);
      } finally {
        // Keep places and any completed trip even if the next call fails or
        // the user stops before the final reply.
        emit({ type: "context", context: { resolvedPlaces: state.resolvedPlaces, currentTrip: state.currentTrip } });
      }
      if (signal?.aborted) throw new AssistantStopped();
      messages.push({ role: "tool", tool_name: call.name, content: outcome.content });
      if (outcome.stop) {
        reply = outcome.stop.reply;
        break;
      }
    }
  }

  const finalReply = reply || (cards.length > 0
    ? "Here is what I found."
    : "Sorry, I could not work that out. Try telling me where you are starting from and where you are going.");
  // The cleaned reply replaces whatever was streamed.
  emit({ type: "reply", text: finalReply });

  const suggestions = choiceAsked ? [] : suggestNextSteps(lastTrip, history);
  if (suggestions.length > 0) emit({ type: "suggestions", items: suggestions });

  const finalContext: AssistantContext = { resolvedPlaces: state.resolvedPlaces, currentTrip: state.currentTrip };
  emit({ type: "context", context: finalContext });

  return { usage, reply: finalReply, cards, suggestions, context: finalContext };
}
