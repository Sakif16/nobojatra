// Read-only public-host checks. This deliberately creates no account or session
// and cannot certify authenticated cookies or the host's proxy configuration.
const target = new URL(process.argv[2] ?? process.env.BETTER_AUTH_URL ?? "https://nobojatra.onrender.com");
if (target.protocol !== "https:" || target.username || target.password) {
  throw new Error("Supply an HTTPS origin without credentials.");
}
let failed = false;
for (const path of ["/signin", "/api/auth/get-session"]) {
  try {
    const response = await fetch(new URL(path, target.origin), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    const securityHeaders = Object.fromEntries(["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy"].map((name) => [name, response.headers.has(name)]));
    const cookies = response.headers.getSetCookie().map((cookie) => ({
      secure: /;\s*secure(?:;|$)/i.test(cookie), httpOnly: /;\s*httponly(?:;|$)/i.test(cookie),
      sameSite: /;\s*samesite=(strict|lax|none)/i.exec(cookie)?.[1] ?? null,
      domainScoped: /;\s*domain=/i.test(cookie),
    }));
    console.info(JSON.stringify({ host: target.hostname, path, status: response.status, securityHeaders, cookieAttributes: cookies }));
    if (response.status >= 400) failed = true;
    await response.body?.cancel();
  } catch {
    failed = true;
    console.error(JSON.stringify({ host: target.hostname, path, error: "unreachable_or_timeout" }));
  }
}
console.info("Authenticated cookie, logout, reset-revocation and proxy-header checks require a test account and hosting configuration; no claim is made by these public checks.");
if (failed) process.exitCode = 1;
