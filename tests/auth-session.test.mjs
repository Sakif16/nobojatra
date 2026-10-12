import assert from "node:assert/strict";
import test from "node:test";
import { load, requirePackage } from "./support/load.mjs";

// Exercise the installed Better Auth server with its memory adapter: no live
// account, external email, provider call or database is involved.
test("real auth enforces cookie flags, changes passwords, revokes other sessions, and clears logout cookies", async () => {
  const saved = {};
  const values = { MONGODB_URI: "mongodb://localhost:27017", BETTER_AUTH_SECRET: "offline-test-secret-that-is-at-least-32-characters", BETTER_AUTH_URL: "https://demo.example" };
  for (const key of Object.keys(values)) { saved[key] = process.env[key]; process.env[key] = values[key]; }
  try {
    const { memoryAdapter } = requirePackage("better-auth/adapters/memory");
    const database = { user: [], session: [], account: [], verification: [] };
    let resetToken;
    const realAuth = requirePackage("better-auth");
    const { auth } = load("lib/auth.ts", {
      "better-auth": { ...realAuth, betterAuth: (options) => realAuth.betterAuth({
        ...options, emailAndPassword: { ...options.emailAndPassword, sendResetPassword: async ({ token }) => { resetToken = token; } },
      }) },
      "better-auth/api": requirePackage("better-auth/api"),
      mongodb: { MongoClient: class { db() { return {}; } } },
      "better-auth/adapters/mongodb": { mongodbAdapter: () => memoryAdapter(database) },
      "@/lib/account-cleanup": { deleteAccountData: async () => ({}) },
      "@/lib/mongodb": { MONGODB_DB: "offline-test" },
    });
    const request = (path, body, cookie, extraHeaders = {}) => auth.handler(new Request(`https://demo.example/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Origin: "https://demo.example", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const cookieFrom = (response) => response.headers.getSetCookie().find((value) => value.includes("session_token="))?.split(";")[0];
    const credentials = { email: "demo@example.com", password: "abcdefgh1" };
    const signup = await request("/sign-up/email", { name: "Offline Demo", ...credentials });
    assert.equal(signup.status, 200, await signup.clone().text());
    const tokenCookie = signup.headers.getSetCookie().find((value) => value.includes("session_token="));
    assert.match(tokenCookie, /;\s*Secure/i);
    assert.match(tokenCookie, /;\s*HttpOnly/i);
    assert.match(tokenCookie, /;\s*SameSite=Lax/i);
    assert.doesNotMatch(tokenCookie, /;\s*Domain=/i);
    const first = cookieFrom(signup);
    const login = await request("/sign-in/email", credentials);
    assert.equal(login.status, 200);
    const second = cookieFrom(login);
    const rejected = await request("/change-password", { currentPassword: credentials.password, newPassword: "noNumbersHere" }, second);
    assert.equal(rejected.status, 400);
    const changed = await request("/change-password", { currentPassword: credentials.password, newPassword: "newPassword2", revokeOtherSessions: false }, second);
    assert.equal(changed.status, 200, await changed.clone().text());
    const stale = await request("/get-session", undefined, first);
    assert.equal(await stale.json(), null);
    // Changing a password rotates the current session; use its new cookie.
    const current = cookieFrom(changed) ?? second;
    const resetRequested = await request("/request-password-reset", { email: credentials.email, redirectTo: "https://demo.example/reset-password" });
    assert.equal(resetRequested.status, 200);
    assert.ok(resetToken);
    const reset = await request("/reset-password", { token: resetToken, newPassword: "resetPassword3" });
    assert.equal(reset.status, 200);
    assert.equal(await (await request("/get-session", undefined, current)).json(), null);
    const resetLogin = await request("/sign-in/email", { email: credentials.email, password: "resetPassword3" });
    assert.equal(resetLogin.status, 200);
    const resetCookie = cookieFrom(resetLogin);
    const noPasswordDeletion = await request("/delete-user", {}, resetCookie);
    assert.equal(noPasswordDeletion.status, 400);
    const logout = await request("/sign-out", {}, resetCookie);
    assert.equal(logout.status, 200);
    assert.ok(logout.headers.getSetCookie().some((value) => value.includes("session_token=") && /Max-Age=0/i.test(value)));
    assert.equal(await (await request("/get-session", undefined, current)).json(), null);
    let throttled = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await request("/sign-in/email", { email: credentials.email, password: "incorrect9" }, undefined, { "x-forwarded-for": `198.51.100.${attempt + 1}`, "x-real-ip": `203.0.113.${attempt + 1}` });
      if (response.status === 429) {
        throttled = true;
        assert.ok(Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after")) > 0);
        break;
      }
      assert.equal(response.status, 401);
    }
    assert.equal(throttled, true);
  } finally {
    for (const key of Object.keys(values)) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
