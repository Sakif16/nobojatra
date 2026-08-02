"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

type Props = {
  placeholder: string;
  value: string;
  onChange: (label: string) => void;
  onSelect: (place: PlaceResult) => void;
  className?: string;
  icon?: React.ReactNode;
};

export default function PlaceAutocomplete({
  placeholder,
  value,
  onChange,
  onSelect,
  className,
  icon,
}: Props) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      debounceRef.current = setTimeout(() => {
        setResults([]);
        setError(null);
        setOpen(false);
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
  }, [value]);

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
        onFocus={() => results.length > 0 && setOpen(true)}
        className={cn(
          "w-full rounded-xl border border-input bg-secondary/60 px-4 py-3 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-secondary",
          icon && "pl-11",
          className
        )}
      />
      {open && (results.length > 0 || loading || error) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
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
        </div>
      )}
    </div>
  );
}
