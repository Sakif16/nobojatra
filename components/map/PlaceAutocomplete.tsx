"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

// A saved shortcut ("Home", "Work", or a custom label) with its resolved
// place, exactly as stored on UserProfile.savedPlaces
export type SavedPlaceOption = {
  label: string;
  place: PlaceResult;
};

type Props = {
  placeholder: string;
  value: string;
  onChange: (label: string) => void;
  onSelect: (place: PlaceResult) => void;
  className?: string;
  icon?: React.ReactNode;
  // Optional — when provided and the field is empty, these render as
  // one-tap shortcuts instead of the usual "type to search" empty state
  savedPlaces?: SavedPlaceOption[];
};

export default function PlaceAutocomplete({
  placeholder,
  value,
  onChange,
  onSelect,
  className,
  icon,
  savedPlaces,
}: Props) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasSavedPlaces = Boolean(savedPlaces && savedPlaces.length > 0);
  // Saved shortcuts only make sense as an empty-state — once the user has
  // typed anything, the normal search results below take over.
  const showSavedList = value.trim().length === 0 && hasSavedPlaces;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      debounceRef.current = setTimeout(() => {
        setResults([]);
        setError(null);
        // Keep the dropdown open to show saved shortcuts when the field is
        // empty and shortcuts exist; otherwise close it as before.
        setOpen(value.trim().length === 0 && hasSavedPlaces);
      }, 0);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const places = await searchPlaces(value);
        setResults(places);
        setOpen(true);
      } catch {
        setResults([]);
        setError("Unable to load suggestions.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, hasSavedPlaces]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      {icon ? (
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          // Clicking into an already-empty field doesn't change `value`, so
          // this can't rely on the effect above re-running — it needs its
          // own check for the same two cases.
          if (showSavedList) {
            setOpen(true);
            return;
          }
          if (results.length > 0) setOpen(true);
        }}
        className={cn(
          "w-full rounded-xl border border-input bg-secondary/60 px-4 py-3 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-secondary",
          icon && "pl-11",
          className
        )}
      />
      {open && (showSavedList || results.length > 0 || loading || error) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          {showSavedList ? (
            <>
              <div className="border-b border-border px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Saved places
              </div>
              {savedPlaces!.map((saved) => (
                <button
                  key={saved.label}
                  type="button"
                  onClick={() => {
                    onSelect(saved.place);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <MapPin size={14} className="flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-popover-foreground">{saved.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {saved.place.label}
                    </div>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              {loading && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Searching…
                </div>
              )}
              {!loading && error && (
                <div className="px-4 py-3 text-sm text-destructive">{error}</div>
              )}
              {!loading &&
                !error &&
                results.map((place, i) => (
                  <button
                    key={place.id ?? `${place.lat}-${place.lng}-${i}`}
                    type="button"
                    onClick={() => {
                      onSelect(place);
                      setOpen(false);
                    }}
                    className="block w-full truncate px-4 py-2.5 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                  >
                    {place.label}
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}