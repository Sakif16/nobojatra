"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookmarkPlus, Check, MapPin, RefreshCw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Chip from "@/components/ui/chip";
import Pill from "@/components/ui/pill";
import { readJson } from "@/lib/read-json";
import { DEFAULT_STOP_DWELL_MINUTES } from "@/lib/trip-input";
import { cn } from "@/lib/utils";
import type { PlaceChoiceCard, ResolvedPlace, RideSummary, TripCard } from "@/lib/assistant/types";

/**
 * The assistant's answers, drawn by the app rather than written by the model.
 * Every save happens here, on a button the user presses — the model has no
 * way to save anything.
 */

const shortName = (label: string) => label.split(",")[0]?.trim() || label;
const sameName = (query: string, label: string) =>
  shortName(label).toLowerCase().replace(/['’`.\-]/g, "") === query.trim().toLowerCase().replace(/['’`.\-]/g, "");

type PickPlace = (query: string, place: ResolvedPlace) => void;

export function PlaceChoice({ card, onPick, disabled }: { card: PlaceChoiceCard; onPick: PickPlace; disabled: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-xs text-muted-foreground">Which &ldquo;{card.query}&rdquo;?</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {card.options.map((option) => (
          <button
            key={`${option.lat},${option.lng}`}
            type="button"
            disabled={disabled}
            onClick={() => onPick(card.query, option)}
            className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">{shortName(option.label)}</span>
              <span className="block truncate text-muted-foreground" title={option.label}>{option.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string; href?: string };

function RideRow({ ride, card, onNavigate }: { ride: RideSummary; card: TripCard; onNavigate: () => void }) {
  const [save, setSave] = useState<SaveState>({ status: "idle" });

  async function savePlan() {
    setSave({ status: "saving" });
    try {
      const response = await fetch("/api/trip-input/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripHistoryId: card.tripHistoryId, routeId: card.routeId, provider: ride.provider, vehicleType: ride.vehicleType }),
      });
      const data = await readJson<{ success?: boolean; message?: string; tripHistoryId?: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message ?? "Could not save this plan.");
      window.dispatchEvent(new Event("notifications:refresh"));
      setSave({ status: "saved", href: `/trip-summary?tripHistoryId=${data.tripHistoryId ?? card.tripHistoryId}` });
    } catch (error) {
      setSave({ status: "error", message: error instanceof Error ? error.message : "Could not save this plan." });
    }
  }

  return (
    <li className="rounded-lg px-2 py-2 hover:bg-muted/50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{ride.displayName}</p>
          {ride.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{ride.tags.map((tag) => <Pill key={tag} className="bg-primary/10 text-[10px] text-primary">{tag}</Pill>)}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-foreground">{ride.fareText}</p>
          {ride.sourceLabel && <p className="text-[10px] text-muted-foreground">{ride.sourceLabel}</p>}
        </div>
      </div>
      <div className="mt-1.5">
        {save.status === "saved" && save.href ? (
          <Link href={save.href} onClick={onNavigate} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Check className="size-3.5" aria-hidden /> Saved — view plan
          </Link>
        ) : (
          <button type="button" onClick={() => void savePlan()} disabled={save.status === "saving"} className="text-xs font-medium text-primary hover:underline disabled:opacity-60">
            {save.status === "saving" ? "Saving…" : `Save ${ride.displayName}`}
          </button>
        )}
        {save.status === "error" && <p role="alert" className="mt-1 text-xs text-destructive">{save.message}</p>}
      </div>
    </li>
  );
}

export function TripResult({ card, pricedAt, onRoute, onRefresh, onPick, onNavigate, disabled }: {
  card: TripCard;
  pricedAt: string | null;
  onRoute: (number: number) => void;
  onRefresh: () => void;
  onPick: PickPlace;
  onNavigate: () => void;
  disabled: boolean;
}) {
  const [bookmark, setBookmark] = useState<SaveState>({ status: "idle" });
  const query = new URLSearchParams({ tripHistoryId: card.tripHistoryId, routeId: card.routeId }).toString();
  const title = [card.origin, ...card.stops, card.destination].map((place) => shortName(place.label)).join(" → ");

  async function saveTrip() {
    setBookmark({ status: "saving" });
    try {
      const response = await fetch("/api/saved-trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title.slice(0, 60),
          origin: card.origin,
          destination: card.destination,
          stops: card.stops.map((stop) => ({ ...stop, dwellMinutes: DEFAULT_STOP_DWELL_MINUTES })),
          passengerCount: card.passengers,
        }),
      });
      const data = await readJson<{ success?: boolean; message?: string }>(response);
      if (!response.ok || !data.success) throw new Error(data.message ?? "Could not save this trip.");
      setBookmark({ status: "saved" });
    } catch (error) {
      setBookmark({ status: "error", message: error instanceof Error ? error.message : "Could not save this trip." });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {card.passengers} passenger{card.passengers === 1 ? "" : "s"} · {card.departureLabel ?? "Leaving now"}
      </p>
      {pricedAt && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <p>Prices from <time dateTime={pricedAt}>{new Intl.DateTimeFormat("en-GB", {
            weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
          }).format(new Date(pricedAt))}</time></p>
          <button type="button" onClick={onRefresh} disabled={disabled} className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50">
            <RefreshCw className="size-3" aria-hidden /> Refresh
          </button>
        </div>
      )}

      {card.guessedPlaces.map((guess) => (
        <div key={guess.query} className="mt-2 text-xs text-muted-foreground">
          {sameName(guess.query, guess.chosen.label)
            ? <>Other places called &ldquo;{guess.query}&rdquo;:</>
            : <>Using <span className="text-foreground">{shortName(guess.chosen.label)}</span> for &ldquo;{guess.query}&rdquo;.</>}
          {guess.alternatives.length > 0 && <span className="mt-1 flex flex-wrap gap-1">
            {guess.alternatives.map((alternative) => (
              <Chip key={`${alternative.lat},${alternative.lng}`} className="min-h-0 px-2 py-0.5 text-[11px]" buttonProps={{ disabled, onClick: () => onPick(guess.query, alternative), title: alternative.label }}>
                {shortName(alternative.label)}
              </Chip>
            ))}
          </span>}
        </div>
      ))}

      {card.routes.length > 1 && (
        <div role="group" aria-label="Routes" className="mt-3 flex flex-wrap gap-1.5">
          {card.routes.map((route, index) => (
            <Chip
              key={route.id}
              selected={route.id === card.routeId}
              className="min-h-0 px-2.5 py-1 text-[11px]"
              buttonProps={{ disabled: disabled || route.id === card.routeId, onClick: () => onRoute(index + 1) }}
            >
              Route {index + 1} · {route.distanceKm} km · {route.durationMin} min
            </Chip>
          ))}
        </div>
      )}
      {card.routes.length === 1 && (
        <p className="mt-2 text-xs text-muted-foreground">{card.routes[0].distanceKm} km · {card.routes[0].durationMin} min</p>
      )}

      {card.rides.length > 0 ? (
        <ul className="mt-2 space-y-0.5" aria-label="Ride options">
          {card.rides.map((ride) => <RideRow key={`${ride.provider}-${ride.vehicleType}-${card.routeId}`} ride={ride} card={card} onNavigate={onNavigate} />)}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No ride fits this trip right now.</p>
      )}

      {card.unavailable.length > 0 && (
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{card.unavailable.length} not available</summary>
          <ul className="mt-1 space-y-1">{card.unavailable.map((item) => <li key={item.displayName}><span className="text-foreground">{item.displayName}</span>: {item.reason}</li>)}</ul>
        </details>
      )}

      {card.notes.map((note) => <p key={note} className="mt-1 text-[11px] text-muted-foreground">{note}</p>)}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/?${query}`} onClick={onNavigate} className={buttonVariants({ size: "sm", className: "gap-1" })}>
          Open in planner <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <Link href={`/fares?${query}&sort=best`} onClick={onNavigate} className={buttonVariants({ variant: "outline", size: "sm" })}>
          All fares
        </Link>
        {bookmark.status === "saved" ? (
          <Link href="/saved-trips" onClick={onNavigate} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-primary")}>
            <Check className="size-3.5" aria-hidden /> In saved trips
          </Link>
        ) : (
          <button type="button" onClick={() => void saveTrip()} disabled={bookmark.status === "saving"} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}>
            <BookmarkPlus className="size-3.5" aria-hidden /> {bookmark.status === "saving" ? "Saving…" : "Save trip"}
          </button>
        )}
      </div>
      {bookmark.status === "error" && <p role="alert" className="mt-1 text-xs text-destructive">{bookmark.message}</p>}
    </div>
  );
}
