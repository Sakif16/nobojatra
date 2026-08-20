"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import PlaceAutocomplete from "./PlaceAutocomplete";
import { buttonVariants } from "@/components/ui/button";
import { classifyLocationImage, type LocationPrediction } from "@/lib/image-classifier";
import { resolveLocationClass, MIN_CONFIDENCE } from "@/lib/image-location-classes";
import type { PlaceResult } from "@/lib/geocode";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (place: PlaceResult) => void;
};

type Status = "idle" | "loading-model" | "classifying" | "done" | "error";

export default function ImageLocationModal({ open, onClose, onConfirm }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [topPrediction, setTopPrediction] = useState<LocationPrediction | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The location field — reuses the same search component as the main form,
  // so a wrong guess can be corrected exactly like typing normally
  const [locationLabel, setLocationLabel] = useState("");
  const [locationPlace, setLocationPlace] = useState<PlaceResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Fresh state every time the modal is opened, whether it's being reused
  // for origin, destination, or reopened after a previous cancel
  useEffect(() => {
    if (!open) return;
    setPreviewUrl(null);
    setStatus("idle");
    setTopPrediction(null);
    setErrorMessage(null);
    setLocationLabel("");
    setLocationPlace(null);
  }, [open]);

  // Revoke the object URL when it's replaced or the modal unmounts, so
  // repeated uploads don't leak memory
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  if (!open) return null;

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setPreviewUrl(url);
    setTopPrediction(null);
    setErrorMessage(null);
    setLocationLabel("");
    setLocationPlace(null);
    setStatus("loading-model");
  }

  // Runs once the <img> has actually finished loading the new preview —
  // classifying before the pixels are ready would throw
  async function handlePreviewLoaded() {
    if (!imgRef.current) return;

    setStatus("classifying");

    try {
      const predictions = await classifyLocationImage(imgRef.current);
      const best = predictions[0] ?? null;
      setTopPrediction(best);

      if (best && best.probability >= MIN_CONFIDENCE) {
        const place = resolveLocationClass(best.className);
        if (place) {
          setLocationPlace(place);
          setLocationLabel(place.label);
        }
      }
      // Below-confidence or unrecognized-class predictions intentionally
      // leave the field empty — better a blank field than a confident-looking
      // wrong guess.

      setStatus("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not identify a location from this image.",
      );
      setStatus("error");
    }
  }

  function handleClose() {
    setPreviewUrl(null);
    onClose();
  }

  function handleConfirm() {
    if (!locationPlace) return;
    onConfirm(locationPlace);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Identify location from a photo</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Dropzone / preview */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-input bg-secondary/40 transition-colors hover:border-primary/50",
            previewUrl && "border-solid p-0",
          )}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={previewUrl}
              alt="Selected location"
              onLoad={handlePreviewLoaded}
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <ImageUp className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload or drop an image</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {/* Status line */}
        <div className="mt-3 min-h-[20px] text-sm">
          {status === "loading-model" && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading model…
            </p>
          )}
          {status === "classifying" && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Identifying location…
            </p>
          )}
          {status === "done" && topPrediction && locationPlace && (
            <p className="text-primary">
              Matched: {topPrediction.className} ({Math.round(topPrediction.probability * 100)}% confidence)
            </p>
          )}
          {status === "done" && topPrediction && !locationPlace && (
            <p className="text-muted-foreground">
              Not confident enough to guess — please search for the location below.
            </p>
          )}
          {status === "error" && errorMessage && (
            <p className="text-destructive">{errorMessage}</p>
          )}
        </div>

        {/* Location field — same search component as the main form */}
        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Location</span>
          <PlaceAutocomplete
            placeholder="Search for the correct location"
            value={locationLabel}
            onChange={(v) => {
              setLocationLabel(v);
              setLocationPlace(null);
            }}
            onSelect={(place) => {
              setLocationPlace(place);
              setLocationLabel(place.label);
            }}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!locationPlace}
            className={buttonVariants({ size: "md" })}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}