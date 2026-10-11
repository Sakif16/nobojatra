import "server-only";

import { budgetReachedMessage, ProviderBudgetError, spendProviderBudget } from "@/lib/provider-budget";
import { createRateLimiter } from "@/lib/rate-limit";

const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

// Nominatim's usage policy requires a User-Agent that names the app and gives
// its operators a way to reach us. The repository URL does both without
// publishing an email address; set NOMINATIM_USER_AGENT to add one privately.
const DEFAULT_NOMINATIM_USER_AGENT =
  "NoboJatra/1.0 (+https://github.com/Sakif16/nobojatra)";

const NOMINATIM_TIMEOUT_MS = 5_000;

// Nominatim's usage policy allows roughly one request a second from the whole
// server, and going over it gets the server's address blocked. This ceiling is
// shared by every route that calls it, whoever the callers are.
const checkServerRateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

export function getNominatimConfig() {
  return {
    baseUrl: process.env.NOMINATIM_BASE_URL ?? DEFAULT_NOMINATIM_BASE_URL,
    userAgent: process.env.NOMINATIM_USER_AGENT ?? DEFAULT_NOMINATIM_USER_AGENT,
  };
}

/** A refusal or failure to reach Nominatim, with what to tell the caller. */
export class NominatimError extends Error {
  statusCode: number;
  userMessage: string;
  retryAfter: number | null;

  constructor(
    message: string,
    statusCode: number,
    userMessage: string,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "NominatimError";
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.retryAfter = retryAfter;
  }
}

/**
 * The one way this app calls Nominatim: under the server-wide ceiling, inside
 * the daily budget, with a timeout, and with upstream error text kept in the
 * server log rather than sent to the browser.
 */
export async function fetchNominatimJson<T>(url: URL, feature: string): Promise<T> {
  const ceiling = checkServerRateLimit("nominatim");

  if (!ceiling.allowed) {
    throw new NominatimError(
      "Server-wide Nominatim ceiling reached.",
      429,
      "Place lookups are busy right now. Please wait a moment and try again.",
      ceiling.retryAfter,
    );
  }

  try {
    await spendProviderBudget("nominatim");
  } catch (error) {
    if (error instanceof ProviderBudgetError) {
      throw new NominatimError(error.message, 429, budgetReachedMessage(feature));
    }
    throw error;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": getNominatimConfig().userAgent,
      },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
  } catch (error) {
    throw new NominatimError(
      error instanceof Error ? error.message : "Nominatim request failed.",
      502,
      "The place lookup service did not respond. Please try again.",
    );
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(`Nominatim returned ${response.status}:`, details.slice(0, 300));

    throw new NominatimError(
      `Nominatim returned ${response.status}.`,
      502,
      "The place lookup service returned an error. Please try again.",
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new NominatimError(
      "Nominatim response was not valid JSON.",
      502,
      "The place lookup service returned an invalid response.",
    );
  }
}
