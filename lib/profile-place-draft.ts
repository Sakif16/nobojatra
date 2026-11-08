import type { PlaceResult } from "@/lib/geocode";

type PlaceDraft = { label: string; placeLabel: string; place: PlaceResult | null };

export function placeAfterTextChange(place: PlaceResult | null, text: string) {
  return text === place?.label ? place : null;
}

export function savedPlaceDraftError(rows: PlaceDraft[], customRows: PlaceDraft[]) {
  if (rows.some((row) => row.placeLabel.trim() && !row.place)) {
    return "Choose each saved place from the suggestions, or clear its address.";
  }
  if (customRows.some((row) => row.place && !row.label.trim())) {
    return "Give each saved place a label.";
  }
  return null;
}
