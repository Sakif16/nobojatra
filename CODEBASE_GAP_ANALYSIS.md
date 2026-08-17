# NoboJatra - Current Codebase Gap Analysis

> **Checkout-time audit refresh:** `main` at `3910976`, reviewed 2026-08-17 against the current working tree. The repository currently has uncommitted feature changes, so this report describes the working tree, not a clean committed release artifact. Scope refreshed: App Router pages and route handlers, trip planning, fares, weather/traffic, notifications, trip history, saved trips, live cams, shared models/services, lint/build state, and the supplied feature requirements.

## 1. Verdict

NoboJatra now has a coherent authenticated trip-planning flow:

```text
route input
  -> validated server-side
  -> route options stored in TripHistory
  -> fares computed server-side
  -> weather/traffic restrictions and multipliers applied
  -> top 3 options ranked by user priority
  -> selected vehicle saved
  -> confirmation notification appears in-app and in the bell
  -> trip summary/history reads the stored TripHistory snapshot
```

The app is stronger than the previous audit: trip history has confirmed-trip analytics plus recent-search grouping, the old "activity" surface has been merged into Trip History, the home page now has quick links for Trip History, Live Traffic, and Saved Trips, saved-place suggestions no longer open until the input is focused, and fare estimates now include weather, traffic, and peak-hour adjustments.

It is still **not release-ready or fully assignment-compliant**. The largest remaining gaps are the deployed auth URL, forbidden public Nominatim autocomplete use, unsafe legacy APIs, no per-segment fare/recommendation model for multi-stop trips, live traffic/camera behavior that is not route-aware, no durable alert scheduler, no automated test suite, and production dependency advisories.

## 2. Evidence Baseline

| Check | Result | Meaning |
| --- | --- | --- |
| `git rev-parse --short HEAD` | `3910976` | Same committed base as the earlier audit, but with many uncommitted feature edits. |
| `git ls-files \| wc -l` | 141 tracked files | File-count baseline for this refresh. |
| `npx tsc --noEmit` | Pass | TypeScript currently has no diagnostics. |
| `npm run build` | Pass | Next 16.2.9 production build compiled, type-checked, and generated all 37 routes after the recent changes. |
| `npm run lint` | **Fail: 5 errors, 5 warnings** | Same class of lint blockers remains: legacy `require()`, dashboard effect state update, explicit `any`, and unused legacy model imports. |
| Focused ESLint | Pass | Recently touched route, multi-stop, fare, ranking, trip-summary, trip-history, saved-trip, and UI files lint cleanly. |
| `git diff --check` | Pass | No whitespace errors in the current diff. |
| `pnpm audit --prod` | **Fail: 19 advisories** | 8 high, 10 moderate, 1 low. Current paths include Next `<16.2.11`, sharp/libvips, PostCSS, nanoid, and runtime `shadcn`/Hono dependencies. |
| Automated tests | Missing | No `test` script and no Jest, Vitest, Playwright, Cypress, unit, integration, or E2E test files were found. |
| Browser/accessibility pass | Not run in this refresh | Visual behavior was source-reviewed, but not verified through Playwright/browser automation. |

## 3. Current Product Flow

```text
Visitor enters a place on /
  -> PlaceAutocomplete opens saved-place shortcuts only after focus
  -> type-ahead calls /api/trip-input/autocomplete
  -> route input validates service area, passengers, stops, and schedule

Signed-in user submits the planner
  -> POST /api/trip-input/routes requires a session
  -> OpenRouteService returns route suggestions with exact waypoint leg boundaries
  -> TripHistory stores route snapshots, stop wait times, travel time, wait time, and total duration
  -> dashboard displays the planner, feature tiles, plan-again cards, and quick nav
  -> /fares loads the owned TripHistory route, weather, traffic, VehicleRate, and fares
  -> /best-options ranks eligible vehicles and returns the top 3
  -> POST /api/trip-input/select stores the selected vehicle and weather/traffic snapshot
  -> createTripConfirmedAlert writes "Your trip has been confirmed"
  -> NotificationBell shows an in-app toast and stores the item in the bell
  -> /trip-summary shows "Trip confirmed" immediately after booking
  -> /trip-history opens the same summary as "Your trip on {date, time}"

Saved trips and alerts
  -> /api/saved-trips stores watched trips and baseline fares
  -> alert evaluator refreshes route, weather, traffic, and adjusted fare context
  -> false-to-true transitions write Alert records
  -> NotificationBell polls count, shows toast for recent new alerts, and supports dismiss/snooze
```

