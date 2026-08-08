# NoboJatra Repository Structure and Handoff Guide

Snapshot date: 2026-08-05

Branch inspected: `main`

Application type: Next.js App Router application with server routes in the same repository

This document is a codebase map for the next developer. It describes the current architecture, runtime dependencies, URL surface, data models, and every source-controlled file. Generated dependencies and private local files are summarized separately.

## 1. What the application does

NoboJatra is a travel-planning application focused on Dhaka Division. A visitor can enter a trip and explore the product UI; a signed-in user can request up to three driving-route alternatives, add up to six stops, schedule a trip up to seven days ahead, save route history, choose an alternative, and maintain account/profile defaults.

The application also contains APIs and models for saved places, persisted map routes, traffic readings, cameras, alerts, and vehicle/fare rates. Some of those are older backend capabilities and are not all connected to a finished UI.

Authentication is email/password through Better Auth. Signup, signin, email verification, email change, forgot-password, reset-password, session revocation after password reset, profile editing, and account deletion are present. Resend is used for authentication email delivery.

## 2. Technology stack

| Area | Current choice |
| --- | --- |
| Web framework | Next.js 16.2.9, App Router |
| UI | React 19.2.4, TypeScript, Tailwind CSS 4 |
| UI helpers | Base UI, shadcn configuration, Lucide icons, CVA, `clsx`, `tailwind-merge` |
| Maps | Leaflet, React Leaflet, OpenStreetMap tiles; optional Mapbox public token is referenced |
| Routing | openrouteservice Directions API |
| Geocoding | OpenStreetMap Nominatim search and reverse geocoding |
| Authentication | Better Auth with MongoDB adapter |
| Database | MongoDB; native MongoDB client for Better Auth and Mongoose for domain models |
| Email | Resend REST API |
| Package manager | pnpm, with a committed lockfile |
| Quality tools | ESLint 9 and strict TypeScript configuration |

There is currently no automated test suite or test script in `package.json`.

## 3. High-level request flow

1. `app/layout.tsx` loads the global theme, Inter font, and Leaflet CSS.
2. `app/(main)/layout.tsx` adds the shared navigation bar to normal application pages.
3. `app/(main)/page.tsx` reads the Better Auth session. Anonymous visitors receive the marketing/planner preview; signed-in users receive their profile defaults, recent trips, upcoming-trip count, and full planner.
4. The map form validates input in the browser-facing flow through `/api/trip-input/validate`.
5. Route calculation calls authenticated `/api/trip-input/routes`, which validates again on the server, applies an in-memory cache/rate limit, calls openrouteservice, removes near-duplicate route alternatives, and writes a `TripHistory` snapshot.
6. Selecting a different route calls authenticated `/api/trip-input/history/[tripHistoryId]`, which verifies ownership and updates the stored selected-route snapshot.
7. MongoDB stores both Better Auth collections and Mongoose domain collections. `lib/auth.ts` and `lib/mongodb.ts` are the two database entry points.

## 4. User-facing pages

| URL | Source | Purpose |
| --- | --- | --- |
| `/` | `app/(main)/page.tsx` | Session-aware home: public landing/planner preview or signed-in dashboard-style planner. |
| `/dashboard` | `app/(main)/dashboard/page.tsx` | Dedicated route-planner page. |
| `/profile` | `app/(main)/profile/page.tsx` | Authenticated profile and account-management page; redirects anonymous users to signin. |
| `/signin` | `app/(auth)/signin/page.tsx` | Email/password signin with visible validation and error handling. |
| `/signup` | `app/(auth)/signup/page.tsx` | Account registration with password confirmation and password-rule feedback. |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Requests a password-reset email. |
| `/reset-password?token=...` | `app/(auth)/reset-password/page.tsx` | Accepts a Better Auth reset token and renders the client reset form. |

The `(main)` and `(auth)` names are route groups and do not appear in the browser URL.

## 5. API route inventory and current protection

“Session enforced” means the handler reads the Better Auth session on the server. “Not enforced” means the current handler does not authenticate the caller; this is an important distinction for future work.

