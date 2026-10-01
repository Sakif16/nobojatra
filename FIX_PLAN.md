# NoboJatra fix plan for a demo showcase

**Updated:** 1 October 2026

**Scope:** a credible, usable demo of the existing app. There is no production launch or paid pilot planned.

This is the working checklist. The longer [project assessment](PROJECT_ASSESSMENT_AND_EXPANSION_ROADMAP.md) and Git history contain the original evidence and detailed proposals. IDs in parentheses point back to that assessment. A checked item reflects current source or a recorded decision; it does not certify the deployed site.

## What the demo should promise

NoboJatra lets a signed-in visitor explore car-based route suggestions, compare **estimated** fares and travel times, and save plans. Weather, traffic, place search, cameras, and photo search depend on external services. A saved option is **not a booking**. The ranking is a rule-based comparison, not AI. Live traffic is unavailable in Bangladesh with the current provider.

The demo is ready when the core journey works in a browser on the demo host, the UI says what is actually measured or estimated, and a provider failure leaves a clear explanation.

## 1. Fix before sharing the demo

- [ ] **Stop cross-user route-cache leakage.** Cache route geometry and metrics without user labels; attach each request's own labels after a hit. Apply the route limit to cache hits too. Test two users with matching coordinates and different labels. (G30)
- [ ] **Make scheduled times unambiguous.** Convert local form times using the trip location's time zone, store an instant and zone, and render schedules, history filters, and peak-hour calculations in that zone. Test Bangladesh, UK daylight-saving changes, and two US zones. (G04, G36, R09, G17)
- [ ] **Correct the product language everywhere.** Replace “Confirm”, “booked”, and “confirmed ride” with saved-plan wording; replace “AI” with rule-based ranking; identify car-route estimates and missing data. Explain that fare bands are estimates, not supplier quotes. (G05, G07, G11, G12, G22, G34, R30, P14)
- [ ] **Handle Bangladesh traffic as unavailable.** Hide its traffic overlay, delay numbers, traffic-based claims, and traffic alerts. Never turn missing traffic into “light” traffic or “low risk”. Show the unavailable state on routes, fares, ranking, maps, and saved trips. (G07, G12)
- [ ] **Keep planner inputs and results together.** Cancel or ignore stale place and route responses. Changing a location, country, departure time, or selected route must clear or update dependent results and any saved vehicle choice. Check rapid typing, repeated Plan Again clicks, and country switching. (G06, G25, R01)
- [ ] **Reject a saved-trip vehicle from another country.** Check the rate's country on create, edit, and alert evaluation; clear a vehicle that becomes invalid after a passenger change. (G18, R27)
- [ ] **Close the easy request failures.** Reject null and wrongly shaped JSON, invalid stops, and non-boolean condition flags with a 400; cap traffic stops and validate tile zoom/x/y bounds. (G19, G20)
- [ ] **Protect public provider calls for a shared demo.** Authenticate geocoding and TomTom tile proxies where the UI permits, limit reverse geocoding, cap and time out upstream requests, and cache repeated place queries. Keep a bounded demo-usage budget. (G02, G19, G38, P09)
- [ ] **Make the local and CI checks green.** Remove the home page's process-wide DNS override, make lint blocking in CI, add a few meaningful regression tests for the items above, and verify a fresh build. Bundle or otherwise make the Inter font available to builds without a Google Fonts request. (P08, P10, P14)
- [ ] **Check dependencies and basic app security.** Move the shadcn CLI to development dependencies, refresh the dependency audit, update affected packages where needed, set basic security headers, and verify auth guards for all private pages and API routes. Review the leaked-key history decision; the old key is recorded as revoked. (G03, C04, C08)

## 2. Fix for the features actually shown

### Routes, fares, and ranking

- [ ] Preserve distinct route shapes even when rounded distance and time match; return one usable route when the alternatives request fails. Support an A → B → A trip when its stops make it valid. (G13, G14)
- [ ] Label fare source and fallback on every fare card and saved plan. Use the same fare calculation when comparing an alert with its baseline; do not alert just because weather, traffic, or source changed. Make the Pathao-named source clearly an unverified third-party estimate unless its ownership is established. (G10, G11, G16)
- [ ] Make ranking explanations match the score. Mark unavailable weather and traffic as unknown; do not claim a measured vehicle ETA from the car-route multiplier. Avoid “best” claims when only one option remains. (G08, G12, G34)
- [ ] State that weather is a current reading, not a forecast for a scheduled trip. Keep hazard advice general. The existing rain score cannot reach “severe” from rain alone; either adjust the rule with evidence or explain its limits. (G09)
- [ ] Validate whether a chosen point is reachable by car; tell the user when the pin may not be a usable entrance or pickup point. A verified entrance database is beyond this demo. (G35)

### Saved trips, alerts, and history

- [ ] Decide what “alerts” means in the demo: either add a bounded scheduled sweep or label them as manual checks. Do not imply background monitoring while the app is closed without a running job. (G15, P05)
- [ ] Evaluate only active conditions on current trips, call only the providers needed by those conditions, and avoid writing an alert for a trip deleted during evaluation. Show escalation and recovery rather than silently losing state changes. (G31, G33, G37)
- [ ] Bound and index history reads. Separate route searches from saved plans in the UI; do not describe estimates as spending or a search as a completed journey. Prevent concurrent saved-trip writes from breaking the per-user limit or overwriting edits. (G22, G23, R18, R19)
- [ ] Make notification pagination and polling consistent so older records and new alerts can be reached. Handle pause and delete errors, and ask before deleting a saved trip or condition. (G32, R29, P04)

