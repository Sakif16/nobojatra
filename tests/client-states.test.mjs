import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const response = (body, { status = 200, type = "application/json" } = {}) =>
  new Response(body, { status, headers: type ? { "content-type": type } : {} });

test("a reply that is not JSON becomes a readable error, not a parser message", async () => {
  const { readJson, UnexpectedResponseError } = load("lib/read-json.ts");

  assert.deepEqual(await readJson(response('{"success":true}')), { success: true });
  // An API error is still JSON and is handed to the caller as it is.
  assert.deepEqual(await readJson(response('{"message":"No"}', { status: 400 })), { message: "No" });

  // What a proxy or the host sends when the app itself did not answer.
  const cases = [
    [response("<!DOCTYPE html><html>502 Bad Gateway</html>", { status: 502, type: "text/html" }), /not responding properly/],
    [response("<html>Sign in</html>", { status: 200, type: "text/html" }), /unexpected response/],
    [response("", { status: 504, type: null }), /not responding properly/],
    // Labelled JSON but cut off part way.
    [response('{"success":tr', { status: 200 }), /unexpected response/],
  ];

  for (const [reply, message] of cases) {
    await assert.rejects(readJson(reply), (error) => {
      assert.equal(error instanceof UnexpectedResponseError, true);
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /Unexpected token|JSON/);
      return true;
    });
  }
});

test("the browser's API calls go through the safe reader where the message is shown", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

  for (const file of [
    "components/map/MapDashboardSection.tsx",
    "lib/routing.ts",
    "lib/geocode.ts",
    "components/saved-trips/SavedTripForm.tsx",
    "components/saved-trips/SavedTripsManager.tsx",
    "components/notifications/NotificationBell.tsx",
    "app/(main)/profile/profile-form.tsx",
  ]) {
    assert.match(read(file), /readJson</, file);
  }

  // Saving a profile always releases its button, whatever came back.
  const profile = read("app/(main)/profile/profile-form.tsx");
  assert.match(profile, /finally \{\s*setIsSaving\(false\);/);
  assert.match(profile, /finally \{\s*setIsDeleting\(false\);/);
});

test("every route has a loading, error and not-found state to fall back on", () => {
  for (const file of ["app/(main)/loading.tsx", "app/(main)/error.tsx", "app/global-error.tsx", "app/not-found.tsx"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }

  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  // Error boundaries must be client components, and offer a way to retry.
  for (const file of ["app/(main)/error.tsx", "app/global-error.tsx"]) {
    assert.match(read(file), /^"use client";/);
    assert.match(read(file), /onClick=\{reset\}/);
  }
  // The raw error text is logged, not shown.
  assert.doesNotMatch(read("app/(main)/error.tsx"), /\{error\.message\}/);
});
