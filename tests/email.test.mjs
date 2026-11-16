import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./support/load.mjs";

const email = load("lib/email.ts");
const NAMES = ["MAILJET_API_KEY", "MAILJET_SECRET_KEY", "MAIL_FROM"];

function withMailjet(fn) {
  const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  return async () => {
    try { await fn(); } finally {
      for (const name of NAMES) {
        if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
      }
      globalThis.fetch = savedFetch;
    }
  };
}

function configure() {
  process.env.MAILJET_API_KEY = "api-key";
  process.env.MAILJET_SECRET_KEY = "secret-key";
  process.env.MAIL_FROM = "NoboJatra <hi@example.com>";
}

test("sendEmail refuses to run until Mailjet is fully set up", withMailjet(async () => {
  for (const name of NAMES) delete process.env[name];
  await assert.rejects(email.sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t", event: "x" }), /Mailjet is not set up/);
  configure();
  delete process.env.MAILJET_SECRET_KEY;
  await assert.rejects(email.sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t", event: "x" }), /Mailjet is not set up/);
}));

test("sendEmail posts to Mailjet with basic auth and the parsed sender", withMailjet(async () => {
  configure();
  let call;
  globalThis.fetch = async (url, init) => { call = { url, init }; return { ok: true, status: 200 }; };
  await email.sendEmail({ to: "a@b.co", subject: "Hello", html: "<p>h</p>", text: "t", event: "x" });
  assert.equal(call.url, "https://api.mailjet.com/v3.1/send");
  assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from("api-key:secret-key").toString("base64")}`);
  const message = JSON.parse(call.init.body).Messages[0];
  assert.deepEqual(message.From, { Email: "hi@example.com", Name: "NoboJatra" });
  assert.deepEqual(message.To, [{ Email: "a@b.co" }]);
  assert.equal(message.Subject, "Hello");
}));

test("the sender can be a bare address or a named one", () => {
  assert.deepEqual(email.parseSender("hi@example.com"), { Email: "hi@example.com", Name: "NoboJatra" });
  assert.deepEqual(email.parseSender('"Team" <hi@example.com>'), { Email: "hi@example.com", Name: "Team" });
});

test("a Mailjet rejection becomes a delivery error", withMailjet(async () => {
  configure();
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(email.sendVerificationEmail({ email: "a@b.co", name: "A", url: "https://x.test/v" }), /delivery failed/);
}));

test("templates escape the name and reject non-http links", withMailjet(async () => {
  configure();
  let message;
  globalThis.fetch = async (_url, init) => { message = JSON.parse(init.body).Messages[0]; return { ok: true, status: 200 }; };
  await email.sendPasswordResetEmail({ email: "a@b.co", name: "<script>x</script>", url: "https://x.test/reset?token=1" });
  assert.ok(!message.HTMLPart.includes("<script>"));
  await assert.rejects(email.sendPasswordResetEmail({ email: "a@b.co", name: "A", url: "javascript:alert(1)" }), /http/);
}));

test("sign-in only requires a verified email once all three Mailjet values are set", () => {
  assert.equal(email.isEmailVerificationRequired({}), false);
  assert.equal(email.isEmailVerificationRequired({ MAILJET_API_KEY: "k", MAILJET_SECRET_KEY: "s" }), false);
  assert.equal(email.isEmailVerificationRequired({ MAILJET_API_KEY: "k", MAILJET_SECRET_KEY: "s", MAIL_FROM: "hi@example.com" }), true);
  assert.equal(email.isEmailVerificationRequired({ MAILJET_API_KEY: "your_mailjet_api_key", MAILJET_SECRET_KEY: "s", MAIL_FROM: "hi@example.com" }), false);
});
