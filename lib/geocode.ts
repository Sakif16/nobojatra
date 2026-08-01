// Place search via OpenStreetMap's Nominatim — free, no API key required.
// Usage policy: max ~1 request/second, must send a descriptive User-Agent
// (browsers can't set User-Agent, so we identify via a query param instead).

export type PlaceResult = {
  label: string;
  lat: number;
  lng: number;
};

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query || query.trim().length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  // Bias results toward Bangladesh since that's where this app is used.
  url.searchParams.set("countrycodes", "bd");

  const res = await fetch(url.toString(), {
    headers: {
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    throw new Error("Place search failed");
  }

  const data: Array<{ display_name: string; lat: string; lon: string }> =
    await res.json();

  return data.map((item) => ({
    label: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");

  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "en" },
  });

  if (!res.ok) return "Current location";

  const data = await res.json();
  return data.display_name ?? "Current location";
}