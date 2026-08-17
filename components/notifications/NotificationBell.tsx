"use client";

import { Popover } from "@base-ui/react/popover";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CircleDollarSign,
  CloudRain,
  TrafficCone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
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
const NOTIFICATIONS_REFRESH_EVENT = "notifications:refresh";
const TOAST_DURATION_MS = 5_500;
const TOAST_RECENT_WINDOW_MS = 90_000;

type CountResponse = { success: boolean; unreadCount?: number };
type ListResponse = {
  success: boolean;
  alerts?: AlertView[];
  unreadCount?: number;
  message?: string;
};
type MutationResponse = { success: boolean; unreadCount?: number; message?: string };

type LoadAlertsOptions = {
  silent?: boolean;
  surfaceLatest?: boolean;
};

const TOAST_SEVERITY_STYLES = {
  info: "border-primary/30 bg-popover text-popover-foreground",
  warning: "border-primary/50 bg-popover text-popover-foreground shadow-[0_0_28px_color-mix(in_oklch,var(--primary),transparent_72%)]",
  critical: "border-destructive/50 bg-popover text-popover-foreground shadow-[0_0_28px_color-mix(in_oklch,var(--destructive),transparent_76%)]",
} as const;

function isRecentAlert(alert: AlertView) {
  return Date.now() - new Date(alert.createdAt).getTime() <= TOAST_RECENT_WINDOW_MS;
}

function ToastIcon({ alert }: { alert: AlertView }) {
  const className = "mt-0.5 size-4 shrink-0 text-primary";

  if (alert.conditionType === "weather_severity") {
    return <CloudRain className={className} aria-hidden />;
  }

  if (alert.conditionType === "traffic_level") {
    return <TrafficCone className={className} aria-hidden />;
  }

  if (alert.conditionType === "fare_change") {
    return <CircleDollarSign className={className} aria-hidden />;
  }

  if (alert.severity === "critical") {
    return <AlertTriangle className={className} aria-hidden />;
  }

  return <BellRing className={className} aria-hidden />;
}

function NotificationToast({
  alert,
  onClose,
}: {
  alert: AlertView;
  onClose: (id: string) => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur motion-safe:animate-[notification-toast-in_220ms_ease-out]",
        TOAST_SEVERITY_STYLES[alert.severity],
      )}
    >
      <ToastIcon alert={alert} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {alert.message}
        </p>
      </div>
      <button
        type="button"
        data-no-glow
        aria-label="Hide notification"
        onClick={() => onClose(alert.id)}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [toasts, setToasts] = useState<AlertView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  // Set when the session has gone away, so a logged-out tab stops polling
  // instead of hammering a route that will only ever return 401.
  const stoppedRef = useRef(false);
  const unreadCountRef = useRef(0);
  const countInitializedRef = useRef(false);
  const surfacedAlertIdsRef = useRef<Set<string>>(new Set());
  const toastTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const setUnreadCountValue = useCallback((count: number) => {
    unreadCountRef.current = count;
    setUnreadCount(count);
  }, []);

  const removeToast = useCallback((alertId: string) => {
    setToasts((current) => current.filter((alert) => alert.id !== alertId));
  }, []);

  const showToast = useCallback(
    (alert: AlertView) => {
      if (surfacedAlertIdsRef.current.has(alert.id)) return;

      surfacedAlertIdsRef.current.add(alert.id);
      setToasts((current) => [alert, ...current.filter((item) => item.id !== alert.id)].slice(0, 3));

      const timer = setTimeout(() => removeToast(alert.id), TOAST_DURATION_MS);
      toastTimersRef.current.push(timer);
    },
    [removeToast],
  );

  const loadAlerts = useCallback(
    async ({ silent = false, surfaceLatest = false }: LoadAlertsOptions = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await fetch("/api/alerts");
        const payload = (await response.json()) as ListResponse;

        if (!response.ok || !payload.success) {
          throw new Error(payload.message ?? "Could not load notifications.");
        }

        const nextAlerts = payload.alerts ?? [];
        setAlerts(nextAlerts);
        if (typeof payload.unreadCount === "number") {
          setUnreadCountValue(payload.unreadCount);
        }

        if (surfaceLatest) {
          const newest = nextAlerts.find(
            (alert) => !surfacedAlertIdsRef.current.has(alert.id) && isRecentAlert(alert),
          );
          if (newest) showToast(newest);
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Could not load notifications.");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [setUnreadCountValue, showToast],
  );

  const refreshCount = useCallback(async () => {
    if (stoppedRef.current) return;

    try {
      const response = await fetch("/api/alerts/count");

      if (response.status === 401) {
        stoppedRef.current = true;
        setUnreadCountValue(0);
        return;
      }

      const payload = (await response.json()) as CountResponse;

      if (payload.success && typeof payload.unreadCount === "number") {
        const previousCount = unreadCountRef.current;
        setUnreadCountValue(payload.unreadCount);

        if (!countInitializedRef.current) {
          countInitializedRef.current = true;
          return;
        }

        if (payload.unreadCount > previousCount) {
          void loadAlerts({ silent: true, surfaceLatest: true });
        }
      }
    } catch {
      // A failed poll is not worth surfacing — the next one is a minute away.
    }
  }, [loadAlerts, setUnreadCountValue]);

  useEffect(() => {
    const poll = () => void refreshCount();
    const surfaceLatest = () => void loadAlerts({ silent: true, surfaceLatest: true });

    // The first poll is scheduled rather than run inline: every state update
    // then originates from a timer or an event, which keeps the effect body
    // free of synchronous setState and its cascading re-render.
    const initial = setTimeout(poll, 0);

    const interval = setInterval(() => {
      // No point polling a tab nobody is looking at.
      if (document.visibilityState === "visible") poll();
    }, POLL_INTERVAL_MS);

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, surfaceLatest);
    window.addEventListener("focus", poll);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, surfaceLatest);
      window.removeEventListener("focus", poll);
    };
  }, [loadAlerts, refreshCount]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
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
      removeToast(alertId);
      if (typeof payload.unreadCount === "number") setUnreadCountValue(payload.unreadCount);
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
      setToasts([]);
      if (typeof payload.unreadCount === "number") setUnreadCountValue(payload.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss notifications.");
    }
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <>
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed top-24 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:right-6"
        >
          {toasts.map((alert) => (
            <NotificationToast key={alert.id} alert={alert} onClose={removeToast} />
          ))}
        </div>
      )}

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
            <Popover.Popup className="z-50 origin-top-right overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-200 ease-out data-[ending-style]:translate-y-1 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
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
    </>
  );
}
