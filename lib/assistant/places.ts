import type { ResolvedPlace } from "@/lib/assistant/types";

/**
 * Turns a place as the user typed it ("home", "Dhanmondi", "St Pancras") into
 * coordinates, asking as little as possible:
 *
 *   1. a place the user already picked, or that was found earlier in this chat;
 *   2. one of their saved places ("home", "work", or a label of their own);
 *   3. the app's own place search, which is limited to their country and
 *      cached, and counts against the place-search budget.
 *
 * Search results are first narrowed to the trip's neighbourhood: when some
 * lie within NEAR_KM of the trip's other places, only those are considered.
 * Several places share a name — a Banani 377 km from Dhaka, a Kings Cross
 * village 70 km from London — and a trip almost always means the nearby one.
 *
 * Then a result is used without asking when it is the only one, when it is
 * clearly the best known (its Nominatim importance at least CLEAR_LEAD above
 * the next), when it is the only one named exactly as typed ("ধানমন্ডি" over
 * "পশ্চিম ধানমন্ডি"), when it is the only area among them — someone typing
 * "Dhanmondi" means the neighbourhood, not a shop with Dhanmondi in its
 * address — or when all of them lie within SAME_PLACE_KM of each other (a
 * station and the shops inside it are one place to drive to). Otherwise the
 * user is asked to pick. Results with the same label
 * are offered once.
 */

export type SearchResult = ResolvedPlace & { importance?: number; type?: string };

export type SavedPlace = { label: string; place: ResolvedPlace };

export type PlaceResolution =
  | { status: "ok"; place: ResolvedPlace; alternatives: ResolvedPlace[]; guessed: boolean }
  | { status: "choice"; options: ResolvedPlace[] }
  | { status: "none" }
  | { status: "error"; message: string };

export type PlaceLookup =
  | { status: "known"; place: ResolvedPlace }
  | { status: "results"; results: SearchResult[] }
  | { status: "error"; message: string };

export type PlaceSearch = (query: string) => Promise<{ ok: true; results: SearchResult[] } | { ok: false; message: string }>;

export const CLEAR_LEAD = 0.1;
export const MAX_CHOICES = 4;
export const NEAR_KM = 40;
export const SAME_PLACE_KM = 1;

/** Nominatim types that name an area people refer to by name. */
const AREA_TYPES = new Set(["suburb", "neighbourhood", "quarter", "city_district", "borough", "city", "town", "village", "administrative"]);

const SYNONYMS: Record<string, string[]> = {
  home: ["home", "house", "my home", "my house"],
  work: ["work", "office", "my work", "my office", "workplace"],
};

export function normalizePlaceQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(my|the)\s+/, "");
}

/** Apostrophes and dots are ignored, so "Kings Cross" and "King's Cross" are one name. */
const nameKey = (value: string) => normalizePlaceQuery(value).replace(/['’`.\-]/g, "");

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function findSavedPlace(query: string, savedPlaces: SavedPlace[]) {
  const wanted = normalizePlaceQuery(query);

  return savedPlaces.find((saved) => {
    const label = normalizePlaceQuery(saved.label);
    return label === wanted || (SYNONYMS[label] ?? []).some((name) => normalizePlaceQuery(name) === wanted);
  })?.place;
}

/** Step one: a place already known, or the search results to choose from. */
export async function lookupPlace(
  query: string,
  { resolvedPlaces = {}, savedPlaces = [], search }: {
    resolvedPlaces?: Record<string, ResolvedPlace>;
    savedPlaces?: SavedPlace[];
    search: PlaceSearch;
  },
): Promise<PlaceLookup> {
  const picked = resolvedPlaces[normalizePlaceQuery(query)];
  if (picked) return { status: "known", place: picked };

  const saved = findSavedPlace(query, savedPlaces);
  if (saved) return { status: "known", place: saved };

  const found = await search(query.trim());
  return found.ok ? { status: "results", results: found.results } : { status: "error", message: found.message };
}

/** Step two: pick from search results, near the trip's other places when that tells them apart. */
export function decidePlace(query: string, found: SearchResult[], near: { lat: number; lng: number }[] = []): PlaceResolution {
  const seen = new Set<string>();
  let results = found.filter((result) => {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng) || seen.has(result.label)) return false;
    seen.add(result.label);
    return true;
  });
  if (results.length === 0) return { status: "none" };

  const nearby = results.filter((result) => near.some((point) => distanceKm(result, point) <= NEAR_KM));
  if (nearby.length > 0) results = nearby;

  const toPlace = ({ label, lat, lng }: SearchResult): ResolvedPlace => ({ label, lat, lng });
  const pick = (chosen: SearchResult): PlaceResolution => ({
    status: "ok",
    place: toPlace(chosen),
    alternatives: results.filter((result) => result !== chosen).slice(0, MAX_CHOICES - 1).map(toPlace),
    guessed: results.length > 1,
  });

  const [first, second] = results;
  if (!second || (first.importance ?? 0) - (second.importance ?? 0) >= CLEAR_LEAD) return pick(first);

  const exact = results.filter((result) => nameKey(result.label.split(",")[0] ?? "") === nameKey(query));
  if (exact.length === 1) return pick(exact[0]);

  const areas = results.filter((result) => result.type && AREA_TYPES.has(result.type));
  if (areas.length === 1) return pick(areas[0]);

  // Checked after the name and area rules, so "Dhanmondi" is still the area
  // rather than the first shop on its list, though both are a block apart.
  if (results.every((result) => distanceKm(result, first) <= SAME_PLACE_KM)) return pick(exact[0] ?? first);

  return { status: "choice", options: results.slice(0, MAX_CHOICES).map(toPlace) };
}

/** Both steps for one place on its own. */
export async function resolvePlace(
  query: string,
  options: { resolvedPlaces?: Record<string, ResolvedPlace>; savedPlaces?: SavedPlace[]; search: PlaceSearch; near?: { lat: number; lng: number }[] },
): Promise<PlaceResolution> {
  const looked = await lookupPlace(query, options);
  if (looked.status === "known") return { status: "ok", place: looked.place, alternatives: [], guessed: false };
  if (looked.status === "error") return looked;
  return decidePlace(query, looked.results, options.near);
}
