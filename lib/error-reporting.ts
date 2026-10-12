import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const requests = new AsyncLocalStorage<{ requestId: string }>();

function getFailureStatus(error: unknown) {
  const value = error as { statusCode?: number; status?: number; message?: string } | null;
  const status = value?.statusCode ?? value?.status;
  if (typeof status === "number") return status;
  // Existing provider errors wrap status in a fixed message rather than a
  // field. Extract only the number; never emit the accompanying response text.
  const match = typeof value?.message === "string" ? /(?:Pathao|OpenWeatherMap)(?: forecast)? returned ([45]\d{2})/.exec(value.message) : null;
  return match ? Number(match[1]) : undefined;
}

export function classifyFailure(error: unknown) {
  const value = error as { name?: string; message?: string; statusCode?: number; status?: number } | null;
  const status = getFailureStatus(error);
  const message = typeof value?.message === "string" ? value.message : "";
  if (status === 429 || /budget|daily limit/i.test(message)) return "limit_reached";
  if (value?.name === "TimeoutError" || /timed? ?out|timeout/i.test(message)) return "timeout";
  if (/not (set|configured)|missing.*key/i.test(message)) return "not_configured";
  if (/invalid|malformed|not valid JSON|response is missing|unexpected.*response/i.test(message)) return "invalid_response";
  if (typeof status === "number" && status >= 400) return "upstream_error";
  return "unexpected_error";
}

/** Allowlisted fields only: never serialize errors, headers, bodies, URLs,
 * user identifiers or provider response text. Find events in host logs by ID. */
export function reportFailure(feature: string, provider: string, error: unknown) {
  const status = getFailureStatus(error);
  const event = {
    event: "feature_failure",
    time: new Date().toISOString(),
    requestId: requests.getStore()?.requestId ?? randomUUID(),
    feature,
    provider,
    category: classifyFailure(error),
    ...(typeof status === "number" && status >= 400 && status <= 599 ? { status } : {}),
  };
  console.warn(JSON.stringify(event));
  return event.requestId;
}

export function withRequestLogging<R extends Request, A extends unknown[]>(
  feature: string,
  provider: string,
  handler: (request: R, ...args: A) => Promise<Response>,
) {
  return (request: R, ...args: A) => requests.run({ requestId: randomUUID() }, async () => {
    let response: Response;
    try {
      response = await handler(request, ...args);
    } catch (error) {
      const requestId = reportFailure(feature, provider, error);
      response = Response.json({ success: false, message: "This request could not be completed. Please try again.", requestId }, { status: 500 });
    }
    response.headers.set("X-Request-ID", requests.getStore()!.requestId);
    return response;
  });
}
