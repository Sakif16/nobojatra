/**
 * Where a fare estimate came from, as shown to the user.
 *
 * Every fare card, saved plan and alert baseline says which of the two it is,
 * because they are not the same kind of number: one is priced from the app's
 * own rate card, the other from the live Pathao lookup. When that lookup fails
 * the fare silently becomes a rate-card one, and without a label the two look
 * identical.
 *
 * Kept apart from ./fare-providers, which is server-only, so the cards can use
 * it.
 */
export type FareSource = "pathao_api" | "rate_card";

const FARE_SOURCE_LABELS: Record<FareSource, string> = {
  rate_card: "Rate-card estimate",
  pathao_api: "Live Pathao pricing",
};

/**
 * A short label for a fare's source, or null when it was never recorded —
 * plans saved before the source was stored have none, and a guess would be
 * worse than saying nothing.
 */
export function getFareSourceLabel(source: unknown): string | null {
  return source === "rate_card" || source === "pathao_api"
    ? FARE_SOURCE_LABELS[source]
    : null;
}
