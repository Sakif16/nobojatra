"use client";

import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import type { ChatSummary } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";

/** "just now", "5 min ago", "3 h ago", "2 days ago", or a date. */
export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
}

/** The Recent chats view: this country's saved chats, newest first. */
export default function ChatList({
  chats,
  error,
  currentId,
  onOpen,
  onDelete,
  onRetry,
}: {
  chats: ChatSummary[] | null;
  error: string | null;
  currentId: string | null;
  onOpen: (id: string) => void;
  onDelete: (chat: ChatSummary) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div role="alert" className="space-y-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <p>{error}</p>
        <button type="button" onClick={onRetry} className="font-medium underline">Try again</button>
      </div>
    );
  }
  if (!chats) {
    return <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> Loading chats…</p>;
  }
  if (chats.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved chats yet. Chats are kept for 30 days.</p>;
  }

  return (
    <ul className="space-y-1" aria-label="Recent chats">
      {chats.map((chat) => (
        <li key={chat.id} className={cn("flex items-center gap-1 rounded-lg", chat.id === currentId && "bg-primary/10")}>
          <button
            type="button"
            onClick={() => onOpen(chat.id)}
            aria-current={chat.id === currentId ? "true" : undefined}
            className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
          >
            <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm text-foreground">{chat.title}</span>
              <span className="block text-[11px] text-muted-foreground">{relativeTime(chat.updatedAt)} · {Math.ceil(chat.messageCount / 2)} message{Math.ceil(chat.messageCount / 2) === 1 ? "" : "s"}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDelete(chat)}
            aria-label={`Delete chat: ${chat.title}`}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
