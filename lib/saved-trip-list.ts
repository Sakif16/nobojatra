/**
 * Searching and ordering the saved-trips list in the browser. The list is
 * capped at twenty per country, so this is a convenience over rows already
 * loaded, not a query.
 */
export type SavedTripSort = "newest" | "name";

export const SAVED_TRIP_SORT_OPTIONS: Array<{ value: SavedTripSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name, A to Z" },
];

type Listed = {
  name: string;
  origin: { label: string };
  destination: { label: string };
  createdAt: string;
};

export function filterAndSortSavedTrips<T extends Listed>(
  trips: T[],
  query: string,
  sort: SavedTripSort,
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Every word typed has to appear somewhere: in the name or either place.
  const matching = trips.filter((trip) => {
    const text = `${trip.name} ${trip.origin.label} ${trip.destination.label}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return [...matching].sort((first, second) =>
    sort === "name"
      ? first.name.localeCompare(second.name, undefined, { sensitivity: "base" })
      : second.createdAt.localeCompare(first.createdAt),
  );
}
