/**
 * Reads an API response as JSON, in the browser.
 *
 * `response.json()` throws a SyntaxError when the body is not JSON — which is
 * what arrives when the host itself answers instead of the app: an HTML error
 * page from a proxy, a timeout page, a sign-in redirect. Shown as-is that
 * reads "Unexpected token '<'", and where the call sits outside a try block it
 * leaves a button stuck on "Saving…".
 *
 * This turns that case into an error with a sentence a person can read. Call
 * sites keep their own handling for the errors the API reports in JSON.
 */
export class UnexpectedResponseError extends Error {
  status: number;

  constructor(status: number) {
    super(
      status >= 500 || status === 0
        ? "The server is not responding properly right now. Please try again in a moment."
        : "The server sent an unexpected response. Please try again.",
    );
    this.name = "UnexpectedResponseError";
    this.status = status;
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("json")) {
    throw new UnexpectedResponseError(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UnexpectedResponseError(response.status);
  }
}
