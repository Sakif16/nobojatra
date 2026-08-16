// Orchestration: decide which saved trips are due, gather their data once,
// judge every condition against it, and write an alert only on a false→true
// transition.
import "server-only";

import { buildDedupeKey, createAlert } from "@/lib/alerts";
import dbConnect from "@/lib/mongodb";
import SavedTrip from "@/models/SavedTrip";
import { buildEvaluationContext } from "./context";
import { CONDITION_EVALUATORS } from "./evaluators";
import type { SavedTripDocument, TripEvaluationSummary } from "./types";

/** How stale a trip's last evaluation must be before it is re-run. */
export const EVALUATION_THROTTLE_MS = 15 * 60 * 1000;

/**
 * Upper bound on trips evaluated in one run. Each trip costs one ORS route,
 * one traffic call, one weather call, and one fare quote, so an unbounded run
 * would be both slow and a good way to exhaust the ORS free tier.
 */
export const MAX_TRIPS_PER_RUN = 5;

export type UserEvaluationSummary = {
  evaluated: number;
  failed: number;
  alertsCreated: number;
  trips: TripEvaluationSummary[];
};

/**
 * Evaluates one trip's conditions and persists the outcome.
 *
 * The transition rule is the important part: an alert is written only when a
 * condition goes from not-triggered to triggered. A condition that stays true
 * across runs stays quiet, and one that could not be judged (provider down)
 * leaves its previous state untouched so the next good run does not read as a
 * fresh transition.
 */
export async function evaluateSavedTrip(
  trip: SavedTripDocument,
): Promise<TripEvaluationSummary> {
  const { context, route, notes } = await buildEvaluationContext(trip);
  const now = new Date();

  let conditionsEvaluated = 0;
  let conditionsSkipped = 0;
  let alertsCreated = 0;

  for (const condition of trip.conditions ?? []) {
    if (condition.isActive === false) {
      conditionsSkipped += 1;
      continue;
    }

    const evaluator = CONDITION_EVALUATORS[condition.type];

    if (!evaluator) {
      conditionsSkipped += 1;
      continue;
    }

    const result = evaluator(
      {
        type: condition.type,
        threshold: condition.threshold ?? null,
        level: condition.level ?? null,
      },
      context,
    );

    // null means "could not judge" — leave lastState alone.
    if (!result) {
      conditionsSkipped += 1;
      continue;
    }

    conditionsEvaluated += 1;

    const wasTriggered = condition.lastState === true;

    if (result.triggered && !wasTriggered) {
      const conditionId = String(condition._id);

      const alert = await createAlert({
        userId: trip.userId,
        savedTripId: String(trip._id),
        tripName: trip.name,
        conditionId,
        conditionType: condition.type,
        title: result.title,
        message: result.message,
        severity: result.severity,
        triggeredValue: result.value,
        thresholdLabel: result.thresholdLabel,
        dedupeKey: buildDedupeKey(conditionId, now),
      });

      if (alert) alertsCreated += 1;
      condition.lastTriggeredAt = now;
    }

    condition.lastState = result.triggered;
  }

  trip.route = route;
  trip.lastEvaluatedAt = now;
  await trip.save();

  return {
    savedTripId: String(trip._id),
    tripName: trip.name,
    conditionsEvaluated,
    conditionsSkipped,
    alertsCreated,
    notes,
  };
}

export type EvaluateOptions = {
  /** Ignore the throttle. Used by the cron entry point, not by the badge poll. */
  force?: boolean;
  limit?: number;
};

/** The trips due for evaluation, optionally narrowed to one user. */
async function findDueTrips(
  userId: string | null,
  { force = false, limit = MAX_TRIPS_PER_RUN }: EvaluateOptions,
) {
  await dbConnect();

  const staleBefore = new Date(Date.now() - EVALUATION_THROTTLE_MS);

  return (await SavedTrip.find({
    ...(userId ? { userId } : {}),
    isActive: true,
    // No conditions attached means nothing to check, so nothing to pay for.
    "conditions.0": { $exists: true },
    ...(force
      ? {}
      : {
          $or: [
            { lastEvaluatedAt: null },
            { lastEvaluatedAt: { $lte: staleBefore } },
          ],
        }),
  })
    // Nulls sort first ascending, so never-evaluated trips go to the front.
    .sort({ lastEvaluatedAt: 1 })
    .limit(Math.max(1, limit))) as unknown as SavedTripDocument[];
}

/**
 * Runs a batch sequentially rather than in parallel: the providers behind each
 * trip are rate-limited per key, and a burst of concurrent ORS calls is the
 * fastest way to get throttled.
 */
async function runTrips(trips: SavedTripDocument[]): Promise<UserEvaluationSummary> {
  const summary: UserEvaluationSummary = {
    evaluated: 0,
    failed: 0,
    alertsCreated: 0,
    trips: [],
  };

  for (const trip of trips) {
    try {
      const result = await evaluateSavedTrip(trip);
      summary.evaluated += 1;
      summary.alertsCreated += result.alertsCreated;
      summary.trips.push(result);
    } catch (error) {
      summary.failed += 1;
      console.error(`Alert evaluation failed for trip ${String(trip._id)}:`, error);

      // Stamp the attempt anyway. Without this a trip whose route can no
      // longer be resolved would be retried on every single badge poll.
      await SavedTrip.updateOne(
        { _id: trip._id },
        { $set: { lastEvaluatedAt: new Date() } },
      );
    }
  }

  return summary;
}

/** Evaluates the saved trips of one user that are due for it. */
export async function evaluateForUser(
  userId: string,
  options: EvaluateOptions = {},
): Promise<UserEvaluationSummary> {
  return runTrips(await findDueTrips(userId, options));
}

/**
 * Evaluates due trips across every user — the entry point a scheduled sweep
 * calls. Bounded by `limit` for the same reason as the per-user path, so a
 * cron tick costs a predictable number of provider calls.
 */
export async function evaluateDueTrips(
  options: EvaluateOptions = {},
): Promise<UserEvaluationSummary> {
  return runTrips(await findDueTrips(null, options));
}