| Method and URL | Protection | Responsibility |
| --- | --- | --- |
| `GET/POST /api/auth/[...all]` | Better Auth-managed | Catch-all Better Auth endpoints for sessions, signup/signin, verification, password reset, and related auth operations. |
| `GET /api/profile` | Session enforced | Returns the signed-in auth user and creates/returns their domain profile defaults. |
| `PATCH /api/profile` | Session enforced | Updates name, requests verified email change, and updates travel priority/passenger defaults. |
| `DELETE /api/profile` | Session enforced + `DELETE` confirmation | Deletes the account, auth records, and related domain data. |
| `POST /api/trip-input/validate` | Not enforced | Validates origin, destination, stops, passengers, scheduling, service area, and minimum distance. |
| `GET /api/trip-input/autocomplete?q=...` | Not enforced; in-memory rate limited | Proxies bounded Nominatim autocomplete for Dhaka Division. |
| `GET /api/trip-input/current-location?lat=...&lng=...` | Not enforced | Reverse-geocodes coordinates through Nominatim and rejects locations outside the service area. |
| `POST /api/trip-input/routes` | Session enforced; in-memory rate limited | Validates a trip, requests/caches route alternatives, creates trip history, and returns routes plus history ID. |
| `PATCH /api/trip-input/history/[tripHistoryId]` | Session and ownership enforced | Changes the selected route inside the caller's trip-history record. |
| `POST /api/places` | Not enforced | Creates a saved place using a client-provided `userId`. |
| `GET /api/places/[userId]` | Not enforced | Lists places for a path-provided user ID. |
| `POST /api/map_routes` | Not enforced | Persists a computed map route using a client-provided `userId`. |
| `GET /api/map_routes?...` | Not enforced | Finds saved routes using client-provided user/coordinate query values. |
| `GET /api/map_routes/[routeId]` | Not enforced | Returns one stored route by MongoDB ID. |
| `GET /api/map_routes/[routeId]/bounds` | Not enforced | Computes min/max latitude and longitude for a stored route polyline. |
| `POST /api/traffic` | Not enforced | Stores a single route traffic-duration reading. |
| `POST /api/traffic/batch` | Not enforced | Stores multiple route traffic readings. |
| `GET /api/traffic/[routeId]` | Not enforced | Returns the latest traffic record and calculated delay for a route. |
| `GET /api/traffic/[routeId]/peak-hours` | Not enforced | Aggregates route traffic by hour to identify delay patterns. |
| `POST /api/camera` | Not enforced | Creates a camera record. |
| `GET /api/camera?location=...` | Not enforced | Lists available cameras, optionally filtered by location. |
| `GET /api/test-mongo` | Not enforced | Pings MongoDB and returns connection/database information; intended as a diagnostic endpoint. |

### Security boundary to address

The profile and current trip-history flow derives the user ID from the server-side session. The older places, map-route, traffic, and camera APIs do not. In particular, places and map routes trust caller-supplied user IDs. Before exposing those APIs in a production UI, add server-side authentication, ownership/authorization checks, input schemas, and safe error serialization. The public Mongo diagnostic endpoint should also be removed or restricted for production.

## 6. Environment variables

| Variable | Required | Used by |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Better Auth native client, Mongoose connection, and rate seeder. |
| `MONGODB_DB` | Optional | Mongoose and seeder database name; defaults to `nobojatra`. |
| `BETTER_AUTH_SECRET` | Yes outside Better Auth development fallbacks | Better Auth signing/encryption. |
| `BETTER_AUTH_URL` | Yes for correct deployment links/origins | Better Auth base URL and email callbacks; local value is normally `http://localhost:3000`. |
| `RESEND_API_KEY` | Required for real email delivery | Password reset and email-verification messages. |
| `RESEND_FROM_EMAIL` | Required for production email | Verified Resend sender; code otherwise falls back to the restricted `onboarding@resend.dev` sender. |
| `ORS_API_KEY` | Required for route lookup | Server-only openrouteservice Directions requests. Never expose this as a `NEXT_PUBLIC_` variable. |
| `NOMINATIM_BASE_URL` | Optional | Overrides the default `https://nominatim.openstreetmap.org`. |
| `NOMINATIM_USER_AGENT` | Optional but recommended to set explicitly | Identifies server-side Nominatim requests; defaults to `NoboJatra/1.0`. |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Optional in the current map component | Read by `RouteMap`; public by definition. When set, the map uses Mapbox Streets tiles; otherwise it falls back to OpenStreetMap tiles. |

