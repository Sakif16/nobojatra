import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const map = fs.readFileSync(path.join(root, "components/map/RouteMap.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

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
  assert.match(map, /\$\{escapeHtml\(label\)\}/);
  assert.match(map, /\$\{escapeHtml\(name\)\}/);
  assert.doesNotMatch(map, /planner-pin-name">\$\{name\}/);
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
  // The base map credits its provider and OpenStreetMap data.
  assert.match(map, /MAPBOX_TOKEN \? `\$\{MAPBOX_ATTRIBUTION\} \$\{OSM_ATTRIBUTION\}` : CARTO_API_KEY \? `\$\{OSM_ATTRIBUTION\} \$\{CARTO_ATTRIBUTION\}` : OSM_ATTRIBUTION/);
  // The traffic overlay carries its own credit, shown only while it is on.
  assert.match(map, /attribution=\{MAPBOX_TOKEN \? MAPBOX_ATTRIBUTION : TOMTOM_ATTRIBUTION\}/);
  assert.match(map, /tomtom\.com/);
  assert.match(map, /basemaps\.cartocdn\.com\/dark_nolabels\/\{z\}\/\{x\}\/\{y\}\{r\}\.png/);
  assert.match(map, /encodeURIComponent\(CARTO_API_KEY\)/);
  assert.match(map, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(map, /mapbox\/dark-v11/);
});

test("the dark CARTO map has dark-map labels and visible zoom controls", () => {
  assert.match(map, /zoomControl\s*\n/);
  assert.match(map, /!MAPBOX_TOKEN && CARTO_API_KEY && <Pane/);
  // CARTO's labels made for dark maps, not the light map's labels inverted:
  // inverting turned their white halos black.
  assert.match(map, /dark_only_labels\/\{z\}\/\{x\}\/\{y\}\{r\}\.png/);
  assert.doesNotMatch(map, /voyager_only_labels/);
  assert.match(css, /\.route-place-labels \.leaflet-tile \{\s*filter: brightness\(1\.5\);\s*\}/);
  assert.match(map, /pointerEvents: "none"/);
  // `{r}` already serves high-density tiles; detectRetina on top loaded them
  // a zoom level too deep.
  assert.doesNotMatch(map, /\bdetectRetina(\s*=|[ \t]*\n)/);
});

test("the map is not rebuilt between searches and never flashes light grey", () => {
  // A key on the map container destroyed and rebuilt it on every search.
  assert.doesNotMatch(map, /<MapContainer\s+key=/);
  // Leaflet's own empty-map colour is #ddd; the planner map overrides it.
  assert.match(css, /\.planner-map \.leaflet-container \{\s*background: var\(--map-background\);/);
});

test("the map stays on the trip's country", () => {
  assert.match(map, /COUNTRY_CONFIG\[country\]\.bounds/);
  assert.match(map, /map\.setMaxBounds\(bounds\)/);
  assert.match(map, /map\.setMinZoom\(/);
  assert.match(map, /maxBoundsViscosity=\{1\}/);
  assert.match(map, /noWrap/);
});

test("a fitted route stays clear of the floating card", () => {
  assert.match(map, /paddingBottomRight/);
  for (const page of ["components/map/MapDashboardSection.tsx", "components/FareResults.tsx"]) {
    const source = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(source, /overlayReserve=\{/, page);
  }
});
