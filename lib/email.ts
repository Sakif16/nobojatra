// lib/email.ts
// The one place that talks to Mailjet. Everything that sends mail goes through
// sendEmail(); the templates below only build the subject and body.
//
// Plain fetch against Mailjet's v3.1 Send API, so there is no SDK to install.
import "server-only";

import { isConfigured } from "@/lib/env";
import { escapeHtml } from "@/lib/escape-html";
import { reportFailure } from "@/lib/error-reporting";

const MAILJET_URL = "https://api.mailjet.com/v3.1/send";
const SEND_TIMEOUT_MS = 10_000;

type Env = Record<string, string | undefined>;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Short name used in failure reports, e.g. "password_reset_email". */
  event: string;
};

/** Mailjet needs the API key, the secret key and a verified sender address. */
export function isEmailConfigured(env: Env = process.env) {
  return (
    isConfigured(env.MAILJET_API_KEY) &&
    isConfigured(env.MAILJET_SECRET_KEY) &&
    isConfigured(env.MAIL_FROM)
  );
}

/**
 * Whether sign-in should wait for a verified email. A sender verified in
 * Mailjet can email anyone, so once mail is fully set up verification is
 * enforced; before that it stays off so nobody is locked out.
 */
export function isEmailVerificationRequired(env: Env = process.env) {
  return isEmailConfigured(env);
}

/** Accepts `name@example.com` or `NoboJatra <name@example.com>`. */
export function parseSender(value: string) {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>]+)>\s*$/.exec(value);
  if (match) return { Email: match[2].trim(), Name: match[1]?.trim() || "NoboJatra" };
  return { Email: value.trim(), Name: "NoboJatra" };
}

/**
 * Sends one email through Mailjet. Throws when mail is not set up or Mailjet
 * refuses the message; the failure is reported with the status code only,
 * never the response body.
 */
export async function sendEmail({ to, subject, html, text, event }: EmailMessage) {
  if (!isEmailConfigured()) throw new Error("Mailjet is not set up (MAILJET_API_KEY, MAILJET_SECRET_KEY, MAIL_FROM)");

  const credentials = Buffer.from(
    `${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`,
  ).toString("base64");

  let response: Response;
  try {
    response = await fetch(MAILJET_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        Messages: [
          {
            From: parseSender(process.env.MAIL_FROM as string),
            To: [{ Email: to }],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
          },
        ],
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    reportFailure(event, "mailjet", error);
    throw new Error("Email delivery failed.");
  }

  if (!response.ok) {
    reportFailure(event, "mailjet", { statusCode: response.status });
    throw new Error("Email delivery failed.");
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

function safeLink(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Email links must be http or https.");
  }
  return parsed.toString();
}

function layout(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px">NoboJatra</h2>
  ${body}
</div>`;
}

function button(url: string, label: string) {
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>
  <p style="font-size:12px;color:#666">If the button does not work, copy this link: ${escapeHtml(url)}</p>`;
}

export async function sendPasswordResetEmail({ email, name, url }: { email: string; name: string; url: string }) {
  const link = safeLink(url);
  const greeting = name || "there";
  await sendEmail({
    to: email,
    event: "password_reset_email",
    subject: "Reset your NoboJatra password",
    html: layout(`<p>Hi ${escapeHtml(greeting)},</p>
  <p>We received a request to reset your NoboJatra password.</p>
  ${button(link, "Reset your password")}
  <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`),
    text: `Hi ${greeting},\n\nWe received a request to reset your NoboJatra password.\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
  });
}

export async function sendVerificationEmail({ email, name, url }: { email: string; name: string; url: string }) {
  const link = safeLink(url);
  const greeting = name || "there";
  await sendEmail({
    to: email,
    event: "verification_email",
    subject: "Verify your NoboJatra email",
    html: layout(`<p>Hi ${escapeHtml(greeting)},</p>
  <p>Welcome to NoboJatra. Please verify this email address for your account.</p>
  ${button(link, "Verify email")}
  <p>If you did not request this, you can ignore this email.</p>`),
    text: `Hi ${greeting},\n\nWelcome to NoboJatra. Please verify this email address for your account.\n\nVerify email: ${link}\n\nIf you did not request this, you can ignore this email.`,
  });
}
