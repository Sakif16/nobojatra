/**
 * Reads a request body that is meant to be a JSON object.
 *
 * `req.json()` only fails on text that is not JSON. `null`, `[]`, `"x"` and
 * `7` all parse, and a handler that then reads a field off the result either
 * throws — a 500 for what is a caller's mistake — or quietly treats the body
 * as empty. Every handler that takes an object goes through here instead and
 * answers both cases with a 400.
 */
export type JsonObjectResult<T> =
  | { ok: true; body: T }
  | { ok: false; message: string };

export async function readJsonObject<T extends object = Record<string, unknown>>(
  req: Request,
): Promise<JsonObjectResult<T>> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return { ok: false, message: "Request body must be valid JSON." };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  return { ok: true, body: body as T };
}
