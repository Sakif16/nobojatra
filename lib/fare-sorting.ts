/**
 * Ordering the fare list, and explaining an option that is not offered.
 *
 * Everything here works on data the fares page already has, so sorting never
 * asks the server for anything.
 */
export type FareSort = "default" | "fare" | "comfort" | "seats";

export const FARE_SORT_OPTIONS: Array<{ value: FareSort; label: string }> = [
  { value: "default", label: "Default order" },
  { value: "fare", label: "Lowest fare first" },
  { value: "comfort", label: "Most comfortable first" },
  { value: "seats", label: "Most seats first" },
];

type Sortable = {
  fare: { mid: number };
  comfortScore: number;
  maxPassengers: number;
};

/**
 * A new list in the chosen order. Options that tie keep the order they came
 * in, so switching sorts back and forth never shuffles equal rows.
 */
export function sortFareOptions<T extends Sortable>(options: T[], sort: FareSort): T[] {
  if (sort === "default") return [...options];

  const compare: Record<Exclude<FareSort, "default">, (first: T, second: T) => number> = {
    fare: (first, second) => first.fare.mid - second.fare.mid,
    comfort: (first, second) => second.comfortScore - first.comfortScore,
    seats: (first, second) => second.maxPassengers - first.maxPassengers,
  };

  return options
    .map((option, index) => ({ option, index }))
    .sort((first, second) => compare[sort](first.option, second.option) || first.index - second.index)
    .map(({ option }) => option);
}

type Excludable = {
  eligible: boolean;
  weatherBlocked?: boolean;
  restrictionReason?: string | null;
  maxPassengers: number;
};

/**
 * Why an option is not offered, and what would change that. Naming the rule
 * alone ("Max 4 passengers") left the user to work out that the remedy is on
 * the previous screen.
 */
export function describeUnavailable(option: Excludable, passengers: number) {
  const reasons: string[] = [];

  if (!option.eligible) {
    const seats = `${option.maxPassengers} passenger${option.maxPassengers === 1 ? "" : "s"}`;
    reasons.push(
      `Seats ${seats}; this trip has ${passengers}. Plan with ${option.maxPassengers} or fewer to use it.`,
    );
  }

  if (option.weatherBlocked) {
    reasons.push(
      `${option.restrictionReason ?? "Not offered in the current weather."} It may be offered again when conditions ease.`,
    );
  }

  return reasons.join(" ") || "Not offered for this trip.";
}

/** True when changing the party size would bring back at least one option. */
export function hasCapacityExclusion(options: Excludable[]) {
  return options.some((option) => !option.eligible);
}
