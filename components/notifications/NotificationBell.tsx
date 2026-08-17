"use client";

import { Popover } from "@base-ui/react/popover";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import NotificationCenter from "./NotificationCenter";
import type { AlertView } from "./types";

/**
 * Bell + unread badge + notification panel.
 *
 * The badge polls /api/alerts/count, which is deliberately the cheapest route
 * in the module — one indexed count. The full list is only fetched when the
 * panel is actually opened, so a user who never opens it costs one small query
 * a minute and nothing else.
 */

const POLL_INTERVAL_MS = 60_000;

type CountResponse = { success: boolean; unreadCount?: number };
type ListResponse = {
  success: boolean;
  alerts?: AlertView[];
  unreadCount?: number;
  message?: string;
};
type MutationResponse = { success: boolean; unreadCount?: number; message?: string };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  // Set when the session has gone away, so a logged-out tab stops polling
  // instead of hammering a route that will only ever return 401.
  const stoppedRef = useRef(false);

  const refreshCount = useCallback(async () => {
    if (stoppedRef.current) return;

    try {
      const response = await fetch("/api/alerts/count");

      if (response.status === 401) {
        stoppedRef.current = true;
        setUnreadCount(0);
        return;
      }

      const payload = (await response.json()) as CountResponse;

      if (payload.success && typeof payload.unreadCount === "number") {
        setUnreadCount(payload.unreadCount);
      }
    } catch {
      // A failed poll is not worth surfacing — the next one is a minute away.
    }
  }, []);

  useEffect(() => {
    const poll = () => void refreshCount();

    // The first poll is scheduled rather than run inline: every state update
    // then originates from a timer or an event, which keeps the effect body
    // free of synchronous setState and its cascading re-render.
    const initial = setTimeout(poll, 0);

    const interval = setInterval(() => {
      // No point polling a tab nobody is looking at.
      if (document.visibilityState === "visible") poll();
    }, POLL_INTERVAL_MS);

    window.addEventListener("focus", poll);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [refreshCount]);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/alerts");
      const payload = (await response.json()) as ListResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Could not load notifications.");
      }

      setAlerts(payload.alerts ?? []);
      if (typeof payload.unreadCount === "number") setUnreadCount(payload.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void loadAlerts();
  }

  /**
   * Dismiss and snooze differ only in the action they send, and both remove the
   * alert from the panel — a snoozed alert is hidden until it re-surfaces, so
   * leaving it on screen would misrepresent what just happened.
   */
  async function mutateAlert(alertId: string, action: "read" | "snooze") {
    setPendingIds((ids) => [...ids, alertId]);

    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const payload = (await response.json()) as MutationResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Could not update this notification.");
      }

      setAlerts((current) => current.filter((alert) => alert.id !== alertId));
      if (typeof payload.unreadCount === "number") setUnreadCount(payload.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this notification.");
    } finally {
      setPendingIds((ids) => ids.filter((id) => id !== alertId));
    }
  }

  async function dismissAll() {
    try {
      const response = await fetch("/api/alerts/read-all", { method: "POST" });
      const payload = (await response.json()) as MutationResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "Could not dismiss notifications.");
      }

      setAlerts([]);
      if (typeof payload.unreadCount === "number") setUnreadCount(payload.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss notifications.");
    }
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="relative inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Bell className="size-4" aria-hidden />

        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 inline-flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums"
          >
            {badgeLabel}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none">
            <NotificationCenter
              alerts={alerts}
              loading={loading}
              error={error}
              pendingIds={pendingIds}
              onDismiss={(id) => void mutateAlert(id, "read")}
              onSnooze={(id) => void mutateAlert(id, "snooze")}
              onDismissAll={() => void dismissAll()}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