### Optional demo experiences

- [ ] Photo search: offer it only for its known Bangladesh landmarks; name those landmarks, show readable match names, retry a failed model load, reject oversized images, and ignore an old prediction when a newer image is chosen. Its model has no documented provenance or measured accuracy, so avoid general recognition claims. (G27, R23)
- [ ] Cameras: identify the page as an external feed, remove unnecessary iframe permissions, and provide an offline or failed-load state. Do not claim the feeds are operated or verified by NoboJatra. (G28)
- [ ] Make the photo and delete dialogs keyboard accessible, keep focus inside while open, restore focus on close, and test a narrow phone viewport and slow device. (G26, R02, R03, R22)

## 3. Finish the interface and setup

- [ ] Add useful loading, error, empty, and not-found states. Handle a non-JSON API response without crashing the client. (P03, R28)
- [ ] Improve route form controls: stable IDs for reordered stops, a swap button, refreshed schedule limits, a geolocation timeout, and a visible error beside each invalid stop. (R04–R08)
- [ ] Improve the map: recenter when a route changes, label markers, escape any text put in Leaflet HTML, and show attribution only for the tile providers actually displayed. (R10, R11, R13, R14)
- [ ] Let visitors sort fares and understand why an option was excluded. Give saved trips search/sort and a clear “20 per country” limit indicator. (R16, R17, R21)
- [ ] Use consistent buttons, dialogs, status messages, and accessible navigation. Add a simple share/copy action for a plan if it helps the showcase. (P01, P06, R24, R25)
- [ ] Remove placeholder branding assets and invented footer contact details. Add page titles, a manifest and robots file; decide whether the fixed dark theme is intentional. Set Bangladesh Friday **and** Saturday as non-peak days, as already decided in the old plan. (P02, P12, P14, R12)
- [ ] Update the README and environment example for the exact demo setup, provider fallbacks, seeded rates, demo account procedure, and known limitations. Validate required environment variables at startup and make missing optional features visibly unavailable. Avoid repeated session and profile reads on the same page. (C02, G24, P13, P14)

## 4. Keep safe defaults for a public demo

- [ ] Apply the password rule to password changes as well as sign-up/reset; review sign-up and password-attempt limits. Keep the deliberate readable “email already exists” message only with adequate throttling. (G21, C06, C07)
- [ ] Review session/cookie settings, trusted proxy IP handling, and rate-limit keys on the actual demo host. The current in-memory limits are only per process. (C09, C10, G19)
- [ ] Make account deletion and legacy-data cleanup reliable; back up data before deleting old collections or changing schemas. Keep personal data from one demo user out of another user's view. (G01, G21, G23, R20)
- [ ] Add lightweight error visibility for route, fare, weather, camera, and alert failures. Keep a simple backup/export for demo data. Full monitoring and restore drills are outside this showcase. (G29, P11)
- [ ] Check current provider terms and attribution before publicly sharing the demo, especially public Nominatim autocomplete, map tiles, the Pathao-named estimator, and camera embeds. The previous review's provider checks are dated September 2026. (G02, G10, G28)

## Already addressed in the current source

- [x] Environment example and local setup instructions are tracked. (C02)
- [x] The Nominatim User-Agent helper identifies the app. Check that the demo host uses the intended value. (C03)
- [x] Auth client no longer hardcodes a production URL; the auth database name is explicit. (C01, G24)
- [x] The old unauthenticated legacy API routes were removed. The remaining models, collections, and cleanup still need a decision above. (G01, R20)
- [x] TomTom raster tile size is set to 256. (R26)
- [x] CI runs type-check, lint, and build, although lint is still non-blocking. (P10)
- [x] The team decided not to require email verification while the demo uses Resend's testing sender. Reset email delivery to other addresses remains unavailable. (C05)

## Explicit demo limits and deferred work

These are documented limitations, not promises for this project:

- No booking, official fare quote, validated market-wide prices, or guaranteed arrival time. Rate cards and vehicle duration multipliers are illustrative. (G05, G10, G12, G34)
- No live Bangladesh traffic provider, full-country geographic verification, or verified pickup-point catalogue. (G07, G17, G35)
- No dependable notifications outside the browser until a scheduler exists; no email/push delivery promise. (G15, P05)
- No general-purpose image recognition or owned camera network. (G27, G28)
- No multi-instance cache/queue architecture, commercial billing, fleet telemetry, partner integrations, full privacy operations, or complete Bengali localization. Revisit only if the project scope changes. (G19, G29, P07)
- Feature candidates F01–F24 and R15 are outside this fix checklist. Add one only if it helps the chosen demo story.

## Verification before calling the plan done

1. Run type-check, lint, focused tests, and a clean build. On 1 October 2026, type-check passed, lint had one error, and a local build stopped while fetching Inter in a network-restricted environment.
2. On the demo host, use two separate accounts to check sign-in, country switch, route search, fare comparison, save plan, saved trips, history, and account deletion.
3. Exercise Bangladesh traffic-unavailable, provider timeout, empty results, invalid input, and mobile keyboard navigation.
4. Check the deployed pages and API responses directly. A passing build does not prove the authenticated or provider-backed flow.
5. Convert the old diagnostic scripts under [docs/audits](docs/audits) into tests of the fixed behavior. They currently assert old defects and can stop on stale assumptions.
