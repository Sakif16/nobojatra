import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const map = fs.readFileSync(path.join(root, "components/map/RouteMap.tsx"), "utf8");

test("text placed in Leaflet's HTML cannot become markup", () => {
  const { escapeHtml } = load("lib/escape-html.ts");

  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
  );
  assert.equal(escapeHtml("Fish & Chips `shop`"), "Fish &amp; Chips &#96;shop&#96;");
  assert.equal(escapeHtml(3), "3");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml("Dhanmondi 27"), "Dhanmondi 27");

  // The marker icon is the one place a raw HTML string is built.
  assert.match(map, /">\$\{escapeHtml\(label\)\}<\/div>`/);
  assert.match(map, /background:\$\{escapeHtml\(color\)\};/);
  assert.doesNotMatch(map, /">\$\{label\}<\/div>/);
});

test("each marker names its place, as text", () => {
  for (const call of [
    'markerTitle(isRoundTrip ? "Origin and destination" : "Origin", origin)',
    "markerTitle(`Stop ${i + 1}`, s)",
    'markerTitle("Destination", destination)',
  ]) {
    assert.ok(map.includes(call), call);
  }
  // Rendered through React inside a Tooltip, and given to Leaflet as title/alt.
  assert.match(map, /<Tooltip>\{markerTitle\(/);
  assert.match(map, /title=\{markerTitle\(/);
  assert.match(map, /alt=\{markerTitle\(/);
});

test("the map can be brought back to the route, and refits when a stop changes", () => {
  assert.match(map, /Fit route/);
  assert.match(map, /setFitRequest\(\(request\) => request \+ 1\)/);
  assert.match(map, /\[origin\.lat, origin\.lng, destination\.lat, destination\.lng, stops, routes, fitRequest\]/);
});

test("only the providers whose tiles are on screen are credited", () => {
  // Without a Mapbox token the base map is OpenStreetMap's and says only that.
  assert.match(map, /MAPBOX_TOKEN \? `\$\{MAPBOX_ATTRIBUTION\} \$\{OSM_ATTRIBUTION\}` : OSM_ATTRIBUTION/);
  // The traffic overlay carries its own credit, shown only while it is on.
  assert.match(map, /attribution=\{MAPBOX_TOKEN \? MAPBOX_ATTRIBUTION : TOMTOM_ATTRIBUTION\}/);
  assert.match(map, /tomtom\.com/);
  // OpenStreetMap's current tile address, not the retired a/b/c mirrors.
  assert.match(map, /"https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png"/);
  assert.doesNotMatch(map, /\{s\}\.tile\.openstreetmap\.org/);
});
