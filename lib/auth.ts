import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be at least 8 characters and include at least one number.";
const DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists.";
const RESET_PASSWORD_TOKEN_TTL_SECONDS = 60 * 60;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendPasswordResetEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "NoboJatra <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const safeName = escapeHtml(name || "there");
  const safeUrl = escapeHtml(url);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Reset your NoboJatra password",
      html: `
        <p>Hi ${safeName},</p>
        <p>We received a request to reset your NoboJatra password.</p>
        <p><a href="${safeUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      `,
      text: `Hi ${name || "there"},

We received a request to reset your NoboJatra password.

Reset your password: ${url}

This link expires in 1 hour. If you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to send password reset email: ${details}`);
  }
}

async function sendEmailVerificationEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "NoboJatra <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const safeName = escapeHtml(name || "there");
  const safeUrl = escapeHtml(url);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Verify your NoboJatra email",
      html: `
        <p>Hi ${safeName},</p>
        <p>Please verify this email address for your NoboJatra account.</p>
        <p><a href="${safeUrl}">Verify email</a></p>
        <p>If you did not request this, you can ignore this email.</p>
      `,
      text: `Hi ${name || "there"},

Please verify this email address for your NoboJatra account.

Verify email: ${url}

If you did not request this, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to send email verification email: ${details}`);
  }
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set — check .env.local and restart the dev server");
}

export const authMongoClient = new MongoClient(uri);
export const authDb = authMongoClient.db();

export const auth = betterAuth({
  database: mongodbAdapter(authDb, { client: authMongoClient }),
  emailAndPassword: {
    enabled: true,
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
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmailVerificationEmail({
        email: user.email,
        name: user.name,
        url,
      });
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" && ctx.path !== "/reset-password") {
        return;
      }

      const body =
        ctx.body as
          | { email?: unknown; newPassword?: unknown; password?: unknown }
          | undefined;
      const email = body?.email;
      const password = ctx.path === "/reset-password" ? body?.newPassword : body?.password;

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

      if (typeof password !== "string" || !/\d/.test(password)) {
        throw new APIError("BAD_REQUEST", {
          code: "PASSWORD_MISSING_NUMBER",
          message: PASSWORD_REQUIREMENT_MESSAGE,
        });
      }
    }),
  },
});
