import "server-only";

import { budgetReachedMessage, ProviderBudgetError, spendProviderBudget } from "@/lib/provider-budget";

/**
 * The trip assistant's model calls, to Ollama Cloud's chat API.
 *
 * One call per step of the assistant's loop. Reply text streams immediately;
 * tools run once their arguments are complete. Each call is counted against
 * the daily `ollama` provider budget first.
 */

export type OllamaToolCall = {
  function: { name: string; arguments: Record<string, unknown> };
};

export type OllamaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: OllamaToolCall[] }
  | { role: "tool"; content: string; tool_name: string };

export type OllamaTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = {
  name: string;
  /** null when the model sent arguments that are not a JSON object. */
  arguments: Record<string, unknown> | null;
};

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
};

/** A failure the user can be told about, with the status to report it under. */
export class AssistantError extends Error {
  userMessage: string;
  status: number;

  constructor(userMessage: string, status = 503, cause?: unknown) {
    super(userMessage, { cause });
    this.name = "AssistantError";
    this.userMessage = userMessage;
    this.status = status;
  }
}

const DEFAULT_BASE_URL = "https://ollama.com/api";
const DEFAULT_MODEL = "glm-5.3-flash";
const CALL_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 600;

export function getOllamaConfig(env: Record<string, string | undefined> = process.env) {
  const base = (env.OLLAMA_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    apiKey: env.OLLAMA_API_KEY?.trim() ?? "",
    // Accepts the base with or without its /api suffix.
    url: base.endsWith("/api") ? `${base}/chat` : `${base}/api/chat`,
    model: env.OLLAMA_CHAT_MODEL?.trim() || DEFAULT_MODEL,
    // Reasoning first costs tokens and time; off unless asked for.
    think: env.OLLAMA_THINK?.trim().toLowerCase() === "true",
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return parseJsonObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The model's tool calls, whatever shape they arrived in.
 *
 * glm-5.3-flash on Ollama Cloud sometimes sends `tool_calls` as a JSON string
 * rather than an array (ollama/ollama#18506), and arguments can arrive as a
 * string too. Both are accepted; anything else is dropped rather than thrown.
 */
export function parseToolCalls(raw: unknown): ToolCall[] {
  let list: unknown = raw;

  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const fn = parseJsonObject(entry)?.function;
    const call = parseJsonObject(fn);
    const name = typeof call?.name === "string" ? call.name.trim() : "";

    return name ? [{ name, arguments: parseJsonObject(call?.arguments) }] : [];
  });
}

type ChatDeps = {
  fetch?: typeof fetch;
  spend?: typeof spendProviderBudget;
  env?: Record<string, string | undefined>;
};

/** The user pressed Stop: the turn ends quietly, with nothing to report. */
export class AssistantStopped extends Error {
  constructor() {
    super("Stopped by the user");
    this.name = "AssistantStopped";
  }
}

type ChatChunk = {
  message?: { content?: unknown; tool_calls?: unknown };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  error?: unknown;
};

/**
 * One model call. With `onDelta` the reply is streamed and each piece of text
 * is handed over as it arrives; tool calls and token counts come at the end
 * either way. `signal` is the user's Stop: aborting it ends the call with
 * AssistantStopped rather than an error.
 */
export async function ollamaChat(
  { messages, tools, onDelta, signal }: {
    messages: OllamaMessage[];
    tools: OllamaTool[];
    onDelta?: (text: string) => void;
    signal?: AbortSignal;
  },
  { fetch: doFetch = fetch, spend = spendProviderBudget, env = process.env }: ChatDeps = {},
): Promise<ChatResult> {
  const config = getOllamaConfig(env);

  if (!config.apiKey) {
    throw new AssistantError("The trip assistant is not set up on this server.", 503);
  }
  if (signal?.aborted) throw new AssistantStopped();

  try {
    await spend("ollama");
  } catch (error) {
    if (error instanceof ProviderBudgetError) {
      throw new AssistantError(budgetReachedMessage("the trip assistant"), 429, error);
    }
    throw error;
  }

  const stream = typeof onDelta === "function";
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  const failed = (error: unknown): never => {
    if (signal?.aborted) throw new AssistantStopped();
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AssistantError(
      timedOut ? "The trip assistant took too long to answer. Please try again." : "The trip assistant could not be reached. Please try again.",
      504,
      error,
    );
  };

  let response: Response;

  try {
    response = await doFetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages,
        tools,
        stream,
        think: config.think,
        options: { num_predict: MAX_OUTPUT_TOKENS, temperature: 0.2 },
      }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (error) {
    return failed(error);
  }

  if (!response.ok) {
    const status = response.status;
    throw new AssistantError(
      status === 401 || status === 403
        ? "The trip assistant is not set up correctly on this server."
        : status === 429
          ? "The trip assistant is busy right now. Please try again in a minute."
          : "The trip assistant is unavailable right now. Please try again.",
      status === 429 ? 429 : 503,
      new Error(`Ollama responded ${status}`),
    );
  }

  const unreadable = (error?: unknown) =>
    new AssistantError("The trip assistant sent an answer that could not be read. Please try again.", 502, error);

  if (!stream) {
    let body: ChatChunk;
    try {
      body = await response.json();
    } catch (error) {
      throw unreadable(error);
    }
    return {
      content: typeof body.message?.content === "string" ? body.message.content : "",
      toolCalls: parseToolCalls(body.message?.tool_calls),
      usage: { input: Number(body.prompt_eval_count) || 0, output: Number(body.eval_count) || 0 },
    };
  }

  // Newline-delimited JSON, one chunk per line; the last carries the counts.
  const reader = response.body?.getReader();
  if (!reader) throw unreadable();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: ToolCall[] = [];
  const usage = { input: 0, output: 0 };

  const handle = (line: string) => {
    if (!line.trim()) return;
    let chunk: ChatChunk;
    try {
      chunk = JSON.parse(line);
    } catch (error) {
      throw unreadable(error);
    }
    if (chunk.error) throw new AssistantError("The trip assistant is unavailable right now. Please try again.", 503, new Error(String(chunk.error)));
    const text = chunk.message?.content;
    if (typeof text === "string" && text) {
      content += text;
      onDelta(text);
    }
    toolCalls.push(...parseToolCalls(chunk.message?.tool_calls));
    if (chunk.prompt_eval_count !== undefined) usage.input = Number(chunk.prompt_eval_count) || 0;
    if (chunk.eval_count !== undefined) usage.output = Number(chunk.eval_count) || 0;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    handle(buffer + decoder.decode());
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    return failed(error);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  return { content, toolCalls, usage };
}
