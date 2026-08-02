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
};

export default function PlaceAutocomplete({
  placeholder,
  value,
  onChange,
  onSelect,
  className,
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
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className={cn(
          "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-purple-400 focus:bg-white transition-colors",
          className
        )}
      />
      {open && (results.length > 0 || loading || error) && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
          )}
          {!loading && error && (
            <div className="px-4 py-3 text-sm text-rose-500">{error}</div>
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
                className="block w-full truncate px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-purple-50"
              >
                {place.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
