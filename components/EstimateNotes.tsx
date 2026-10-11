import { cn } from "@/lib/utils";

type Props = {
  /**
   * Set where each vehicle shows its own travel time. Those are the car-route
   * time scaled by vehicle type, so the note says so; elsewhere the one time
   * shown is the car route's own.
   */
  adjustedTimes?: boolean;
  className?: string;
};

/**
 * The two caveats every fare and ranking screen has to carry: a fare band is
 * not a quote from anyone, and every distance and time starts from one car
 * route regardless of the vehicle being priced.
 */
export default function EstimateNotes({ adjustedTimes = false, className }: Props) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Fare ranges are estimates based on approximate rates, not quotes from any
      provider.{" "}
      {adjustedTimes
        ? "Distance and time start from a car route; times for other vehicle types are adjusted estimates, not measured."
        : "Distance and time come from a car route, whichever vehicle you pick."}
    </p>
  );
}
