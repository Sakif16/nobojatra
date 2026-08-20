// lib/image-classifier.ts
// Wraps the Teachable Machine image model. Everything here runs entirely in
// the browser via TensorFlow.js — no server round-trip, no API route.
"use client";

// Matches the shape @teachablemachine/image returns from model.predict()
export type LocationPrediction = {
  className: string;
  probability: number;
};

// The model + its dependencies (@tensorflow/tfjs) are a large bundle with no
// reason to load on every page — this is only pulled in the first time
// someone actually opens the photo-upload modal.
let modelPromise: Promise<{
  predict: (
    image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  ) => Promise<LocationPrediction[]>;
}> | null = null;

function getModelBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_TM_MODEL_URL;
  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_TM_MODEL_URL is not set — point it at your Teachable Machine model's shareable link, e.g. https://teachablemachine.withgoogle.com/models/XXXXXXXX/",
    );
  }
  // Normalize so callers can set the env var with or without a trailing slash
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

// Loads the model exactly once and caches the promise — every subsequent
// call (re-opening the modal, classifying a second image) reuses it instead
// of re-downloading model.json/weights.bin/metadata.json each time.
async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tmImage = await import("@teachablemachine/image");
      const baseUrl = getModelBaseUrl();
      return tmImage.load(`${baseUrl}model.json`, `${baseUrl}metadata.json`);
    })();
  }

  return modelPromise;
}

/**
 * Classifies an already-loaded <img> element against the 3 trained classes.
 * Returns predictions sorted best-first — the caller decides what confidence
 * threshold counts as "confident enough" to auto-fill a location.
 */
export async function classifyLocationImage(
  image: HTMLImageElement,
): Promise<LocationPrediction[]> {
  const model = await getModel();
  const predictions = await model.predict(image);
  return [...predictions].sort((a, b) => b.probability - a.probability);
}