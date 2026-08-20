"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { useCountry } from "./CountryProvider";
import { COUNTRY_CONFIG, COUNTRY_OPTIONS, isCountryCode } from "@/lib/country-config";

/**
 * Switches the active country from the dashboard header.
 *
 * Writes the profile and then calls router.refresh() rather than holding local
 * state: the layout re-renders on the server, the new country flows back down
 * through CountryProvider, and every consumer updates together. Keeping a local
 * copy would risk the planner and the fare panel disagreeing about which
 * country is active while a request was in flight.
 *
 * A failed write is surfaced inline and leaves the select showing what is
 * actually stored, so the UI never claims a change that did not happen.
 */
export default function CountrySwitcher({ className }: { className?: string }) {
  const country = useCountry();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    if (!isCountryCode(next) || next === country) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: next }),
      });

      const payload = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
      } | null;

      if (!res.ok || !payload?.success) {
        setError(payload?.message ?? "Could not change country.");
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setError("Could not change country.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || isPending;

  return (
    <div className={className}>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Globe className="size-4" aria-hidden="true" />
        <span className="sr-only">Country</span>
        <select
          value={country}
          disabled={busy}
          onChange={(event) => handleChange(event.target.value)}
          className="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {COUNTRY_OPTIONS.map((code) => (
            <option key={code} value={code}>
              {COUNTRY_CONFIG[code].label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
