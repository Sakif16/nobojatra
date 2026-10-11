import "server-only";

import connectMongoDB from "@/lib/mongodb";
import ProviderUsage from "@/models/ProviderUsage";

/**
 * A daily ceiling on calls to each outside provider.
 *
 * Rate limits slow one caller down; they do not stop a shared demo from
 * spending a whole free-tier allowance over a day. This counts every upstream
 * call and refuses the next one once the day's allowance is gone, so the worst
 * case is a feature that says it has hit its limit, not a blocked key or a
 * bill.
 *
 * The count lives in the database rather than in memory because the host
 * restarts the process on every deploy and after idle periods, and each
 * restart would otherwise hand out a fresh allowance.
 *
 * The defaults sit under what each provider's free plan allowed when this was
 * written. Check them against the plans actually in use, and override any of
 * them with DEMO_BUDGET_<PROVIDER>, for example DEMO_BUDGET_NOMINATIM=500.
 */
export const PROVIDER_DAILY_BUDGETS = {
  nominatim: 2000,
  openrouteservice: 1500,
  tomtom_routing: 2000,
  tomtom_tiles: 20000,
  openweather: 800,
  pathao: 1000,
} as const;

export type Provider = keyof typeof PROVIDER_DAILY_BUDGETS;

export class ProviderBudgetError extends Error {
  provider: Provider;

  constructor(provider: Provider, budget: number) {
    super(`Daily demo budget of ${budget} calls reached for ${provider}.`);
    this.name = "ProviderBudgetError";
    this.provider = provider;
  }
}

export function getDailyBudget(provider: Provider) {
  const override = Number(process.env[`DEMO_BUDGET_${provider.toUpperCase()}`]);

  return Number.isInteger(override) && override >= 0
    ? override
    : PROVIDER_DAILY_BUDGETS[provider];
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

async function addUsage(provider: Provider, day: string, calls: number) {
  const record = (await ProviderUsage.findOneAndUpdate(
    { provider, day },
    { $inc: { count: calls } },
    { upsert: true, new: true },
  ).lean()) as { count?: number } | null;

  return record?.count ?? calls;
}

/**
 * Records `calls` upstream calls about to be made, and throws
 * ProviderBudgetError instead if they would exceed today's allowance.
 *
 * Call it immediately before the request, not for cache hits.
 */
export async function spendProviderBudget(provider: Provider, calls = 1) {
  const budget = getDailyBudget(provider);
  const day = new Date().toISOString().slice(0, 10);
  let used: number;

  try {
    await connectMongoDB();

    try {
      used = await addUsage(provider, day, calls);
    } catch (error) {
      // Two first calls of the day can both try to create the counter.
      if (!isDuplicateKeyError(error)) throw error;
      used = await addUsage(provider, day, calls);
    }
  } catch (error) {
    // The budget is a guard, not a dependency: if the counter cannot be read
    // the call goes ahead, as it would have before the guard existed.
    console.warn(`Provider budget check failed for ${provider}:`, error);
    return;
  }

  if (used > budget) {
    throw new ProviderBudgetError(provider, budget);
  }
}

/** What a user is told when a feature's provider allowance is spent. */
export function budgetReachedMessage(feature: string) {
  return `The demo has reached today's limit for ${feature}. It resets at midnight UTC.`;
}