Never commit `.env`. The local `.env` may contain secrets and is intentionally ignored. Note that `.env.example` is also currently ignored because `.gitignore` contains `.env*`; a new clone will not receive that example unless `.gitignore` is changed to opt it back in with `!.env.example` and the file is committed.

## 7. Database ownership and models

Better Auth manages its own MongoDB collections, including users, accounts, sessions, and verification records. The application domain uses these Mongoose models:

| Model file | Stored information |
| --- | --- |
| `models/Alert.ts` | User alert title/message, optional map route, severity, and read time. No alert UI/API is currently present. |
| `models/Camera.ts` | Camera name, location, stream URL, availability, and timestamps. |
| `models/Map_route.ts` | Owner ID, origin/destination/stops, rank, distance, duration, encoded polyline, and color-coded route segments. |
| `models/Place.ts` | User ID, label, location string, and timestamps for saved places. |
| `models/TrafficData.ts` | Route reference, current/free-flow duration, recorded time, and timestamps. |
| `models/TripHistory.ts` | Authenticated trip snapshot: endpoints, stops, passenger/schedule data, route options, selected route, optional selected vehicle/fare snapshot, metrics, and completion time. |
| `models/UserProfile.ts` | One profile per auth user with default travel priority (`time`, `cost`, or `comfort`) and passenger count (1–8). |
| `models/VehicleRate.ts` | Uber/Pathao/CNG vehicle rate definitions, capacity, comfort, speed factor, activity status, and a unique provider/type index. |

## 8. Complete directory and file map

### Repository root

| File | Responsibility |
| --- | --- |
| `.gitignore` | Excludes dependencies, Next/build output, coverage, environment files, editor/OS debris, TypeScript build info, and generated Next declarations. |
| `README.md` | Short setup guide, environment example, password-reset test procedure, auth feature list, and lint/build commands. |
| `REPOSITORY_STRUCTURE_AND_HANDOFF.md` | This full repository inventory and handoff guide. |
| `components.json` | shadcn configuration: Base Nova style, React Server Components, Tailwind CSS path, Lucide icons, and `@/` aliases. |
| `eslint.config.mjs` | Flat ESLint config using Next core-web-vitals and TypeScript rules; ignores generated build outputs. |
| `instrumentation.ts` | Development-only Node runtime DNS workaround for MongoDB Atlas SRV resolution; uses Cloudflare/Google resolvers when supported. |
| `next.config.ts` | Next.js configuration placeholder; currently no custom options. |
| `package.json` | Project metadata, `dev`, `build`, `start`, `lint`, and `seed:rates` scripts plus runtime/dev dependencies. |
| `pnpm-lock.yaml` | Exact pnpm dependency graph; regenerate only through pnpm dependency changes. |
| `pnpm-workspace.yaml` | pnpm build-policy configuration for `sharp` and `unrs-resolver`; this is a single-package repository despite the filename. |
| `postcss.config.mjs` | Enables the Tailwind CSS PostCSS plugin. |
| `tsconfig.json` | Strict, no-emit TypeScript config with bundler resolution, Next plugin, incremental builds, and `@/*` mapped to repository root. |

### `.vscode/`

| File | Responsibility |
| --- | --- |
| `.vscode/settings.json` | Workspace setting that suppresses Postman dotenv-detection notifications. |

### `app/` — Next.js routes, layouts, and global styling

| File | Responsibility |
| --- | --- |
| `app/layout.tsx` | Root HTML/body layout, metadata, Inter font, global CSS, and Leaflet CSS import. Forces the dark theme via the root `dark` class. |
| `app/globals.css` | Tailwind import, light/dark OKLCH design tokens, typography, radii, shadows, theme bindings, and base styles. |
| `app/favicon.ico` | Browser favicon binary. |

#### `app/(auth)/`

| File | Responsibility |
| --- | --- |
| `app/(auth)/layout.tsx` | Two-column auth shell with back link, product highlights, and decorative route artwork. |
| `app/(auth)/signin/page.tsx` | Client signin form; validates fields, calls `authClient.signIn.email`, displays a generic credential error, and redirects to `/`. |
| `app/(auth)/signup/page.tsx` | Client signup form; validates name/email/password/confirmation, shows password rules, handles duplicate-email errors, and calls Better Auth signup. |
| `app/(auth)/forgot-password/page.tsx` | Client reset-request form; validates email, calls `requestPasswordReset`, and avoids disclosing whether an account exists. |
| `app/(auth)/reset-password/page.tsx` | Server wrapper that reads the query-string token and passes it to the client form. |
| `app/(auth)/reset-password/reset-password-form.tsx` | Client reset form with token, confirmation, password-rule, loading, success, and error handling. |

