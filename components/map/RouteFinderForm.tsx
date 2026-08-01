"use client";

import { useState } from "react";
import { MapPin, Minus, Plus, X } from "lucide-react";
import PlaceAutocomplete from "./PlaceAutocomplete";
import type { PlaceResult } from "@/lib/geocode";
import { reverseGeocode } from "@/lib/geocode";
import { cn } from "@/lib/utils";

export type RouteFormValues = {
  origin: PlaceResult;
  destination: PlaceResult;
  stops: PlaceResult[];
  passengers: number;
  scheduledTime: string | null; // null = "leave now"
};

type StopField = { label: string; place: PlaceResult | null };

type Props = {
  onSubmit: (values: RouteFormValues) => void;
  loading?: boolean;
};

export default function RouteFinderForm({ onSubmit, loading }: Props) {
  const [originLabel, setOriginLabel] = useState("");
  const [origin, setOrigin] = useState<PlaceResult | null>(null);

  const [destinationLabel, setDestinationLabel] = useState("");
  const [destination, setDestination] = useState<PlaceResult | null>(null);

  const [passengers, setPassengers] = useState(2);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledTime, setScheduledTime] = useState("");

  const [stops, setStops] = useState<StopField[]>([]);
  const [locating, setLocating] = useState(false);

  async function useCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = await reverseGeocode(latitude, longitude);
        setOrigin({ lat: latitude, lng: longitude, label });
        setOriginLabel(label);
        setLocating(false);
      },
      () => setLocating(false)
    );
  }

  function addStop() {
    setStops((s) => [...s, { label: "", place: null }]);
  }

  function removeStop(index: number) {
    setStops((s) => s.filter((_, i) => i !== index));
  }

  function updateStopLabel(index: number, label: string) {
    setStops((s) => s.map((st, i) => (i === index ? { ...st, label } : st)));
  }

  function selectStopPlace(index: number, place: PlaceResult) {
    setStops((s) =>
      s.map((st, i) =>
        i === index ? { ...st, place, label: place.label } : st
      )
    );
  }

  const validStops = stops
    .map((s) => s.place)
    .filter((p): p is PlaceResult => p !== null);

  const canSubmit = origin !== null && destination !== null && !loading;

  function handleSubmit() {
    if (!origin || !destination) return;
    onSubmit({
      origin,
      destination,
      stops: validStops,
      passengers,
      scheduledTime: mode === "schedule" && scheduledTime ? scheduledTime : null,
    });
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <PlaceAutocomplete
        placeholder="Origin - Search Place"
        value={originLabel}
        onChange={(v) => {
          setOriginLabel(v);
          setOrigin(null);
        }}
        onSelect={(place) => {
          setOrigin(place);
          setOriginLabel(place.label);
        }}
      />

      <PlaceAutocomplete
        placeholder="Destination - Search Place"
        value={destinationLabel}
        onChange={(v) => {
          setDestinationLabel(v);
          setDestination(null);
        }}
        onSelect={(place) => {
          setDestination(place);
          setDestinationLabel(place.label);
        }}
      />

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50"
      >
        <MapPin size={15} />
        {locating ? "Locating…" : "Use Current Location"}
      </button>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Passengers</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPassengers((p) => Math.max(1, p - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
          >
            <Minus size={14} />
          </button>
          <span className="w-4 text-center text-sm font-medium text-gray-800">
            {passengers}
          </span>
          <button
            type="button"
            onClick={() => setPassengers((p) => p + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-xl">
        <button
          type="button"
          onClick={() => setMode("now")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            mode === "now"
              ? "bg-purple-600 text-white"
              : "bg-gray-200 text-gray-600"
          )}
        >
          Leave Now
        </button>
        <button
          type="button"
          onClick={() => setMode("schedule")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            mode === "schedule"
              ? "bg-purple-600 text-white"
              : "bg-gray-200 text-gray-600"
          )}
        >
          Schedule
        </button>
      </div>

      {mode === "schedule" && (
        <input
          type="datetime-local"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-purple-400"
        />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">Stops</span>
          <button
            type="button"
            onClick={addStop}
            className="text-sm font-medium text-purple-600 hover:text-purple-700"
          >
            + Add Stops
          </button>
        </div>

        <div className="space-y-2">
          {stops.map((stop, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2"
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-medium text-gray-600">
                {i + 1}
              </span>
              <div className="flex-1">
                <PlaceAutocomplete
                  placeholder={`Stop ${i + 1} - search place`}
                  value={stop.label}
                  onChange={(v) => updateStopLabel(i, v)}
                  onSelect={(place) => selectStopPlace(i, place)}
                  className="border-none bg-transparent px-0 py-0 focus:bg-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => removeStop(i)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-xl bg-purple-700 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Finding routes…" : "Find Best Route"}
      </button>
    </div>
  );
}