The active route system is still `TripHistory`. The older `Map_route`, `Place`, `Camera`, and `TrafficData` APIs/models remain a parallel legacy surface and should not be extended.

## 4. Assignment Traceability

Status meanings: **implemented** means the named behavior exists in source; **partial** means an important requirement, provider contract, or operational condition is missing; **missing** means no relevant implementation was found.

| Assignment capability | Status | Current evidence and caveat |
| --- | --- | --- |
| Registration, login, password reset | Partial | Better Auth email/password, password policy, duplicate-email handling, Resend reset mail, and session revocation exist in `lib/auth.ts`. `lib/auth-client.ts` still hardcodes `http://localhost:3000`, which is a deployment blocker. |
| Profile, defaults, saved places, deletion | Partial | Profile supports name, email, priority, passenger default, account date, saved places, and typed deletion with password confirmation. The deletion cascade is fail-closed but not transaction-protected across all app collections. |
| Dhaka place input and current location | Partial | Input validation, current-location reverse geocode, 1-8 passengers, seven-day scheduling, six stops, and saved-place shortcuts exist. It still uses public Nominatim autocomplete instead of Google Places or an allowed autocomplete provider. |
| Image-recognition destination input | Missing | No image upload, recognition endpoint, confidence threshold, or manual-override flow was found. |
| Map visualization | Partial | Leaflet/OSM renders markers, polylines, leg colors, and traffic overlay controls. It is not Google Maps JS, has no map weather badge, and route-selection behavior/provider attribution still need product decisions. |
| Fare estimation | Implemented with caveats | `lib/fare-providers.ts` is the shared calculator. It applies base/per-km/per-minute/minimum fare, optional Pathao live quote, +/-10% range, provider fallback, weather multiplier, traffic multiplier, peak-hour multiplier, and a capped condition adjustment. Multi-stop fares now use the full itinerary duration: ORS travel time plus configured stop wait time. It is still a local approximation, not official Uber/Pathao dynamic pricing. |
| Weather integration | Implemented with caveats | OpenWeather route-midpoint lookup, severity scoring, restrictions, and non-blocking failure behavior exist. Weather cache remains process-local. |
| Traffic integration | Partial | TomTom route sampling produces congestion levels, traffic duration, free-flow comparison, and peak-hour status for scoring/fare adjustment. It is not the assignment's Google Distance Matrix batched-leg model, and previous provider checks found weak/no Dhaka traffic tile coverage. |
| AI route scoring engine | Implemented with caveats | `lib/route-scoring.ts` filters capacity/weather-blocked options before normalization, normalizes cost/time/comfort, applies user priority weights, subtracts risk penalty, adds pros/cons, score, and Best for tag, and returns top 3. Vehicle traffic multipliers now apply only to travel time, while stop wait time stays fixed. It ranks vehicle options for one selected route, not multiple route geometries. |
| Notification and alert system | Partial | Bell badge, popover, dismiss, snooze, recent in-app toast transition, confirmation notification, saved-trip condition alerts, and dedupe exist. No durable scheduler/queue is configured. |
| Trip summary and history | Implemented with caveats | Trip summary renders selected vehicle, fare range, time, distance, booking-time conditions, and multi-stop itinerary legs when available. Trip History now merges confirmed trips and recent route-search activity behind a dropdown, includes last-7-days and monthly views, filters confirmed trips, and shows total cost, most-used vehicle, and average cost. Browser/mobile/a11y verification is still missing. |
| Multi-stop itinerary | Implemented with caveats | The form supports up to six stops, each stop has configurable wait time, ORS returns a multi-waypoint route, stored route legs use ORS `way_points`, totals include travel plus wait time, fares price the full itinerary, and trip summary can show stop-to-stop legs. Remaining caveats: no per-segment fare/recommendation, no per-segment weather/traffic snapshot, and plan-again still drops stops. |
| Saved places and frequent routes | Partial | Profile saved places appear only when an input is focused and empty. Plan-again cards use top-three 30-day direct origin/destination pairs. Plan-again still drops stops and schedule data. |
| Live traffic camera demo | Partial | `/live-cams` exists and is linked from the home quick nav as "Live Traffic". The page is still a standalone third-party iframe, not selected-route aware, not integrated with camera catalog ownership, and not embedded into the route-planning map. |

