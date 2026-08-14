# NoboJatra — Engineering Handover

Orientation document for an engineer picking this repo up cold. Describes what exists as of `main` @ `992dbf5`, not what's planned.

Companion document: **[CODEBASE_GAP_ANALYSIS.md](CODEBASE_GAP_ANALYSIS.md)** — 33 known defects, tiered P0–P3. This file explains how the system works; that one explains what's broken. Read this first, then that.

---

## 1. What the product is

A route planner for **Dhaka Division, Bangladesh**. A signed-in user enters an origin, a destination, and up to six intermediate stops; the app returns up to three ranked driving routes on a map, then estimates ride fares across Uber, Pathao and CNG auto-rickshaws, adjusted for current weather.

The service area is a single bounding box covering all 13 districts of Dhaka Division, defined once in [`lib/trip-input.ts:21-26`](lib/trip-input.ts#L21-L26) and driving three separate things: the Nominatim autocomplete `viewbox`, server-side trip validation, and the client-side "Use current location" guard. **Changing that constant moves all three** — the file's header comment explains why it's a rectangle rather than the division's true outline.

### The one journey that matters

```
/ (anonymous)  →  enter trip  →  stashed in sessionStorage  →  /signup
                                                                  ↓
/ (authed)  →  enter trip  →  POST /api/trip-input/validate       │
                                        ↓                          │
                          POST /api/trip-input/routes  ←───────────┘
                                        ↓                    (replayed on return)
                          ORS call + TripHistory doc created
                                        ↓
                          routes drawn, user picks one
                                        ↓
                          PATCH /api/trip-input/history/:id  (persists the choice)
                                        ↓
                          /fares?tripHistoryId=…&routeId=…
                                        ↓
                          POST /api/fares → weather + rates → fare list
```

The anonymous-to-signup handoff is deliberate: route fetching requires a session, so rather than discard what a visitor typed, [`lib/pending-trip.ts`](lib/pending-trip.ts) stashes the trip in `sessionStorage` and `MapDashboardSection` replays it once they land back on `/` with an account. `sessionStorage` rather than a query string keeps the payload out of server logs.

---

## 2. Running it

**Toolchain in use:** Node v24.14.1, pnpm 11.18.0, Next.js 16.2.9 (App Router), React 19.2.4, Tailwind v4, MongoDB Atlas.

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm seed:rates     # REQUIRED before /fares shows anything
```

> `pnpm seed:rates` populates the `VehicleRate` collection. Without it `/api/fares` returns an empty list and the fares page reads "No fares available". It's an upsert keyed on `(provider, vehicleType)`, so re-running is safe.

**Checks** (there is no CI — run these by hand):

```bash
./node_modules/.bin/tsc --noEmit    # passes clean
./node_modules/.bin/eslint          # 4 errors, 4 warnings — see gap analysis #20, #31
./node_modules/.bin/next build
```

There is no `typecheck` script in `package.json`; add one.

### Environment

`.env.example` **is not tracked by git** (`.gitignore` has `.env*` with no negation) — you'll need these from a teammate. Complete list of what the code actually reads:

| Variable | Required? | Used by | Notes |
|---|---|---|---|
| `MONGODB_URI` | **yes** | `lib/auth.ts`, `lib/mongodb.ts` | Throws at import time if unset |
| `MONGODB_DB` | no | `lib/mongodb.ts` | Defaults to `"nobojatra"` — see §5 trap |
| `BETTER_AUTH_SECRET` | **yes** | Better Auth | Session signing |
| `BETTER_AUTH_URL` | **yes** | Better Auth | |
| `RESEND_API_KEY` | **yes** | `lib/auth.ts` | Password reset + email verification |
| `RESEND_FROM_EMAIL` | no | `lib/auth.ts` | Falls back to `onboarding@resend.dev` |
| `ORS_API_KEY` | **yes** | `lib/route-service.ts` | OpenRouteService; backend only |
| `PATHAO_FARE_API` | no | `lib/fare-providers.ts` | Documented in README/`.env.example`. Unset or unreachable → the two `pathao` rows fall back to their seeded rate card (`fareSource: "rate_card"`); no longer 500s. Was **yes in practice** before P1-2 |
| `OPENWEATHER_API_KEY` | no | `lib/weather.ts` | Missing → fares still render, `weatherUnavailable: true` |
| `OPENWEATHER_BASE_URL` | no | `lib/weather.ts` | Defaults to the v2.5 endpoint |
| `NOMINATIM_BASE_URL` | no | trip-input routes | Defaults to public Nominatim |
| `NOMINATIM_USER_AGENT` | no | trip-input routes | Defaults to `NoboJatra/1.0` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | no | `components/map/RouteMap.tsx` | Absent → OSM tiles. Undocumented |

Only `NEXT_PUBLIC_MAPBOX_TOKEN` is client-exposed. Every other key stays server-side, enforced by `import "server-only"` in `lib/weather.ts`, `lib/route-service.ts`, `lib/rate-limit.ts` and `lib/trip-history.ts`.

---

## 3. Repository map

```
app/
  (auth)/          signin, signup, forgot-password, reset-password
                   Own layout — full-bleed, no navbar, split-screen artwork
  (main)/          / (home), /profile, /fares, /dashboard (redirects to /)
                   Own layout — wraps everything in <Navbar/>
  api/
    auth/[...all]/          Better Auth catch-all
    profile/                GET / PATCH / DELETE — authed
    fares/                  POST — authed
    trip-input/             validate, autocomplete, current-location,
                            routes, history/[id]
    ─────────────── everything below is UNREACHABLE from the UI ───────────────
    map_routes/             3 handlers, no auth
    places/                 2 handlers, no auth
    camera/                 2 handlers, no auth
    traffic/                4 handlers, no auth
    test-mongo/             1 handler, no auth
lib/            Business logic. See §4
models/         8 Mongoose schemas. See §5
components/
  map/          RouteFinderForm, PlaceAutocomplete, RouteMap, RouteResults,
                MapDashboardSection (the orchestrator)
  home/         AnonymousHome, AuthedHome, RecentTrips, SuggestionTiles
  auth/         TextField, PasswordField, PasswordRequirements, RouteArtwork
  ui/           button.tsx (base-ui + cva), field-styles.ts
  FareResults.tsx   (top-level, not in a subfolder)
scripts/        seed-vehicle-rates.mts
patches/        react-leaflet@5.0.0.patch — see §7
instrumentation.ts   dev-only DNS override
```

### The dead half of `app/api/`

Twelve handlers — `map_routes/*`, `places/*`, `camera`, `traffic/*`, `test-mongo` — are called by **nothing** in the app (verified by grep; no component or lib references them). They're also the only endpoints with no authentication, and several read or write user location data by an arbitrary `userId` supplied in the request.

Treat them as an unmerged spike, not as API surface. Do not build on them without adding session checks first. Gap analysis #2 covers the exposure in detail.

---

## 4. `lib/` — where the logic lives

| Module | Responsibility | Imported by |
|---|---|---|
| `auth.ts` | Better Auth config, Resend emails, password-rule middleware. Creates its own `MongoClient` | server components, authed API routes |
| `auth-client.ts` | Better Auth React client | all auth pages, `logout.tsx` |
| `mongodb.ts` | Mongoose connection with a global cache (survives HMR) | everything touching `models/` |
| `trip-input.ts` | Service-area bounds, `validateTripInput`, haversine, schedule window | validate + routes APIs, `RouteFinderForm` |
| `route-service.ts` | OpenRouteService client, route de-duplication, leg colouring | routes API only |
| `routing.ts` | Shared route types, `ROUTE_COLORS`, client fetch helpers | map components, route-service |
| `trip-history.ts` | TripHistory create/read/update | routes API, history API, home page |
| `weather.ts` | OpenWeather client, 10-min cache, severity scoring, vehicle restrictions | fares API only |
| `rate-limit.ts` | Process-local token bucket | **autocomplete API only** |
| `geocode.ts` | Client-side wrappers for autocomplete + reverse geocode | `RouteFinderForm`, `PlaceAutocomplete` |
| `pending-trip.ts` | sessionStorage anonymous→authed handoff | `MapDashboardSection` |
| `password.ts` | Password rules mirrored from `auth.ts` | signup, reset, `PasswordRequirements` |
| `fares.ts` | **Dead code — nothing imports it** | — |
| `utils.ts` | `cn()` (clsx + tailwind-merge) | everywhere |

Two traps in that table:

- **`lib/fares.ts` is dead and it disagrees with what shipped.** It has rounding-to-৳5, asymmetric 0.9×/1.3× bands, and `speedFactor` support. `app/api/fares/route.ts` inlines its own math with a symmetric ±10% band and ignores `speedFactor` entirely — so the `0.7` speed factors the seed script sets on two-wheelers currently do nothing. Don't assume `lib/fares.ts` describes live behaviour.
- **`lib/rate-limit.ts` is used by exactly one route.** `app/api/trip-input/routes/route.ts` reimplements the same thing inline (~90 lines, drifted return shape).

---

## 5. Data model

Two connections to the same MongoDB deployment, held separately:

| | Client | Database chosen by |
|---|---|---|
| **Better Auth** | raw `MongoClient` in `lib/auth.ts` | `authMongoClient.db()` — no name given, so **the path in `MONGODB_URI`** |
| **Everything else** | Mongoose in `lib/mongodb.ts` | `dbName: MONGODB_DB ?? "nobojatra"` |

> **Trap.** These two agree today only because the current URI ends in `/nobojatra` *and* `MONGODB_DB` defaults to `"nobojatra"`. Point `MONGODB_URI` at a cluster without a database path and auth data silently lands in `test` while app data stays in `nobojatra` — sessions work, every join to a user breaks. Nothing asserts they match. If you touch connection config, verify both resolve to the same database.

### Collections

**Better Auth owns** (raw driver, never through Mongoose): `user`, `session`, `account`, `verification`.

**The app owns** (Mongoose models in `models/`):

| Model | Collection | Written by | Status |
|---|---|---|---|
| `TripHistory` | `triphistories` | routes API, history API | **Core.** Trip + up to 3 full polylines |
| `VehicleRate` | `vehiclerates` | seed script only | **Core.** Read by `/api/fares` |
| `UserProfile` | `userprofiles` | profile API, profile page | **Core.** Travel priority + default passengers |
| `Map_route` | `map_routes` | orphaned API only | Unreachable |
| `Place` | `places` | orphaned API only | Unreachable |
| `TrafficData` | `trafficdatas` | orphaned API only | Unreachable |
| `Camera` | `cameras` | orphaned API only | Unreachable |
| `Alert` | `alerts` | **nothing** | Read only by the delete cascade |

Only three models are live. `Alert` is referenced in exactly one place — `DELETE /api/profile`'s cleanup — and nothing ever creates one.

### `TripHistory` shape

The document everything else hangs off:

```
userId, origin{label,lat,lng}, destination{…}, stops[{…}],
passengerCount, departureMode, scheduledAt,
routeOptions[ {routeId, rank, distanceKm, durationMin, coords[[lat,lng]], legs[]} ],
selectedRoute{ …same shape… },
selectedVehicle{ … },      ← declared, NEVER written
distanceKm, durationMin, completedAt
```

`selectedVehicle` carries a well-reasoned comment about storing fares by value so rate changes don't rewrite history — and nothing populates it. Picking a fare in `FareResults.tsx:372` only sets local React state. **Persisting the vehicle choice is unfinished work**, not a feature you can rely on.

Note also: `origin` and `destination` are `Schema.Types.Mixed`, while `stops` uses a typed sub-schema. Origin/destination get no schema validation.

Indexes: `TripHistory.userId`, `UserProfile.userId` (unique), `VehicleRate.{provider,vehicleType}` (unique). The home page sorts trip history by `createdAt` with no compound index to support it.

---

## 6. Request flows in detail

### Route search — `POST /api/trip-input/routes`

1. Session check (401 if absent)
2. `validateTripInput` — service-area bounds, ≤6 stops, 1–8 passengers, ≥500 m trip, schedule ≤7 days out
3. **Cache lookup** — 2-minute in-process `Map`, keyed on coordinates rounded to 5 dp
4. Rate limit — 20/min per IP *(runs after the cache check, so cache hits bypass it — gap #8)*
5. `fetchRouteSuggestions` → ORS `driving-car/geojson`, 12 s timeout. Alternatives requested **only when there are no stops**
6. De-duplicate: reject routes within 0.25 km / 3 min *and* geometrically similar across 12 sampled points
7. `createTripHistoryRecord` → **a new document on every call, including cache hits**
8. Return `{ routes, tripHistoryId }`

### Fare estimation — `POST /api/fares`

1. Session check
2. Load `TripHistory` scoped by `{_id, userId}` — 404 if not owned
3. Find the route inside `routeOptions` — **distance, duration and passenger count all come from stored data, never from the client.** This is the deliberate design that stops someone forging a cheap fare via query params
4. Compute the route midpoint by arc length, fetch weather for it (falls back to Dhaka centre `23.8103, 90.4125`)
5. For each active `VehicleRate`: Pathao rows call the external API, everything else uses `baseFare + km×rate + min×rate`, floored at `minimumFare`; then ±10%
6. Apply weather restrictions per vehicle class
7. Sort eligible-first, then cheapest

Weather failures are caught and non-blocking (`weatherUnavailable: true`). **Pathao failures are not caught and take down the whole response** — gap #4.

### Weather severity

`lib/weather.ts` scores 0–10 as `precipitation×0.5 + wind×0.3 + visibility×0.2`, banded at `≥7` severe / `≥3.5` moderate. Restrictions: two-wheelers blocked on severe, cautioned on moderate; CNG blocked at `≥9`; everything else gets an advisory on severe.

The maximum achievable score is **9.5**, so the CNG branch effectively never fires (gap #16). Cache is a 10-minute in-process `Map` keyed on coordinates at 3 dp, carrying a `schemaVersion` so stale-shaped entries are discarded after a deploy.

### Auth

Better Auth with the MongoDB adapter, email/password only — no OAuth. A `before` middleware in `lib/auth.ts:163` enforces "contains a digit" on `/sign-up/email` and `/reset-password`, and returns a `CONFLICT` on duplicate signup emails. Reset tokens last 1 hour and revoke existing sessions.

Emails go through Resend via direct `fetch` (no SDK), with HTML-escaped interpolation.

**Route protection is per-page**, via `auth.api.getSession` in server components. There is no `middleware.ts`. `/profile` redirects when signed out; `/fares` does not (gap #19).

---

## 7. Conventions and non-obvious decisions

Several choices in this repo look odd until you read the comment next to them. The comments are good — trust them.

- **Route groups split the shell.** `(auth)` has no navbar; `(main)` wraps everything in one. A "Sign Up" button in the header while you're on the signup page is noise.
- **`/` serves two entirely different pages** based on session — `AnonymousHome` (marketing hero) or `AuthedHome` (planner). `/dashboard` is a redirect kept alive for old bookmarks.
- **`patches/react-leaflet@5.0.0.patch` is load-bearing.** React Strict Mode's remount simulation destroys the Leaflet map while leaving the container mounted, stranding an internal ref and crashing `TileLayer.onAdd`. The patch defers disposal until the container is genuinely detached. Applied via pnpm `patchedDependencies` — don't drop it when bumping react-leaflet.
- **`instrumentation.ts` overrides DNS to 1.1.1.1 / 8.8.8.8 in development only** — some local networks can't resolve Atlas SRV records. It uses `process.getBuiltinModule` rather than an import so the Edge bundle doesn't warn. **Four files then do the same thing inline, unconditionally, in production** (`app/(main)/page.tsx` and three API routes) — those are redundant, they're all four of your lint errors, and one is commented "DNS fix for saki". Delete them.
- **`ROUTE_COLORS` deliberately ignores the theme tokens** — the same colours are drawn over light OSM tiles *and* on dark cards, so they sit at a mid lightness that works on both.
- **Markers are monochrome by design**, labelled A / 1..n / B, so the colour channel belongs to routes alone.
- **`fieldClassName()` and the `form` button size are coupled** at 44 px / `rounded-xl` so submits line up with the fields above them. Keep them in sync.
- **Auth forms use `noValidate`** and validate in JS so every message renders inline and styled rather than as a native browser bubble.
- **Sign-in errors are deliberately generic** ("Invalid email or password") to avoid confirming which emails exist.
- **The seed script inlines its own schema** rather than importing `models/VehicleRate.ts`, because that file uses the `@/` alias which only resolves inside the Next build.
- **Seeded fare numbers are approximations of the Dhaka market, not published tariffs.** The script's header says so. Everything renders as a range labelled "estimate".
- **`app/layout.tsx` hardcodes `dark` on `<html>`.** The full light palette in `globals.css` exists but is unreachable — there's no theme toggle. Dark-only is the current product.

### Style

TypeScript strict, `@/*` path alias, double quotes and semicolons in most files (`FareResults.tsx` and `models/VehicleRate.ts` diverge to single quotes — pre-existing drift). Server components by default; `"use client"` only where interactivity demands it. API routes return `{ success, message?, data? }`, though the older orphaned routes also leak a raw `error` field (gap #11).

---

## 8. State of play

**Working end to end:** email/password auth with reset and verification; anonymous→signup trip handoff; place autocomplete; trip validation; route search with alternatives, de-duplication and multi-stop legs; map rendering; trip history with route selection; fare estimation with weather; profile editing and account deletion.

**Declared but not finished:** vehicle selection isn't persisted (`selectedVehicle` never written); `scheduledAt` is captured, validated and stored but never influences weather or fares — a trip scheduled for Thursday gets today's conditions; `Alert` has a model and a delete cascade but no producer; traffic/camera/places/saved-routes exist as unreachable endpoints only. The landing page lists "Live congestion levels", "Peak-hour insights" and "Saved places" as upcoming — those map to the orphaned APIs.

**Untested:** everything. Zero test files, no CI workflow. The four pure-function modules (`trip-input`, `weather`, `fares`, `route-service`) are the obvious first targets — unit tests there would have caught at least four of the logged defects.

### Team and branches

Remote is `github.com/Sakif16/nobojatra`. Four contributors: Sakib Muhtasim, Orgho Das, Misha. Work happens on feature branches merged to `main` by PR — but **twelve branches exist and several are stale**. Commit messages are informal (`sakib akam korse`, `dns fix 2`); worth agreeing a convention.

Working tree at handover: two older review docs deleted, `WEATHER_INTEGRATION_IMPLEMENTATION.md` untracked. That file is an accurate record of the weather module and its own "Remaining Gaps" section is honest — including the Pathao isolation problem, still unfixed.

---

## 9. Where to start

**Before writing any code**, run the two verifications the codebase itself is unsure about:

1. **Does the profile name update actually work?** `app/api/profile/route.ts:104` matches `_id` against a string; the DELETE handler 80 lines below hedges with `$or: [{_id}, {id}]`. `matchedCount` is never checked and the response always says "Profile saved." Change your display name in `/profile`, then read the document back from Mongo. The answer determines whether gap #6 is a one-line fix or a wider id-mapping problem.
2. **Do both connections resolve to the same database?** See §5. `db.getName()` on each.

Then, in order — full detail in [CODEBASE_GAP_ANALYSIS.md](CODEBASE_GAP_ANALYSIS.md):

| # | Task | Why first |
|---|---|---|
| 1 | Fix `lib/auth-client.ts` hardcoded `localhost:3000` baseURL | Auth is entirely broken on any deployed host |
| 2 | Delete the twelve unreachable API handlers | Removes the whole unauthenticated attack surface in one commit |
| 3 | ~~Isolate Pathao failures per-provider; document `PATHAO_FARE_API`~~ — **done** (P1-2) | Fares no longer 500 on a fresh clone |
| 4 | Delete the four inline `require("node:dns")` calls | Clears all four lint errors |
| 5 | Track `.env.example`, complete it | New engineers can't self-serve |

Those five are small and independent. After them the repo is deployable, and the P1 list (deletion paths, password guard, rate-limit ordering, TripHistory growth, the `datetime-local` timezone bug) is the natural next block.

**Good first change to learn the codebase:** add unit tests for `calculateWeatherSeverity` and `getWeatherVehicleRestriction`. Pure functions, no I/O, and writing them surfaces the unreachable CNG threshold immediately — you'll have read the fare and weather paths by the time you're done.
