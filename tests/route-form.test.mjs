import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { root } from "./support/load.mjs";

const form = fs.readFileSync(path.join(root, "components/map/RouteFinderForm.tsx"), "utf8");

test("stops are keyed by an id of their own, not by position", () => {
  assert.match(form, /key=\{stop\.id\}/);
  assert.doesNotMatch(form, /stops\.map\(\(stop, i\) => \(\s*<div\s*key=\{i\}/);
  // Every stop is given one: restored trips and newly added stops alike.
  assert.match(form, /id: `restored-\$\{index\}`/);
  assert.match(form, /const id = `stop-\$\{nextStopIdRef\.current\}`/);
});

test("the origin and destination can be swapped", () => {
  assert.match(form, /Swap origin and destination/);
  assert.match(form, /setOrigin\(destination\);\s*setOriginLabel\(destinationLabel\);\s*setDestination\(origin\);\s*setDestinationLabel\(originLabel\);/);
});

test("the schedule limits follow the clock, and a passed time is refused on submit", () => {
  // No longer fixed at the form's first render.
  assert.doesNotMatch(form, /const \[mountedAt\] = useState/);
  assert.match(form, /onFocus=\{\(\) => setClock\(Date\.now\(\)\)\}/);
  assert.match(form, /scheduledTime < getScheduleBounds\(Date\.now\(\), timeZones\)\.min/);
  assert.match(form, /That departure time has passed/);
});

test("finding the current location gives up, and says why it failed", () => {
  assert.match(form, /\{ timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS \}/);
  assert.match(form, /error\.code === error\.TIMEOUT/);
  assert.match(form, /error\.code === error\.PERMISSION_DENIED/);
  assert.match(form, /took too long/);
});

test("an empty stop is marked where it is", () => {
  assert.match(form, /showStopErrors && stop\.place === null && \(\s*<p role="alert"/);
  assert.match(form, /Choose a place for stop \{i \+ 1\}/);
});
