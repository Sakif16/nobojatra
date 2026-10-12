import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

const security = load("lib/auth-security.ts");

test("the password rule applies to length, type and numbers", () => {
  for (const value of [null, 12345678, "a1", "abcdefgh", "a".repeat(128) + "1"]) {
    assert.equal(security.isValidPassword(value), false);
  }
  assert.equal(security.isValidPassword("abcdefg1"), true);
  assert.equal(security.isValidPassword("a".repeat(127) + "1"), true);
});

test("auth ignores forwarding headers until an operator explicitly trusts one", () => {
  const options = security.getAuthSecurityOptions({ NODE_ENV: "production", BETTER_AUTH_URL: "https://demo.example" });
  assert.deepEqual(options.advanced.ipAddress.ipAddressHeaders, []);
  assert.equal(options.advanced.useSecureCookies, true);
  assert.equal(options.advanced.defaultCookieAttributes.httpOnly, true);
  assert.equal(options.advanced.defaultCookieAttributes.sameSite, "lax");
  assert.equal(options.advanced.crossSubDomainCookies.enabled, false);
  assert.equal(options.session.cookieCache.enabled, false);
  assert.equal(options.session.freshAge, 900);
  assert.equal(options.rateLimit.enabled, true);
  assert.equal(options.rateLimit.customRules["/sign-up/email"].max, 5);
  assert.equal(options.rateLimit.customRules["/verify-password"].max, 10);
  assert.deepEqual(security.getAuthSecurityOptions({ AUTH_TRUSTED_IP_HEADER: "x-real-ip" }).advanced.ipAddress.ipAddressHeaders, ["x-real-ip"]);
  assert.throws(() => security.getAuthSecurityOptions({ AUTH_TRUSTED_IP_HEADER: "made-up-header" }));
});

test("account limits normalize email addresses and expire without trusting caller headers", () => {
  const check = security.createAuthAttemptLimiter("test-secret");
  for (let count = 0; count < 5; count++) assert.equal(check("/sign-up/email", " Demo@Example.com ", 0).allowed, true);
  assert.equal(check("/sign-up/email", "demo@example.com", 1).allowed, false);
  assert.equal(check("/sign-up/email", "other@example.com", 1).allowed, true);
  assert.equal(check("/sign-up/email", "demo@example.com", 600_000).allowed, true);
});

function loadAuth() {
  class APIError extends Error {
    constructor(status, body) { super(body.message); this.status = status; this.code = body.code; }
  }
  const previous = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://localhost:27017";
  try {
    return load("lib/auth.ts", {
      "better-auth": { betterAuth: (options) => options },
      "better-auth/api": {
        APIError,
        createAuthMiddleware: (fn) => fn,
        getSessionFromCtx: async (ctx) => ctx.testSession,
      },
      mongodb: { MongoClient: class { db() { return {}; } } },
      "better-auth/adapters/mongodb": { mongodbAdapter: () => ({}) },
      "@/lib/account-cleanup": { deleteAccountData: async () => ({}) },
      "@/lib/mongodb": { MONGODB_DB: "test" },
    }).auth;
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
}

test("the actual auth hook validates changes and resets, and throttles before duplicate-email lookup", async () => {
  const auth = loadAuth();
  let lookups = 0;
  const makeContext = (path, body) => ({
    path, body,
    setHeader() {},
    testSession: { user: { id: "owner-a" } },
    context: { internalAdapter: { findUserByEmail: async () => { lookups++; return { user: { id: "existing" } }; } } },
  });
  for (const path of ["/sign-up/email", "/reset-password", "/change-password", "/set-password"]) {
    const ctx = makeContext(path, { password: "weak", newPassword: "weak" });
    await assert.rejects(auth.hooks.before(ctx), /8–128 characters/);
  }
  const change = makeContext("/change-password", { newPassword: "abcdefg1", revokeOtherSessions: false });
  await auth.hooks.before(change);
  assert.equal(change.body.revokeOtherSessions, true);
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(auth.hooks.before(makeContext("/sign-up/email", { email: "exists@example.com", password: "abcdefg1" })), /already exists/);
  }
  await assert.rejects(auth.hooks.before(makeContext("/sign-up/email", { email: "EXISTS@example.com", password: "abcdefg1" })), /Too many attempts/);
  assert.equal(lookups, 5);
  await assert.rejects(auth.hooks.before(makeContext("/delete-user", {})), /password to confirm/);
  assert.equal(auth.emailAndPassword.revokeSessionsOnPasswordReset, true);
});