## 5. Prioritized Gaps

### P0-1. Deployed authentication is directed to localhost

[`lib/auth-client.ts`](lib/auth-client.ts) sets the Better Auth client base URL to `http://localhost:3000`.

**Impact:** signin, signup, signout, password reset, and profile auth behavior can fail or target the wrong origin after deployment.

**Fix:** omit `baseURL` for same-origin deployment, or derive it from a validated public environment variable.

**Acceptance:** production client network requests use the page origin; no localhost auth URL is shipped in the production client bundle.

### P0-2. Public Nominatim is still used for autocomplete

[`app/api/trip-input/autocomplete/route.ts`](app/api/trip-input/autocomplete/route.ts) and [`lib/geocode.ts`](lib/geocode.ts) still default to public Nominatim, while [`components/map/PlaceAutocomplete.tsx`](components/map/PlaceAutocomplete.tsx) uses it as type-ahead autocomplete.

**Impact:** public Nominatim explicitly forbids autocomplete use. The main route input can be blocked, and the implementation does not match the assignment's Google Places requirement.

**Fix:** migrate to Google Places Autocomplete as specified, or use/self-host a provider that permits autocomplete. Keep the new focus-only saved-place behavior.

**Acceptance:** no public Nominatim autocomplete traffic; timeout/cache/safe-error behavior is tested; keyboard accessible combobox behavior is verified.

### P0-3. Legacy APIs remain unauthenticated or insufficiently owned

The active app uses `TripHistory`, but legacy handlers remain routable:

- [`app/api/map_routes`](app/api/map_routes)
- [`app/api/places`](app/api/places)
- [`app/api/camera/route.ts`](app/api/camera/route.ts)
- [`app/api/traffic`](app/api/traffic)
- [`app/api/test-mongo/route.ts`](app/api/test-mongo/route.ts)

These routes either accept caller-controlled identifiers, expose diagnostic details, or lack consistent session/ownership checks.

**Fix:** delete the abandoned API/model family where possible. If any route is still needed, rebuild it behind Better Auth session checks, owner-scoped queries, schema validation, rate limits, and sanitized errors.

**Acceptance:** anonymous callers cannot read or write user route/place/camera/traffic records, and no production route exposes database diagnostics.

### P0-4. Production dependencies include 19 known advisories

`pnpm audit --prod` reports 8 high, 10 moderate, and 1 low advisory. Current paths include:

- `next >=16.0.0 <16.2.11`, patched at `>=16.2.11`.
- `sharp <0.35.0` via Next/libvips.
- `postcss` and `nanoid` through Next/PostCSS paths.
- `hono` through the runtime `shadcn` dependency chain.

**Fix:** run `pnpm audit --prod` in a networked environment, upgrade pinned vulnerable packages, move development-only packages out of production dependencies, regenerate the lockfile, and rerun build/lint/tests.

