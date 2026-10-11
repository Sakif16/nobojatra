"use client";

import {
  AlertTriangle,
  CheckCheck,
  Clock3,
  Inbox,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertView } from "./types";

/**
 * Presentational half of the notification center. The bell owns the data and
 * the network calls; this renders the list and reports which action the user
 * picked, so the two can be reasoned about separately.
 */

const SEVERITY_STYLES = {
  info: "text-muted-foreground",
  warning: "text-orange-700 dark:text-orange-400",
  critical: "text-destructive",
} as const;

/**
 * "3m ago", "2h ago", "yesterday". Intl handles the pluralisation and wording
 * so this does not need a locale table of its own.
 */
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function timeAgo(iso: string) {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(elapsedMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");

  return relative.format(-Math.round(hours / 24), "day");
}

function AlertRow({
  alert,
  onDismiss,
  onSnooze,
  pending,
}: {
  alert: AlertView;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  pending: boolean;
}) {
  const Icon = alert.severity === "critical" ? AlertTriangle : Info;

  return (
    <li
      className={cn(
        "flex gap-3 border-b border-border px-4 py-3 last:border-b-0",
        pending && "opacity-50",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", SEVERITY_STYLES[alert.severity])}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{alert.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>

        <p className="mt-1 text-[11px] text-muted-foreground">{timeAgo(alert.createdAt)}</p>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onDismiss(alert.id)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted disabled:pointer-events-none"
          >
            <X className="size-3" aria-hidden />
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => onSnooze(alert.id)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted disabled:pointer-events-none"
          >
            <Clock3 className="size-3" aria-hidden />
            Snooze 1h
          </button>
        </div>
      </div>
    </li>
  );
}

export default function NotificationCenter({
  alerts,
  loading,
  error,
  pendingIds,
  onDismiss,
  onSnooze,
  onDismissAll,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: {
  alerts: AlertView[];
  loading: boolean;
  error: string | null;
  pendingIds: string[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onDismissAll: () => void;
  /** True when there are older notifications than the ones listed. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>

        {alerts.length > 0 && (
          <button
            type="button"
            onClick={onDismissAll}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <CheckCheck className="size-3" aria-hidden />
            Dismiss all
          </button>
        )}
      </div>

      {loading && (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Loading notifications…
        </p>
      )}

      {/* With a list on screen an error is a line above it, not a replacement:
          failing to load an older page must not hide what is already shown. */}
      {error && !loading && (
        <p
          role="alert"
          className={
            alerts.length > 0
              ? "border-b border-border px-4 py-2 text-xs text-destructive"
              : "px-4 py-6 text-center text-xs text-destructive"
          }
        >
          {error}
        </p>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <Inbox className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground">
            You&apos;re all caught up.
          </p>
        </div>
      )}

      {!loading && alerts.length > 0 && (
        <div className="overflow-y-auto">
          <ul>
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onDismiss={onDismiss}
                onSnooze={onSnooze}
                pending={pendingIds.includes(alert.id)}
              />
            ))}
          </ul>

          {/* The list opens on the newest twenty. This is how the rest are
              reached; dismissing newer ones used to be the only way down. */}
          {hasMore && onLoadMore && (
            <div className="border-t border-border px-4 py-2.5 text-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load older notifications"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
