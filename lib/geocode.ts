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

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error("Unable to fetch place suggestions.");
  }

  const payload = (await res.json()) as ApiResponse<PlaceResult[]>;

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

  const res = await fetch(url.toString());

  if (!res.ok) return "Current location";

  const payload = (await res.json()) as ApiResponse<PlaceResult>;

  if (!payload.success) return "Current location";

  return payload.data.label;
}