**Acceptance:** production audit has no high advisories, or every remaining advisory has a documented owner, impact, and expiry date.

### P1-1. Full lint is still red

`npm run lint` still fails with five errors and five warnings:

- `require()` imports in `app/api/camera/route.ts`, `app/api/places/route.ts`, and `app/api/places/[userId]/route.ts`.
- React effect state-update error plus dependency warning in `components/map/MapDashboardSection.tsx`.
- Explicit `any` in `lib/traffic-service.ts`.
- Unused `mongoose` imports in the legacy `Camera`, `Map_route`, `Place`, and `TrafficData` models.

**Fix:** modernize or delete legacy APIs/models, refactor the dashboard restore effect, and type the TomTom response.

**Acceptance:** `npm run lint` exits 0 and is enforced in CI.

### P1-2. Multi-stop has itinerary totals, but not per-segment intelligence

[`RouteFinderForm`](components/map/RouteFinderForm.tsx) now collects stop wait minutes, [`lib/route-service.ts`](lib/route-service.ts) builds ORS waypoint-aligned route legs, and `TripHistory` stores travel time, wait time, total duration, and leg metadata. Fare and ranking APIs consume those itinerary totals, so a multi-stop route no longer prices like a simple origin-to-destination trip.

**Impact:** the app can explain total multi-stop timing and fare, but it still cannot recommend different vehicles per segment or show per-segment weather/traffic/fare snapshots.

**Fix:** extend the itinerary snapshot with chained segment departure/arrival times, segment traffic/weather/fare, and optional segment-level recommendations if the product wants mixed-mode trips.

**Acceptance:** a two-stop trip shows correct segment endpoints, dwell-adjusted itinerary totals, segment departure/arrival times, segment conditions, per-segment recommendation/cost/time, and grand totals.

### P1-3. Traffic integration is expensive and not assignment-aligned

[`lib/traffic-service.ts`](lib/traffic-service.ts) samples route geometry and makes multiple provider calls. The assignment describes Google Distance Matrix-style batched legs. Traffic tiles and live camera behavior are still not tied cleanly to selected route segments.

**Fix:** move to a single batched leg model, or document the TomTom choice with Dhaka coverage evidence, shared rate limits, server-side cache, bounded stop count, coordinate range validation, and an explicit unavailable state.

**Acceptance:** one route refresh makes one bounded provider request; all legs match itinerary boundaries; cache/rate limits work across instances.

### P1-4. Live Traffic is a page link, not route-aware traffic camera intelligence

[`components/home/AuthedHome.tsx`](components/home/AuthedHome.tsx) now links `Live Traffic` to `/live-cams`, and [`components/live-cams/LiveCamsFrame.tsx`](components/live-cams/LiveCamsFrame.tsx) renders a standalone iframe.

**Impact:** this satisfies navigation, but not a route-aware live traffic/camera requirement.

**Fix:** define an owned camera catalog, allowed stream/embed sources, route/location matching, and map-adjacent no-feed UI.

**Acceptance:** a selected route with a matching camera shows a verified feed; a route without a match shows a clean unavailable state.

### P1-5. Alert evaluation is not durable

[`app/api/alerts/count/route.ts`](app/api/alerts/count/route.ts) opportunistically triggers evaluation after a count request. [`app/api/alerts/evaluate/route.ts`](app/api/alerts/evaluate/route.ts) supports a bearer-secret caller, but no cron, queue, deployment schedule, retry policy, or telemetry exists in the repo.

**Impact:** users who do not open the app may not receive timely weather/traffic/fare alerts.

**Fix:** provision a scheduler or queue worker with bounded concurrency, retry/dead-letter handling, and run telemetry.

**Acceptance:** saved-trip conditions evaluate on schedule without browser activity, duplicate concurrent runs write one alert, and provider failures are observable.

### P1-6. Fare multipliers are transparent but uncalibrated

