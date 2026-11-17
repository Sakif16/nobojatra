import type { AssistantMessage, Suggestion, TripCard } from "@/lib/assistant/types";

/**
 * Next steps offered under a trip card, chosen in code from what the card
 * shows — so they are instant, never something the assistant cannot do, and
 * cost nothing until pressed. Anything already asked in the chat is skipped.
 * Up to three of them send a message; "Add a stop…" always comes last (while
 * the trip has room for a stop) and fills the message box for the user to
 * finish instead of sending.
 */

export const MAX_SUGGESTIONS = 4;
const MAX_STOPS = 6;

const shortName = (label: string) => label.split(",")[0]?.trim() || label;

export function suggestNextSteps(card: TripCard | null, history: AssistantMessage[]): Suggestion[] {
  if (!card) return [];

  const items: Suggestion[] = [];
  const shown = card.routes.findIndex((route) => route.id === card.routeId);
  const other = card.routes.findIndex((_, index) => index !== shown);

  if (card.preference !== "cheapest" && card.rides.length > 1) {
    items.push({ label: "Cheapest ride", message: "Show the cheapest ride for this trip." });
  }
  if (other >= 0) {
    items.push({ label: `Show route ${other + 1}`, message: `Show the fares for route ${other + 1}.` });
  }
  if (!card.departureLabel) {
    items.push({ label: "Leave in an hour", message: "Same trip, but leaving in one hour." });
  }
  items.push({
    label: "Return trip",
    message: `Plan the return trip from ${shortName(card.destination.label)} to ${shortName(card.origin.label)}.`,
  });

  const asked = new Set(history.filter((message) => message.role === "user").map((message) => message.content.trim().toLowerCase()));
  const sending = items.filter((item) => !asked.has(item.message.trim().toLowerCase())).slice(0, MAX_SUGGESTIONS - 1);
  return card.stops.length < MAX_STOPS
    ? [...sending, { label: "Add a stop…", message: "Add a stop at ", fill: true }]
    : sending;
}
