"use client";

import { CircleDollarSign, CloudRain, Plus, TrafficCone, X } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { fieldClassName } from "@/components/ui/field-styles";
import type { AlertConditionType, SavedTripDetail, TrafficLevel } from "./types";

/**
 * Add, remove, and toggle the alert conditions on one trip.
 *
 * Thresholds carry the units the evaluator actually uses: weather is the 0–10
 * severity score from lib/weather.ts (not a percentage), fare is a percent
 * move in either direction from the trip's stored baseline.
 */

const CONDITION_META = {
  weather_severity: { label: "Weather severity", icon: CloudRain },
  traffic_level: { label: "Traffic level", icon: TrafficCone },
  fare_change: { label: "Fare change", icon: CircleDollarSign },
} as const;

const TRAFFIC_LEVELS: TrafficLevel[] = ["low", "moderate", "high", "severe"];

function describe(condition: SavedTripDetail["conditions"][number]) {
  if (condition.type === "traffic_level") {
    return `at ${condition.level ?? "high"} or worse`;
  }

  if (condition.type === "fare_change") {
    return `±${condition.threshold ?? 15}% from baseline`;
  }

  return `at or above ${condition.threshold ?? 3.5} of 10`;
}

export default function ConditionEditor({
  trip,
  onTripChange,
}: {
  trip: SavedTripDetail;
  onTripChange: (trip: SavedTripDetail) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<AlertConditionType>("weather_severity");
  const [threshold, setThreshold] = useState(3.5);
  const [level, setLevel] = useState<TrafficLevel>("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fare alert needs a baseline, which only exists once a vehicle is chosen.
  const canAddFare = Boolean(trip.baseline && trip.preferredVehicle);

  function selectType(nextType: AlertConditionType) {
    setType(nextType);
    setThreshold(nextType === "fare_change" ? 15 : 3.5);
  }

  async function send(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(url, init);
      const payload = (await response.json()) as {
        success: boolean;
        trip?: SavedTripDetail;
        message?: string;
      };

      if (!response.ok || !payload.success || !payload.trip) {
        throw new Error(payload.message ?? "Could not update conditions.");
      }

      onTripChange(payload.trip);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update conditions.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCondition() {
    const body: Record<string, unknown> = { type };

    if (type === "traffic_level") body.level = level;
    else body.threshold = threshold;

    const ok = await send(`/api/saved-trips/${trip.id}/conditions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (ok) setAdding(false);
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground">Alert me when</h4>

        {!adding && trip.conditions.length < 10 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3" aria-hidden />
            Add condition
          </button>
        )}
      </div>

      {trip.conditions.length === 0 && !adding && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          No conditions yet — this trip will not produce notifications.
        </p>
      )}

      <ul className="mt-2 flex flex-col gap-1.5">
        {trip.conditions.map((condition) => {
          const Icon = CONDITION_META[condition.type].icon;

          return (
            <li
              key={condition.id}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5"
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                <span className="font-medium">
                  {CONDITION_META[condition.type].label}
                </span>{" "}
                <span className="text-muted-foreground">{describe(condition)}</span>
              </span>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void send(`/api/saved-trips/${trip.id}/conditions/${condition.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isActive: !condition.isActive }),
                  })
                }
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-muted disabled:pointer-events-none"
              >
                {condition.isActive ? "Pause" : "Resume"}
              </button>

              <button
                type="button"
                aria-label="Remove condition"
                disabled={busy}
                onClick={() =>
                  void send(`/api/saved-trips/${trip.id}/conditions/${condition.id}`, {
                    method: "DELETE",
                  })
                }
                className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:pointer-events-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-2.5">
          <select
            aria-label="Condition type"
            value={type}
            onChange={(event) => selectType(event.target.value as AlertConditionType)}
            className={fieldClassName(false, "py-2 text-xs")}
          >
            <option value="weather_severity">Weather severity</option>
            <option value="traffic_level">Traffic level</option>
            <option value="fare_change" disabled={!canAddFare}>
              Fare change{canAddFare ? "" : " — pick a vehicle first"}
            </option>
          </select>

          {type === "traffic_level" ? (
            <select
              aria-label="Traffic level"
              value={level}
              onChange={(event) => setLevel(event.target.value as TrafficLevel)}
              className={fieldClassName(false, "py-2 text-xs")}
            >
              {TRAFFIC_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option} or worse
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-col gap-1">
              <input
                aria-label={type === "fare_change" ? "Percent change" : "Severity score"}
                type="number"
                value={threshold}
                min={type === "fare_change" ? 1 : 0}
                max={type === "fare_change" ? 100 : 10}
                step={type === "fare_change" ? 1 : 0.5}
                onChange={(event) => setThreshold(Number(event.target.value))}
                className={fieldClassName(false, "py-2 text-xs")}
              />
              <p className="text-[10px] text-muted-foreground">
                {type === "fare_change"
                  ? "Percent move up or down from this trip's saved baseline."
                  : "Scored 0–10. Moderate weather starts at 3.5, severe at 7."}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addCondition()}
              className={buttonVariants({ size: "sm" })}
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
