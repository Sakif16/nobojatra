import { isEmailConfigured, isEmailVerificationRequired, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { deleteAccountData } from "@/lib/account-cleanup";
import { MONGODB_DB } from "@/lib/mongodb";

import { createAuthAttemptLimiter, getAuthSecurityOptions, isValidPassword, PASSWORD_REQUIREMENT_MESSAGE } from "@/lib/auth-security";
import { reportFailure } from "@/lib/error-reporting";
const DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists.";
const RESET_PASSWORD_TOKEN_TTL_SECONDS = 60 * 60;

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set — check .env.local and restart the dev server");
}

export const authMongoClient = new MongoClient(uri);
// Named explicitly so auth data never follows the URI path. Without a path the
// driver falls back to `test`, which would hide every existing account.
export const authDb = authMongoClient.db(MONGODB_DB);

const checkAuthAttempt = createAuthAttemptLimiter(process.env.BETTER_AUTH_SECRET ?? "");

export const auth = betterAuth({
  ...getAuthSecurityOptions(process.env),
  database: mongodbAdapter(authDb, { client: authMongoClient }),
  emailAndPassword: {
    enabled: true,
    // Users cannot sign in until their email is verified. Off until Mailjet is
    // fully set up (see isEmailVerificationRequired).
    requireEmailVerification: isEmailVerificationRequired(),
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
      });
    },
  },
  emailVerification: {
    // Send the verification email right after sign-up, and again whenever an
    // unverified user tries to sign in.
    sendOnSignUp: true,
    sendOnSignIn: true,
    // Once they click the link, log them straight in.
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    // Fire-and-forget, so response time does not reveal whether an address has
    // an account. Failures are already reported by sendEmail().
    sendVerificationEmail: async ({ user, url }) => {
      if (!isEmailConfigured()) {
        reportFailure("verification_email", "mailjet", new Error("Mailjet is not set up"));
        return;
      }
      void sendVerificationEmail({
        email: user.email,
        name: user.name,
        url,
      }).catch(() => {});
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
      // Better Auth is the single owner of account deletion. It removes
      // `session`, `account`, and `user`; this hook removes everything else.
      // Living here rather than in a route means the built-in
      // `/api/auth/delete-user` endpoint cascades too, instead of orphaning
      // every TripHistory, UserProfile, Place, Route, and Alert the user made.
      beforeDelete: async (user) => {
        try {
          const summary = await deleteAccountData(user.id, authDb);
          console.info(JSON.stringify({ event: "account_cleanup_complete", counts: summary }));
        } catch (error) {
          reportFailure("account_cleanup", "mongodb", error);

          // Fail closed. Throwing here stops Better Auth before it deletes the
          // user, so a partially cleaned account stays reachable and the user
          // can retry — the alternative is auth data gone and application data
          // stranded with no owner to delete it.
          throw new APIError("INTERNAL_SERVER_ERROR", {
            code: "ACCOUNT_CLEANUP_FAILED",
            message:
              "Your data could not be fully removed, so the account was not deleted. Please try again.",
          });
        }
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = ctx.body as { email?: unknown; newPassword?: unknown; password?: unknown; revokeOtherSessions?: boolean } | undefined;
      const email = body?.email;
      let identity = typeof email === "string" ? email.slice(0, 320) : null;
      if (ctx.path === "/change-password" || ctx.path === "/delete-user" || ctx.path === "/verify-password") {
        const session = await getSessionFromCtx(ctx);
        identity = session?.user.id ?? null;
      }
      if (identity) {
        const attempt = checkAuthAttempt(ctx.path, identity);
        if (attempt && !attempt.allowed) {
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "AUTH_ATTEMPTS_EXCEEDED", message: "Too many attempts. Please wait and try again.",
          }, { "Retry-After": String(attempt.retryAfter) });
        }
      }
      // Both deletion entry points require the current password, even if the
      // built-in endpoint would otherwise accept a fresh session alone.
      if (ctx.path === "/delete-user" && (typeof body?.password !== "string" || !body.password)) {
        throw new APIError("BAD_REQUEST", { code: "PASSWORD_REQUIRED", message: "Enter your password to confirm account deletion." });
      }
      const passwordPaths = ["/sign-up/email", "/reset-password", "/change-password", "/set-password"];
      if (!passwordPaths.includes(ctx.path)) return;
      const password = ctx.path === "/sign-up/email" ? body?.password : body?.newPassword;
      if (!isValidPassword(password)) {
        throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: PASSWORD_REQUIREMENT_MESSAGE });
      }
      if (ctx.path === "/change-password" && body) body.revokeOtherSessions = true;

      if (ctx.path === "/sign-up/email" && typeof email === "string") {
        const existingUser = await ctx.context.internalAdapter.findUserByEmail(
          email.toLowerCase(),
        );

        if (existingUser?.user) {
          throw new APIError("CONFLICT", {
            code: "EMAIL_ALREADY_EXISTS",
            message: DUPLICATE_EMAIL_MESSAGE,
          });
        }
      }

    }),
  },
});
