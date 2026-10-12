import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { load, root } from "./support/load.mjs";

const reporting = load("lib/error-reporting.ts");

test("failure categories distinguish timeout, configuration, limits and bad responses", () => {
  for (const [error, category] of [
    [{ name: "TimeoutError" }, "timeout"], [{ statusCode: 429 }, "limit_reached"],
    [new Error("API key not set"), "not_configured"], [new Error("Malformed response"), "invalid_response"],
    [{ status: 503 }, "upstream_error"], [new Error("Pathao returned 503."), "upstream_error"],
    [new Error("OpenWeatherMap forecast was not valid JSON."), "invalid_response"], [new Error("private details"), "unexpected_error"],
  ]) assert.equal(reporting.classifyFailure(error), category);
});

test("concurrent requests keep their own IDs and errors never disclose request or upstream secrets", async () => {
  const previous = console.warn;
  const events = [];
  console.warn = (event) => events.push(JSON.parse(event));
  try {
    const handler = reporting.withRequestLogging("fare", "pathao", async (request) => {
      await new Promise((resolve) => setTimeout(resolve, request.url.endsWith("/a") ? 5 : 0));
      throw new Error(`Authorization=private-key ${request.url} demo@example.com`);
    });
    const responses = await Promise.all(["a", "b"].map((name) => handler(new Request(`https://example.com/${name}`, { headers: { "X-Request-ID": "spoofed" } }))));
    const ids = responses.map((response) => response.headers.get("X-Request-ID"));
    assert.equal(new Set(ids).size, 2);
    for (const response of responses) {
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.requestId, response.headers.get("X-Request-ID"));
    }
    assert.deepEqual(new Set(events.map((event) => event.requestId)), new Set(ids));
    assert.doesNotMatch(JSON.stringify(events), /private-key|demo@example|example.com|spoofed|Authorization/);
  } finally { console.warn = previous; }
});

test("the external camera embed stops waiting and provides retry without camera access", () => {
  const source = fs.readFileSync(path.join(root, "components/live-cams/LiveCamsFrame.tsx"), "utf8");
  assert.match(source, /setTimeout\(.*setFailed\(true\).*60_000\)/);
  assert.match(source, /clearTimeout\(timeout\)/);
  assert.match(source, /onError=/);
  assert.match(source, /did not finish loading/);
  assert.match(source, /NoboJatra does not operate or verify/);
  assert.doesNotMatch(source, /allow="camera/);
});

test("camera diagnostics require a session, accept only known events and limit reports per account", async () => {
  let signedIn = false;
  const previous = console.warn;
  const logs = [];
  console.warn = (event) => logs.push(JSON.parse(event));
  try {
    const { POST } = load("app/api/diagnostics/route.ts", {
      "@/lib/auth": { auth: { api: { getSession: async () => signedIn ? { user: { id: "demo" } } : null } } },
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    });
    const send = (event) => POST(new Request("https://demo.example/api/diagnostics", { method: "POST", body: JSON.stringify({ event, password: "private-value" }) }));
    assert.equal((await send("camera_timeout")).status, 401);
    signedIn = true;
    assert.equal((await send("unknown")).status, 400);
    for (let count = 0; count < 5; count++) assert.equal((await send("camera_timeout")).status, 200);
    assert.equal((await send("camera_timeout")).status, 429);
    assert.equal(logs.length, 5);
    assert.ok(logs.every((event) => event.category === "timeout"));
    assert.doesNotMatch(JSON.stringify(logs), /private-value|demo.example/);
  } finally { console.warn = previous; }
});
