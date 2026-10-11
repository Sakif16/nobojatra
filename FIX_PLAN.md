# NoboJatra fix plan for a demo showcase

**Updated:** 1 October 2026

**Scope:** a credible, usable demo of the existing app. There is no production launch or paid pilot planned.

This is the working checklist. The longer [project assessment](PROJECT_ASSESSMENT_AND_EXPANSION_ROADMAP.md) and Git history contain the original evidence and detailed proposals. IDs in parentheses point back to that assessment. A checked item reflects current source or a recorded decision; it does not certify the deployed site.

## What the demo should promise

NoboJatra lets a signed-in visitor explore car-based route suggestions, compare **estimated** fares and travel times, and save plans. Weather, traffic, place search, cameras, and photo search depend on external services. A saved option is **not a booking**. The ranking is labelled AI route ranking and scores options by fixed rules on time, cost, and comfort. Live traffic is unavailable in Bangladesh with the current provider.

The demo is ready when the core journey works in a browser on the demo host, the UI says what is actually measured or estimated, and a provider failure leaves a clear explanation.

## 1. Fix before sharing the demo

- [x] **Stop cross-user route-cache leakage.** Cache route geometry and metrics without user labels; attach each request's own labels after a hit. Apply the route limit to cache hits too. A focused synthetic test covers two users with matching coordinates and different labels. Deployed behavior still needs browser verification. (G30)
- [x] **Make scheduled times unambiguous.** The form sends a wall-clock time; the server converts it in the origin's time zone and stores an instant and zone. Schedules, summaries, history filters, month groups, and peak-hour checks all read in the trip's zone, whatever zone the server or browser is in. Tests cover Bangladesh, both UK daylight-saving changes, and New York and Los Angeles, each under three process time zones. Five stored schedules were repaired with `scripts/fix-scheduled-times.mts`; one from 17 August fits both readings and was left as stored. The zone lookup is too coarse at borders to reject foreign cities, so that part of G17 stays open. Deployed behavior still needs browser verification, and the host should set `TZ=UTC`. (G04, G36, R09, G17)
- [x] **Correct the product language everywhere.** “Confirm”, “booked”, and “confirmed ride” are now saved-plan wording on the buttons, summary, history, scheduled trips, and notifications, and each screen says a saved plan is not a booking. Fare and ranking screens state that fare bands are estimates, not provider quotes, and that distance and time come from a car route. History totals are labelled as estimates. A test blocks the old phrases from returning. Decisions: the “AI route ranking” label stays, with copy that says what is scored, and “Live traffic” links keep their name. Screens still need a read-through in the browser. (G05, G07, G11, G12, G22, G34, R30, P14)
- [x] **Handle Bangladesh traffic as unavailable.** Countries carry a live-traffic flag, off for Bangladesh. There the app makes no traffic request, hides the map overlay and legend, shows no delay numbers, and rejects traffic alerts on saved trips. Routes, fares, ranking, saved plans, and saved trips each say live traffic is not available. A missing reading is no longer scored as low congestion: ranking applies no traffic adjustment and labels risk as weather-only or not assessed. Peak-hour pricing still applies, since it comes from the clock. Tests cover each of these. Deployed behavior still needs browser verification. (G07, G12)
- [x] **Keep planner inputs and results together.** Place searches and route searches are cancelled when a newer one replaces them, and a late answer is ignored. Editing a place, stop, passenger count, or departure clears the results made for the old inputs. Switching country resets the planner. Route choices are stored in click order, and choosing a different route drops the vehicle saved on the old one, with a message to choose again. Tests cover the vehicle reset and search cancellation; rapid typing, repeated Plan Again clicks, and country switching still need checking by hand in a browser. (G06, G25, R01)
- [x] **Reject a saved-trip vehicle from another country.** Creating or editing a saved trip refuses a vehicle rate from another country before any routing or fare work, using the trip's own country on edit. Alert evaluation skips the fare for a trip that already holds a foreign rate and still checks weather. An edit that leaves the stored vehicle unusable, such as more passengers than it seats, clears the vehicle and its fare baseline and says so in the response. The form releases a vehicle that drops out of its list and holds the passenger count to 1–8. Tests cover each case. The three stored saved trips were checked and needed no repair. (G18, R27)
- [x] **Close the easy request failures.** API routes read their body through one helper that answers `null`, arrays, and other non-object JSON with a 400. Stops that are not a list and condition flags that are not booleans are refused. The traffic endpoint takes at most eight points between the ends, which is a full sampled route, and the tile proxy only accepts tiles that exist at their zoom. Tests cover each. (G19, G20)
- [x] **Protect public provider calls for a shared demo.** Place search, reverse geocoding, the tile proxy, and trip validation now need a session. Limits are per account, since an IP address can be claimed in a header. Geocoding has a timeout and a ten-minute cache for repeated queries. Every provider call is counted against a daily budget stored in the database, with defaults in `lib/provider-budget.ts` that should be checked against the plans in use. The alert-evaluation endpoint still limits by IP before sign-in, because it has no other identity at that point. (G02, G19, G38, P09)
- [x] **Make the local and CI checks green.** `pnpm test` runs 62 tests with no network or database, and CI runs it between lint and build. Inter is bundled in `app/fonts` with its licence, so the build makes no Google Fonts request. A frozen install, type-check, lint, tests, and a clean build pass locally; the CI run itself has not been observed yet. (P08, P10, P14)
- [x] **Check dependencies and basic app security.** Next.js is on 16.3.8 and production dependencies went from 27 advisories to one: a moderate `sprintf-js` issue with no fixed release, reached only through TensorFlow.js's command-line tool, which the app never runs. That one is accepted and listed with its reason in `pnpm-workspace.yaml`, so `pnpm audit --prod` now reports only new findings. Development-only tools are down to one: a high-severity `braces` issue with no fixed release, reached only through the lint plugin. It is accepted and listed with its reason in the same file. The output is in `docs/audits/2026-10-10/`. Basic security headers are set, plus a content security policy with a per-request nonce: scripts run only if the server issued them, and map tiles, the photo model, and the embedded cameras are each allowed for their one purpose. It was checked page by page in a headless browser, signed in and out; it has not been checked on the deployed site. Every API route except sign-in, and every private page, checks for a session, and a test fails if one is added without it. Leaked key: history is left as it is, since the key is recorded as revoked; the revocation itself still needs confirming in the provider's dashboard. (G03, C04, C08)

## 2. Fix for the features actually shown

### Routes, fares, and ranking

- [x] Preserve distinct route shapes even when rounded distance and time match. A regression test covers distinct and near-identical paths. (G13)
- [ ] Return one usable route when the alternatives request fails. Support an A → B → A trip when its stops make it valid. (G14)
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

- [x] Fares, best options, and vehicle selection use one owner-scoped trip context for route metrics, departure time, weather fallback, and traffic sampling. A focused test covers scheduled dates and missing geometry.
- [x] Environment example and local setup instructions are tracked. (C02)
- [x] The Nominatim User-Agent helper identifies the app. Check that the demo host uses the intended value. (C03)
- [x] Auth client no longer hardcodes a production URL; the auth database name is explicit. (C01, G24)
- [x] The old unauthenticated legacy API routes were removed. The remaining models, collections, and cleanup still need a decision above. (G01, R20)
- [x] TomTom raster tile size is set to 256. (R26)
- [x] CI runs type-check, lint, and build; lint now fails the check. The home page no longer overrides DNS for the whole process. (P08, P10)
- [x] The shadcn CLI is no longer installed. Nothing in the build uses it, and it carried 29 of the development-only advisories. Run it on demand with `pnpm dlx shadcn@latest add <name>`. (C04)
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
