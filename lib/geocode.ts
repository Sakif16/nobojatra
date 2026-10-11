import { readJson } from "@/lib/read-json";

export type PlaceResult = {
  id?: string;
  label: string;
  lat: number;
  lng: number;
};

type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      message?: string;
    };

export async function searchPlaces(
  query: string,
  country?: string,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 2) return [];

  const url = new URL("/api/trip-input/autocomplete", window.location.origin);
  url.searchParams.set("query", normalizedQuery);

  // Omitted rather than defaulted here — the endpoint resolves a missing or
  // unrecognised country itself, so the landing page can search without one.
  if (country) {
    url.searchParams.set("country", country);
  }

  const res = await fetch(url.toString(), { signal });

  if (!res.ok) {
    throw new Error("Unable to fetch place suggestions.");
  }

  const payload = await readJson<ApiResponse<PlaceResult[]>>(res);

  if (!payload.success) {
    throw new Error(payload.message ?? "Unable to fetch place suggestions.");
  }

  return payload.data;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  const url = new URL("/api/trip-input/current-location", window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));

  // The label is a nicety: the coordinates are already known, so any failure
  // here falls back to a plain name rather than stopping the user.
  try {
    const res = await fetch(url.toString());

    if (!res.ok) return "Current location";

    const payload = await readJson<ApiResponse<PlaceResult>>(res);

    return payload.success ? payload.data.label : "Current location";
  } catch {
    return "Current location";
  }
}
