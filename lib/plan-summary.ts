/**
 * A saved plan as a few lines of plain text, for the "Copy plan" button.
 *
 * It is what someone would paste into a message, so it carries the same
 * caveat the screen does: these are estimates and nothing has been booked.
 */
type PlanForSummary = {
  originLabel: string;
  destinationLabel: string;
  stopCount: number;
  passengerCount: number;
  distanceKm: number | null;
  durationMin: number | null;
  vehicleName: string | null;
  fare: string | null;
  departure: string | null;
};

export function buildPlanSummary(plan: PlanForSummary) {
  const route = [
    `${plan.originLabel} → ${plan.destinationLabel}`,
    plan.stopCount > 0 ? `${plan.stopCount} stop${plan.stopCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const details = [
    plan.distanceKm != null ? `${plan.distanceKm} km` : null,
    plan.durationMin != null ? `about ${Math.round(plan.durationMin)} min` : null,
    `${plan.passengerCount} passenger${plan.passengerCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    "NoboJatra trip plan",
    route,
    plan.departure ? `Departing ${plan.departure}` : null,
    details,
    plan.vehicleName
      ? `${plan.vehicleName}${plan.fare ? `, estimated fare ${plan.fare}` : ""}`
      : null,
    "Estimates only. This is a plan, not a booking.",
  ]
    .filter(Boolean)
    .join("\n");
}