#### `app/(main)/`

| File | Responsibility |
| --- | --- |
| `app/(main)/layout.tsx` | Normal application shell that places the shared navbar above page content. |
| `app/(main)/page.tsx` | Session-aware home controller; loads recent/upcoming trips and profile defaults for signed-in users. |
| `app/(main)/dashboard/page.tsx` | Minimal page that renders `MapDashboardSection`. |
| `app/(main)/profile/page.tsx` | Server-protected profile page; loads/creates `UserProfile`, serializes initial values, and renders the profile form. |
| `app/(main)/profile/profile-form.tsx` | Client account form for display name, verified email change, travel/passenger defaults, signout-after-delete, and destructive account deletion confirmation. |

#### `app/api/`

| File | Responsibility |
| --- | --- |
| `app/api/auth/[...all]/route.ts` | Adapts the Better Auth instance to Next.js `GET` and `POST` handlers. |
| `app/api/profile/route.ts` | Authenticated `GET`, `PATCH`, and `DELETE` profile/account operations, including cascading deletion of domain and auth records. |
| `app/api/test-mongo/route.ts` | Node-runtime MongoDB health/ping diagnostic. |
| `app/api/places/route.ts` | Unauthenticated creation of a saved place. Also applies a route-local DNS resolver override. |
| `app/api/places/[userId]/route.ts` | Unauthenticated saved-place lookup by path user ID. Also applies a route-local DNS resolver override. |
| `app/api/map_routes/route.ts` | Unauthenticated creation and coordinate/user-filtered retrieval of persisted map routes. |
| `app/api/map_routes/[routeId]/route.ts` | Unauthenticated retrieval of one persisted map route by ID. |
| `app/api/map_routes/[routeId]/bounds/route.ts` | Unauthenticated route-bound calculation from decoded polyline data. |
| `app/api/traffic/route.ts` | Unauthenticated creation of one traffic reading. |
| `app/api/traffic/batch/route.ts` | Unauthenticated bulk insertion of traffic readings. |
| `app/api/traffic/[routeId]/route.ts` | Unauthenticated latest-traffic lookup and delay calculation for a route. |
| `app/api/traffic/[routeId]/peak-hours/route.ts` | Unauthenticated hourly aggregation of traffic delay for a route. |
| `app/api/camera/route.ts` | Unauthenticated camera creation and available-camera listing/filtering. |
| `app/api/trip-input/validate/route.ts` | Public JSON trip validator backed by the shared `validateTripInput` rules. |
| `app/api/trip-input/autocomplete/route.ts` | Public, rate-limited Nominatim search proxy restricted to the configured Dhaka service-area viewbox. |
| `app/api/trip-input/current-location/route.ts` | Public Nominatim reverse-geocoding proxy with coordinate and service-area validation. |
| `app/api/trip-input/routes/route.ts` | Authenticated route-generation endpoint with server validation, 20-request/minute per-process limit, two-minute per-process cache, ORS calls, and trip-history creation. |
| `app/api/trip-input/history/[tripHistoryId]/route.ts` | Authenticated, owner-scoped selected-route update for an existing trip history item. |

### `components/` — reusable UI

| File | Responsibility |
| --- | --- |
| `components/navbar.tsx` | Async server navbar; shows signin/signup to visitors or profile/logout controls to authenticated users. |
| `components/logout.tsx` | Client Better Auth signout button and redirect. |

#### `components/auth/`

| File | Responsibility |
| --- | --- |
| `components/auth/PasswordField.tsx` | Reusable password input with show/hide control, label, hint, error, and autocomplete support. |
| `components/auth/PasswordRequirements.tsx` | Live checklist driven by shared password rules. |
| `components/auth/RouteArtwork.tsx` | Decorative SVG-like route artwork used by the auth layout. |
| `components/auth/TextField.tsx` | Reusable labelled text/email input with error and autocomplete support. |
| `components/auth/field-styles.ts` | Shared Tailwind class strings for auth inputs, labels, and messages. |

#### `components/home/`

