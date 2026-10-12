import "server-only";

import { createHmac } from "node:crypto";
import { createRateLimiter } from "@/lib/rate-limit";

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be 8–128 characters and include at least one number.";

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128 && /\d/.test(value);
}

/** Only enable a header after verifying that the host overwrites it. */
export function getAuthSecurityOptions(env: Record<string, string | undefined>) {
  const header = env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (header && !["x-forwarded-for", "x-real-ip", "cf-connecting-ip"].includes(header)) {
    throw new Error("AUTH_TRUSTED_IP_HEADER must be x-forwarded-for, x-real-ip or cf-connecting-ip.");
  }
  return {
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production" || env.BETTER_AUTH_URL?.startsWith("https://") === true,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" as const, path: "/" },
      crossSubDomainCookies: { enabled: false },
      // Empty means no header is trusted: Better Auth uses a shared per-path
      // bucket. Never disable IP tracking, which would disable its limiter.
      ipAddress: { ipAddressHeaders: header ? [header] : [] },
    },
    rateLimit: {
      enabled: true,
      storage: "memory" as const,
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 600, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 900, max: 3 },
        "/reset-password": { window: 900, max: 5 },
        "/change-password": { window: 900, max: 5 },
        "/delete-user": { window: 900, max: 5 },
        "/verify-password": { window: 60, max: 10 },
      },
    },
  };
}

/** Account-based limits also cover server-side auth.api calls, which bypass
 * Better Auth's HTTP limiter. Keys contain HMACs, never email addresses. */
export function createAuthAttemptLimiter(secret: string) {
  const rules = {
    "/sign-up/email": createRateLimiter({ windowMs: 600_000, max: 5 }),
    "/sign-in/email": createRateLimiter({ windowMs: 600_000, max: 10 }),
    "/request-password-reset": createRateLimiter({ windowMs: 900_000, max: 3 }),
    "/change-password": createRateLimiter({ windowMs: 900_000, max: 5 }),
    "/delete-user": createRateLimiter({ windowMs: 900_000, max: 5 }),
    "/verify-password": createRateLimiter({ windowMs: 600_000, max: 10 }),
  };
  return (path: string, identity: string, now?: number) => {
    const rule = rules[path as keyof typeof rules];
    if (!rule) return null;
    const key = createHmac("sha256", secret).update(identity.trim().toLowerCase()).digest("hex");
    return rule(key, now);
  };
}
