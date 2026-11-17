"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, History, Loader2, MessageCircle, Plus, Send, Square, X } from "lucide-react";
import { useCountry } from "@/components/country/CountryProvider";
import { useServerFeatures } from "@/components/features/FeatureProvider";
import {
  ASSISTANT_LIMITS,
  type AssistantCard,
  type AssistantEvent,
  type ChatDetail,
  type ChatSummary,
  type ResolvedPlace,
  type StoredMessage,
  type Suggestion,
} from "@/lib/assistant/types";
import type { CountryCode } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { PlaceChoice, TripResult } from "./AssistantCards";
import ChatList from "./ChatList";

/**
 * The trip assistant's chat button and panel, on every signed-in page.
 *
 * Chats are stored on the server against the account (30 days), so opening
 * the panel resumes the latest one for the current country, on any device.
 * The panel sends only the new message and the chat id; the server keeps the
 * history. See docs/AI_ASSISTANT_V2_PLAN.md.
 */

type Entry =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; streaming?: boolean }
  /** `pricedAt` is set for cards restored from an earlier visit: their prices are a snapshot. */
  | { id: number; kind: "card"; card: AssistantCard; pricedAt: string | null }
  | { id: number; kind: "error"; text: string };

type SendExtras = {
  pick?: { query: string; place: ResolvedPlace };
  focusTrip?: { tripHistoryId: string; routeId: string };
};

const EXAMPLES: Record<CountryCode, [string, string]> = {
  BD: ["Dhanmondi", "Gulshan"],
  UK: ["St Pancras", "Waterloo station"],
  US: ["Times Square", "Central Park"],
};

let nextId = 1;

/** Reads newline-delimited JSON events from a streamed response. */
async function* readEvents(response: Response): AsyncGenerator<AssistantEvent> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          yield JSON.parse(line) as AssistantEvent;
        } catch {
          // A partial or garbled line is skipped; the rest of the answer still shows.
        }
      }
      newline = buffer.indexOf("\n");
    }
      if (done) break;
    }
    if (buffer.trim()) yield JSON.parse(buffer) as AssistantEvent;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** A stored chat, as the entries the panel shows. */
function toEntries(messages: StoredMessage[]): Entry[] {
  return messages.flatMap((message): Entry[] => {
    if (message.role === "user") return [{ id: nextId++, kind: "user", text: message.text }];
    const cards: Entry[] = message.cards.map((card) => ({ id: nextId++, kind: "card", card, pricedAt: message.createdAt }));
    const text: Entry[] = message.text
      ? [message.error ? { id: nextId++, kind: "error", text: message.text } : { id: nextId++, kind: "assistant", text: message.text }]
      : [];
    return [...cards, ...text];
  });
}

function lastSuggestions(messages: StoredMessage[]): Suggestion[] {
  const last = messages.at(-1);
  return last?.role === "assistant" && !last.error ? last.suggestions : [];
}