| File | Responsibility |
| --- | --- |
| `components/home/AnonymousHome.tsx` | Public landing page with product copy, feature cards, planner preview, and signup calls to action. |
| `components/home/AuthedHome.tsx` | Signed-in home composition: greeting, upcoming count, planner, suggestion tiles, and recent trips. |
| `components/home/RecentTrips.tsx` | Renders recent `TripHistory` summaries and an empty state. |
| `components/home/SuggestionTiles.tsx` | Feature navigation/status cards; saved places and fare comparison are visibly marked “Soon.” |

#### `components/map/`

| File | Responsibility |
| --- | --- |
| `components/map/MapDashboardSection.tsx` | Client orchestration layer joining form, validation, route requests, selected-route persistence, map/results, pending anonymous trip handling, and optional sidebar content. |
| `components/map/PlaceAutocomplete.tsx` | Debounced place-search input that calls the autocomplete API and exposes typed place selection. |
| `components/map/RouteFinderForm.tsx` | Main trip form for endpoints, reorderable stops, passenger count, leave-now/scheduled mode, validation messages, and submit state. |
| `components/map/RouteMap.tsx` | Client-only React Leaflet map with numbered markers, colored alternatives/legs, popups, and automatic bounds fitting. |
| `components/map/RouteResults.tsx` | Route option cards showing rank, distance, duration, leg colors, and selected state. |

#### `components/ui/`

| File | Responsibility |
| --- | --- |
| `components/ui/button.tsx` | Base UI button wrapper with CVA variants/sizes, including project-specific primary/secondary styles. |

### `lib/` — shared application and infrastructure logic

| File | Responsibility |
| --- | --- |
| `lib/auth-client.ts` | Browser Better Auth client, using `/api/auth` as the base path. |
| `lib/auth.ts` | Server Better Auth configuration, MongoDB adapter/client, password/duplicate-email hooks, reset policy, email change, and Resend HTML/text delivery for reset and verification emails. |
| `lib/mongodb.ts` | Cached Mongoose connection helper; validates `MONGODB_URI` and selects `MONGODB_DB`. |
| `lib/password.ts` | Shared browser-safe password constants/rules and email/password validation helpers. |
| `lib/trip-input.ts` | Canonical server/client trip types and validation: Dhaka bounds, stops, passengers, schedule window, coordinates, and minimum distance. |
| `lib/geocode.ts` | Browser helpers for autocomplete search and reverse geocoding through local API endpoints. |
| `lib/route-service.ts` | Server-only openrouteservice integration, timeout/error translation, GeoJSON-to-app mapping, route sampling, and alternative de-duplication. |
| `lib/routing.ts` | Browser route types/colors, `/api/trip-input/routes` client, response-error extraction, and selected-history update client. |
| `lib/trip-history.ts` | Server-only history serialization, recent/upcoming summary queries, trip snapshot creation, and owner-scoped selected-route updates. |
| `lib/pending-trip.ts` | Validated `sessionStorage` handoff used to preserve an anonymous planner entry across signup. |
| `lib/rate-limit.ts` | Reusable in-memory fixed-window rate limiter plus client-IP and response-header helpers; currently used by autocomplete. |
| `lib/fares.ts` | Pure BDT fare/duration estimation, low/high multipliers, rounding, and formatting utilities. |
| `lib/utils.ts` | `cn()` helper combining `clsx` and `tailwind-merge`. |

### `models/` — Mongoose schemas

| File | Responsibility |
| --- | --- |
| `models/Alert.ts` | Alert schema and model. |
| `models/Camera.ts` | Traffic-camera schema and model. |
| `models/Map_route.ts` | Persisted point, route-segment, and map-route schemas/model. |
| `models/Place.ts` | Saved-place schema and model. |
| `models/TrafficData.ts` | Route traffic-duration schema and model. |
| `models/TripHistory.ts` | Trip, route-option, and selected-vehicle snapshot schemas/model. |
| `models/UserProfile.ts` | Profile defaults schema/model and travel-priority constants/type. |
| `models/VehicleRate.ts` | Provider/vehicle constants, TypeScript interface, pricing/capacity schema, and unique compound index. |

### `scripts/`

| File | Responsibility |
| --- | --- |
| `scripts/seed-vehicle-rates.mts` | Connects to MongoDB and upserts the initial Uber, Pathao, CNG, and XL rate table. Run through `pnpm seed:rates`. |