[`lib/fare-providers.ts`](lib/fare-providers.ts) now applies explicit weather, traffic, and peak-hour multipliers and returns notes to the UI. This is useful for product behavior, but the numbers are local policy, not calibrated against official Uber/Pathao surge/dynamic pricing.

**Impact:** estimates can drift from real ride-hailing apps, especially if the optional Pathao service ever returns already-dynamic prices and the local condition adjustment double-counts.

**Fix:** collect sample fares by provider/time/weather/traffic band, calibrate multipliers, and decide whether condition multipliers apply to live provider quotes or only rate-card fallbacks.

**Acceptance:** a documented calibration dataset supports each multiplier, and live quotes are not double-adjusted.

### P2-1. In-process caches and rate limits do not enforce deployment-wide limits

Autocomplete, route caching, weather caching, route/IP limits, and alert-evaluation throttling use module-level state.

**Impact:** multi-instance or serverless deployments get separate counters and caches, so quotas and provider protection are not reliable.

**Fix:** move cache/rate-limit state into Redis or another shared backend, and trust forwarded IP headers only behind a known proxy.

**Acceptance:** quota and cache behavior are shared across two running instances.

### P2-2. Auth and application Mongo databases can diverge

Better Auth uses the database embedded in `MONGODB_URI`, while Mongoose can use a separate `MONGODB_DB`.

**Impact:** auth data and app data can silently split between databases.

**Fix:** derive both database names from one configuration source, or validate and document an intentional split at startup.

**Acceptance:** startup fails on unintended mismatch and deployment docs state the database contract.

### P2-3. Production documentation and CI are incomplete

The repository has only a Gitleaks workflow. README/environment documentation does not yet fully cover Nominatim replacement, TomTom/traffic limitations, fare multipliers, alert scheduler, live traffic page, provider outages, or production validation.

**Fix:** add install/lint/typecheck/build/audit/test CI, update `.env.example`, and write a short production runbook.

**Acceptance:** a new environment can be configured from docs, CI blocks regressions, and each provider has documented failure behavior.

## 6. Positive Foundations to Preserve

- Core planning APIs derive identity from Better Auth and read/write owner-scoped `TripHistory` records.
- Server-side trip validation enforces service area, passenger range, stop count, distance, and schedule window.
- The active fare path is centralized in `lib/fare-providers.ts`, including provider fallback and condition adjustment metadata.
- Weather restrictions are applied before scoring and selected-vehicle confirmation stores a point-in-time weather/traffic snapshot.
- `rankRouteOptions` now matches the intended scoring shape: filter blocked options, normalize metrics, apply profile priority weights, subtract risk, and return top 3.
- Trip History now includes confirmed-trip analytics and separate last-seven-days/monthly route-search activity.
- Notifications now have both immediate in-app toasts and persistent bell history.
- Account deletion has an application-data cascade wired through Better Auth.

## 7. Recommended Implementation Order

1. Fix deployment/security blockers: auth client origin, Nominatim replacement, legacy API deletion/protection, and dependency audit.
2. Make `npm run lint` green and add it to CI with build/typecheck/audit.
3. Add focused tests for route validation, fare multipliers, ranking, trip selection, notification creation, and trip-history aggregates.
4. Decide the provider architecture: assignment-compliant Google stack or documented alternative providers with Dhaka coverage.
5. Extend the new multi-stop itinerary with per-segment conditions, fares, recommendations, alerts, and live-camera matching.
6. Add a real scheduler/queue for saved-trip alert evaluation.

## 8. Verification Limits

This refresh is source-grounded and includes fresh TypeScript, build, lint, focused lint, production audit, and whitespace evidence. It does **not** prove browser journeys, visual/mobile/accessibility behavior, valid paid-provider responses, real email delivery, scheduler execution, concurrent alert behavior, or destructive account deletion. Those need disposable test data, a browser automation pass, provider credentials, and a scheduler-enabled environment.
