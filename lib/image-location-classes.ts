// lib/image-location-classes.ts
// Maps each Teachable Machine class name to a real, geocoded location.
//
// Keys below match the exact class names trained in Teachable Machine
// (case-sensitive). Labels are the exact Bengali display text the user
// specified — shown verbatim in the location input field.
import type { PlaceResult } from "@/lib/geocode";

export const IMAGE_LOCATION_CLASSES: Record<string, PlaceResult> = {
  bracu_campus: {
    label:
      "ব্র্যাক বিশ্ববিদ্যালয়, ডিআইটি রোড, মেরুল বাড্ডা, গুলশান, ঢাকা, ঢাকা মহানগর, ঢাকা জেলা, ঢাকা বিভাগ, 1212, বাংলাদেশ",
    lat: 23.7725,
    lng: 90.4254,
  },
  jahangir_gate: {
    label:
      "Jahangir Gate Bus stop, পুরাতন বিমানবন্দর সড়ক, শাহীনবাগ, নাখালপাড়া, ঢাকা, ঢাকা মহানগর, ঢাকা জেলা, ঢাকা বিভাগ, 1208, বাংলাদেশ",
    lat: 23.7734,
    lng: 90.3968,
  },
  shapla_chottor: {
    label:
      "শাপলা চত্বর, ব্যাংক কলোনী, দক্ষিণ কমলাপুর, মতিঝিল, ঢাকা, ঢাকা মহানগর, ঢাকা জেলা, ঢাকা বিভাগ, 1203, বাংলাদেশ",
    lat: 23.7266,
    lng: 90.4216,
  },
};

// Below this confidence, the prediction is treated as "not confident enough"
// and the location field is left empty for the user to search manually,
// rather than auto-filling a likely-wrong guess.
export const MIN_CONFIDENCE = 0.6;

/**
 * Resolves a Teachable Machine class name to its geocoded PlaceResult, or
 * null if the name isn't recognized (shouldn't happen with a closed 3-class
 * model, but handled defensively rather than assumed).
 */
export function resolveLocationClass(className: string): PlaceResult | null {
  return IMAGE_LOCATION_CLASSES[className] ?? null;
}