### `public/`

| File | Responsibility |
| --- | --- |
| `public/file.svg` | Default document/file icon left from the Next starter assets. |
| `public/globe.svg` | Default globe icon left from the Next starter assets. |
| `public/next.svg` | Default Next.js logo left from the starter assets. |
| `public/vercel.svg` | Default Vercel logo left from the starter assets. |
| `public/window.svg` | Default window icon left from the Next starter assets. |

These SVGs are not referenced by the current application code and can be removed after confirming no external/static links rely on them.

## 9. Local-only and generated paths

These paths exist in the inspected working directory but are intentionally not part of the source inventory that another developer should edit:

| Path | Meaning / handoff rule |
| --- | --- |
| `.git/` | Git object database and local repository metadata. Never copy-edit its contents. |
| `.env` | Private local environment values. Transfer secrets through an approved secret manager, never through Git or this document. |
| `.env.example` | Safe variable-name template, but currently ignored and untracked due to `.env*`. Consider explicitly committing it. |
| `.next/` | Generated Next.js development/build output. Delete/regenerate when stale; do not hand-edit. |
| `node_modules/` | Installed dependency tree derived from the lockfile. Reinstall rather than copying or editing it. |
| `next-env.d.ts` | Next-generated TypeScript declarations; ignored by Git. |
| `tsconfig.tsbuildinfo` | TypeScript incremental-build cache; ignored by Git. |
| `.DS_Store` | macOS Finder metadata; ignored by Git and safe to discard. |

No `coverage/`, `out/`, or `build/` directory was part of the current source tree; those paths are ignored if generated.

## 10. Setup and verification

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`.

Seed the fare-rate collection after configuring MongoDB:

```bash
pnpm seed:rates
```

Run the available static/production checks before handing off changes:

```bash
pnpm lint
pnpm build
```

If a package-manager binary is unavailable but the dependency tree already exists, the checked-in README documents direct local binary fallbacks such as `./node_modules/.bin/next dev`.

There is no committed automated test suite. A future maintainer should add tests for shared trip validation and fare calculations first, then authenticated route ownership, profile/account deletion, Better Auth hooks, rate limiting, external API failures, and the older unauthenticated API surface.

## 11. External-service behavior to verify in each environment

- MongoDB connectivity and the intended database name.
- Better Auth base URL, secret, cookie/session behavior, signup, signin, verification, email change, reset, and signout.
- Resend API credentials, verified sender/domain, and a real end-to-end delivery test. Code presence alone does not prove delivery.
- openrouteservice quota, response shape, error behavior, and latency.
- Nominatim usage-policy compliance, identifying user agent, rate limits, and availability.
- Leaflet tile loading and any actual need for `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Production behavior of the per-process in-memory caches/rate limiters. They are not shared across instances and reset on restart.

## 12. Recommended first work items

1. Protect or remove the legacy unauthenticated places, map-route, traffic, camera, and Mongo diagnostic routes. Derive ownership from the server session instead of request-provided user IDs.
2. Add request-schema validation and consistent sanitized API errors, especially before persisting camera/traffic/place/map-route input.
3. Add automated tests and a `test` script; start with pure library rules and authenticated ownership boundaries.
4. Fix the environment-template tracking rule so a fresh clone receives a safe `.env.example`, including all currently referenced optional variables.
5. Decide whether the legacy `Map_route` flow and the newer `TripHistory`/openrouteservice flow should be merged or have clearly separate product purposes.
6. Move rate limits and route caching to shared infrastructure if the application will run on multiple server instances.
7. Connect or deliberately remove currently partial features/models: alerts, saved-place UI, traffic/camera UI, fare/vehicle selection, and unused starter SVG assets.
8. Add deployment/runbook documentation after the target host, MongoDB environment, email sender, and API quotas are finalized.

## 13. Handoff checklist

- Share the Git repository, not `.next`, `node_modules`, or `.git` internals copied as loose files.
- Provision environment values separately and securely.
- Confirm the recipient knows that `.env.example` is not currently committed.
- Run lint and production build in the recipient's environment.
- Seed vehicle rates only against the intended database.
- Test external providers with non-production/test credentials first.
- Treat the unauthenticated legacy API routes as unfinished security work, not production-safe public APIs.
- Record any schema migrations or operational decisions added after this snapshot in this guide or a dedicated architecture/runbook document.