async function readError(response: Response, fallback: string) {
  const data = (await response.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? fallback;
}

export default function AssistantLauncher() {
  const { assistant } = useServerFeatures();
  const country = useCountry();
  const [open, setOpen] = useState(false);
  if (!assistant) return null;
  // Country changes replace the panel state and cancel its outstanding work
  // immediately, so one country's replies cannot land in another's chat.
  return <AssistantPanel key={country} country={country} open={open} setOpen={setOpen} />;
}

function AssistantPanel({ country, open, setOpen }: { country: CountryCode; open: boolean; setOpen: (open: boolean) => void }) {
  const [view, setView] = useState<"chat" | "list">("chat");
  const [chatId, setChatId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // The country whose latest chat has been loaded; another one means loading.
  const [loadedFor, setLoadedFor] = useState<CountryCode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadVersion = useRef(0);

  const loading = openingChat || (open && loadedFor !== country && !loadError);

  // Resume the latest chat for this country when the panel opens, and again
  // after a country switch.
  useEffect(() => {
    if (!open || loadedFor === country) return;
    let cancelled = false;
    const version = ++loadVersion.current;
    const controller = new AbortController();

    (async () => {
      try {
        const listed = await fetch("/api/assistant/conversations", { signal: controller.signal, cache: "no-store" });
        if (!listed.ok) throw new Error(await readError(listed, "Your chats could not be loaded."));
        const { chats: found } = (await listed.json()) as { chats: ChatSummary[] };
        let detail: ChatDetail | null = null;
        if (found[0]) {
          const response = await fetch(`/api/assistant/conversations/${found[0].id}`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error(await readError(response, "Your chat could not be loaded."));
          detail = ((await response.json()) as { chat: ChatDetail }).chat;
        }
        if (cancelled || version !== loadVersion.current) return;
        setChats(found);
        setChatId(detail?.id ?? null);
        setEntries(detail ? toEntries(detail.messages) : []);
        setSuggestions(detail ? lastSuggestions(detail.messages) : []);
        setLoadError(null);
        setLoadedFor(country);
      } catch (error) {
        if (!cancelled && version === loadVersion.current) setLoadError(error instanceof Error ? error.message : "Your chats could not be loaded.");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, country, loadedFor, reloadKey]);

  useEffect(() => {
    if (open && view === "chat" && !loading) inputRef.current?.focus();
  }, [open, view, loading]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries, status, suggestions]);

  useEffect(() => () => {
    loadVersion.current++;
    const active = abortRef.current;
    abortRef.current = null;
    active?.abort();
  }, []);

  function close() {
    setOpen(false);
    if (!busy) setLoadedFor(null);
    buttonRef.current?.focus();
  }

  function retryLoad() {
    setLoadError(null);
    setLoadedFor(null);
    setReloadKey((key) => key + 1);
  }

  function startOver() {
    loadVersion.current++;
    const active = abortRef.current;
    abortRef.current = null;
    active?.abort();
    setChatId(null);
    setLoadedFor(country);
    setOpeningChat(false);
    setLoadError(null);
    setInput("");
    setEntries([]);
    setSuggestions([]);
    setView("chat");
    setStatus(null);
    setBusy(false);
  }

  async function showList() {
    const version = ++loadVersion.current;
    setView("list");
    setListError(null);
    setChats(null);
    try {
      const response = await fetch("/api/assistant/conversations");
      if (!response.ok) throw new Error(await readError(response, "Your chats could not be loaded."));
      const data = (await response.json()) as { chats: ChatSummary[] };
      if (version === loadVersion.current) setChats(data.chats);
    } catch (error) {
      if (version === loadVersion.current) setListError(error instanceof Error ? error.message : "Your chats could not be loaded.");
    }
  }

  async function openChat(id: string) {
    const version = ++loadVersion.current;
    const active = abortRef.current;
    abortRef.current = null;
    active?.abort();
    setBusy(false);
    setOpeningChat(true);
    setLoadError(null);
    setView("chat");
    setEntries([]);
    setSuggestions([]);
    setStatus("Loading chat…");
    try {
      const response = await fetch(`/api/assistant/conversations/${id}`);
      if (!response.ok) throw new Error(await readError(response, "That chat could not be loaded."));
      const { chat } = (await response.json()) as { chat: ChatDetail };
      if (version !== loadVersion.current) return;
      setChatId(chat.id);
      setEntries(toEntries(chat.messages));
      setSuggestions(lastSuggestions(chat.messages));
    } catch (error) {
      if (version !== loadVersion.current) return;
      setChatId(null);
      setLoadError(error instanceof Error ? error.message : "That chat could not be loaded.");
    } finally {
      if (version === loadVersion.current) {
        setLoadedFor(country);
        setOpeningChat(false);
        setStatus(null);
      }
    }
  }

  async function removeChat(chat: ChatSummary) {
    try {
      const response = await fetch(`/api/assistant/conversations/${chat.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error(await readError(response, "That chat could not be deleted."));
      setChats((current) => current?.filter((item) => item.id !== chat.id) ?? null);
      if (chat.id === chatId) {
        const active = abortRef.current;
        abortRef.current = null;
        active?.abort();
        setBusy(false);
        setStatus(null);
        setChatId(null);
        setEntries([]);
        setSuggestions([]);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "That chat could not be deleted.");
    }
  }

  async function send(text: string, extras: SendExtras = {}) {
    const message = text.trim().slice(0, ASSISTANT_LIMITS.messageChars);
    if (!message || abortRef.current || loading || loadError || view !== "chat") return;

    setEntries((current) => [...current, { id: nextId++, kind: "user", text: message }]);
    setSuggestions([]);
    setInput("");
    setBusy(true);
    setStatus("Thinking…");

    const controller = new AbortController();
    abortRef.current = controller;
    let streamingId: number | null = null;
    const dropStreaming = () => {
      if (streamingId === null) return;
      const id = streamingId;
      streamingId = null;
      setEntries((current) => current.filter((entry) => entry.id !== id));
    };

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: chatId, message, ...extras }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // A chat deleted elsewhere, or from another country: the next message starts a new one.
        if (response.status === 404) setChatId(null);
        throw new Error(await readError(response, "The trip assistant is unavailable right now."));
      }

      let completed = false;
      for await (const event of readEvents(response)) {
        if (abortRef.current !== controller) break;
        if (event.type === "conversation") {
          setChatId(event.id);
        } else if (event.type === "status") {
          setStatus(event.text);
        } else if (event.type === "delta") {
          if (streamingId === null) {
            const id = nextId++;
            streamingId = id;
            setEntries((current) => [...current, { id, kind: "assistant", text: event.text, streaming: true }]);
          } else {
            const id = streamingId;
            setEntries((current) => current.map((entry) => (entry.id === id && entry.kind === "assistant" ? { ...entry, text: entry.text + event.text } : entry)));
          }
        } else if (event.type === "reset") {
          dropStreaming();
        } else if (event.type === "card") {
          setEntries((current) => [...current, { id: nextId++, kind: "card", card: event.card, pricedAt: null }]);
        } else if (event.type === "reply") {
          // The cleaned reply replaces what was streamed.
          dropStreaming();
          setEntries((current) => [...current, { id: nextId++, kind: "assistant", text: event.text }]);
        } else if (event.type === "suggestions") {
          setSuggestions(event.items);
        } else if (event.type === "error") {
          dropStreaming();
          setEntries((current) => [...current, { id: nextId++, kind: "error", text: event.message }]);
        } else if (event.type === "done") {
          completed = true;
        }
      }
      if (!completed && abortRef.current === controller) throw new Error("The connection ended before the answer was complete. Reopen this chat from Recent to check what was saved.");
    } catch (error) {
      if (abortRef.current !== controller) return;
      dropStreaming();
      if (controller.signal.aborted) {
        if (abortRef.current === controller) {
          setEntries((current) => [...current, { id: nextId++, kind: "error", text: "Stopped." }]);
        }
      } else {
        setEntries((current) => [...current, { id: nextId++, kind: "error", text: error instanceof Error ? error.message : "Something went wrong." }]);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
        setStatus(null);
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  /** A place picked from chips: the server remembers it for this chat, then the trip is asked for again. */
  function pickPlace(query: string, place: ResolvedPlace) {
    void send(`For "${query}", use ${place.label.split(",")[0]}.`, { pick: { query, place } });
  }

  function applySuggestion(item: Suggestion) {
    if (item.fill) {
      setInput(item.message);
      inputRef.current?.focus();
      return;
    }
    void send(item.message);
  }

  const [from, to] = EXAMPLES[country];
  const examples = [`${from} to ${to} now`, `Cheapest ride from ${from} to ${to} for 3 people`, `${from} to ${to} tomorrow at 9am`];

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="Trip assistant"
          onKeyDown={(event) => { if (event.key === "Escape") close(); }}
          className="fixed inset-x-0 bottom-0 z-[45] flex h-[85dvh] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-24 sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-center gap-1 border-b border-border px-3 py-2.5">
            {view === "list" ? (
              <button type="button" onClick={() => setView("chat")} aria-label="Back to the chat" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : (
              <MessageCircle className="ml-1 size-4 text-primary" aria-hidden />
            )}
            <h2 className="ml-1 flex-1 text-sm font-semibold text-foreground">{view === "list" ? "Recent chats" : "Trip assistant"}</h2>
            {view === "chat" && (
              <button type="button" disabled={loading || busy} onClick={() => void showList()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                <History className="size-3.5" aria-hidden /> Recent
              </button>
            )}
            <button type="button" onClick={startOver} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="size-3.5" aria-hidden /> New chat
            </button>
            <button type="button" onClick={close} aria-label="Close trip assistant" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          {view === "list" ? (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <ChatList chats={chats} error={listError} currentId={chatId} onOpen={(id) => void openChat(id)} onDelete={(chat) => void removeChat(chat)} onRetry={() => void showList()} />
            </div>
          ) : (
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
              {loadError && (
                <div role="alert" className="space-y-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{loadError}</p>
                  <button type="button" onClick={retryLoad} className="font-medium underline">Try again</button>
                </div>
              )}
              {loading && (
                <div className="space-y-2" aria-hidden="true">
                  <div className="ml-auto h-8 w-2/3 rounded-2xl bg-muted motion-safe:animate-pulse" />
                  <div className="h-24 rounded-xl bg-muted motion-safe:animate-pulse" />
                </div>
              )}
              {!loading && !loadError && entries.length === 0 && !status && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Tell me where you&apos;re going, and I&apos;ll find routes and compare rides.</p>
                  <div className="flex flex-col items-start gap-2">
                    {examples.map((example) => (
                      <button key={example} type="button" onClick={() => void send(example)} className="rounded-full border border-border px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted">
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!loading && !loadError && entries.map((entry) => {
                if (entry.kind === "user") {
                  return <p key={entry.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm whitespace-pre-wrap text-foreground">{entry.text}</p>;
                }
                if (entry.kind === "assistant") {
                  return <p key={entry.id} className="max-w-[90%] text-sm whitespace-pre-wrap text-foreground">{entry.text}{entry.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-foreground/60 motion-safe:animate-pulse" aria-hidden />}</p>;
                }
                if (entry.kind === "error") {
                  return <p key={entry.id} role={entry.text === "Stopped." ? undefined : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", entry.text === "Stopped." ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive")}>{entry.text}</p>;
                }
                if (entry.card.kind === "place-choice") {
                  return <PlaceChoice key={entry.id} card={entry.card} onPick={pickPlace} disabled={busy} />;
                }
                const card = entry.card;
                const focusTrip = { tripHistoryId: card.tripHistoryId, routeId: card.routeId };
                return (
                  <TripResult
                    key={entry.id}
                    card={card}
                    pricedAt={entry.pricedAt}
                    onRoute={(number) => void send(`Show the fares for route ${number}.`, { focusTrip })}
                    onRefresh={() => void send("Refresh the fares for this trip.", { focusTrip })}
                    onPick={pickPlace}
                    onNavigate={close}
                    disabled={busy}
                  />
                );
              })}
              {!busy && suggestions.length > 0 && (
                <div role="group" aria-label="Suggested next steps" className="flex flex-wrap gap-1.5">
                  {suggestions.map((item) => (
                    <button key={item.label} type="button" onClick={() => applySuggestion(item)} className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10">
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
              {status && (
                <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> {status}
                </p>
              )}
            </div>
          )}

          <form
            className="border-t border-border p-3"
            onSubmit={(event) => { event.preventDefault(); if (busy) stop(); else void send(input); }}
          >
            <div className="flex items-end gap-2">
              <label htmlFor="assistant-input" className="sr-only">Message the trip assistant</label>
              <textarea
                id="assistant-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={ASSISTANT_LIMITS.messageChars}
                disabled={loading || !!loadError}
                onChange={(event) => setInput(event.target.value)}
                onFocus={() => setView("chat")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    if (!busy) void send(input);
                  }
                }}
                placeholder="e.g. Home to work at 6pm, 2 people"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring disabled:opacity-60"
              />
              {busy ? (
                <button type="submit" aria-label="Stop" title="Stop" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground hover:bg-muted/70">
                  <Square className="size-3.5 fill-current" aria-hidden />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim() || loading || !!loadError} aria-label="Send" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Send className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Chats are saved to your account for 30 days. Messages are processed by Ollama Cloud. Fares are estimates.</p>
          </form>
        </section>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? "Close trip assistant" : "Ask NoboJatra"}
        title="Ask NoboJatra"
        className={cn(
          "fixed right-4 bottom-4 z-[45] flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:right-5 sm:bottom-5",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
      </button>
    </>
  );
}
