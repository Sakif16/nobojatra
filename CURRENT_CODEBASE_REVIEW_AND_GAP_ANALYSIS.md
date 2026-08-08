# NoboJatra Current Codebase Review and Gap Analysis

Review date: 2026-08-06

Branch and revision reviewed: `main` at `152a62a` (`Merge pull request #12 ... fare estimation implementation`)

Scope: the complete tracked Next.js application, including pages, components, API routes, Better Auth configuration, Mongoose models, route/geocoding/fare integrations, scripts, configuration, documentation, static validation, dependency audit, and safe live API probes.

## Executive verdict

NoboJatra has a solid working prototype foundation. Authentication, password recovery, server-side trip validation, OpenRouteService routing, route alternatives, route-selection history, profile defaults, Nominatim autocomplete/reverse geocoding, and a first fare-estimation screen are implemented rather than mocked.

It is not ready for an unrestricted production release. The most important blockers are:

1. Several legacy data APIs allow anonymous reads and writes and trust caller-provided ownership identifiers.
2. The production dependency audit reports 15 known advisories: 7 high and 8 moderate.
3. The public fare endpoint can trigger database and provider work without authentication, rate limiting, strict input validation, timeout handling, or provider-failure isolation.
4. There is no automated test suite or CI release gate, and the current lint command fails.
5. The data model has two disconnected route systems: the active planner stores route snapshots in `TripHistory`, while traffic, alerts, and legacy routes reference `Map_route` documents that the active planner does not create.

Recommended release status: **block production exposure until P0 items are fixed and verified**.

## Current quality snapshot

| Area | Current result | Assessment |
| --- | --- | --- |
| Production build | `./node_modules/.bin/next build` passed; 23 application routes compiled | Good baseline |
| ESLint | Failed with 4 errors and 4 warnings | Release gate failing |
| Automated tests | No test/spec files and no `test` script | Missing |
| Production dependency audit | 15 advisories: 7 high, 8 moderate | Release blocker |
| MongoDB smoke check | `/api/test-mongo` returned HTTP 200 | Connectivity works locally |
| Better Auth anonymous guards | Protected profile/route-history handlers returned HTTP 401 | Working |
| Trip validation | Valid request returned HTTP 200; invalid request returned HTTP 400 | Working |
| Nominatim autocomplete | HTTP 200 with results and rate-limit headers when using `query=` | Working with limitations |
| Nominatim reverse geocoding | HTTP 200 for valid Dhaka coordinates | Working with limitations |
| Fare calculation | Valid 10 km/30 minute request returned seven estimates | Happy path works |
| Fare input boundary | Negative distance/duration/passenger query rendered `/fares` with HTTP 200 | Invalid input accepted |
| Place validation | Empty write returned HTTP 500 and raw Mongoose validation details | Defect |

## What is already implemented well

These parts should be preserved and extended rather than reimplemented:

- Better Auth owns password hashing, sessions, password reset tokens, and password reset session revocation.
- Signup and reset-password policies are enforced server-side: minimum eight characters and at least one number.
- Duplicate signup receives a deliberate `409 EMAIL_ALREADY_EXISTS` response.
- Password reset and verification email bodies provide HTML and plain-text versions and escape inserted HTML values.
- The active route API requires an authenticated session and derives history ownership from `session.user.id`.
- Trip inputs are revalidated on the server, including service area, passenger range, stops, scheduling, and minimum distance.
- The ORS key is server-only, provider requests have a 12-second timeout, provider errors are translated to user-facing messages, and near-duplicate alternatives are removed.
- Selected-route history updates validate the MongoDB ID and scope the record by authenticated user ID.
- The profile API reads the current user from the server session rather than accepting a user ID from the browser.
- The anonymous planner preserves an entered trip across signup without granting anonymous access to the route provider.
- The UI provides loading, validation, and selected-route persistence feedback for the main route-planning flow.
- Vehicle rate seeding is idempotent by provider/vehicle type and explicitly labels the seed values as approximations.

## Priority definitions

| Priority | Meaning |
| --- | --- |
| P0 | Must be fixed before production exposure because it creates a security, abuse, or known-vulnerability boundary. |
| P1 | Must be fixed before calling the product reliable or using it for meaningful user data. |
| P2 | Product completeness, accessibility, maintainability, and scale work needed after the core boundaries are safe. |
| P3 | Cleanup and consistency improvements that reduce future maintenance cost. |

# P0 — production blockers

## P0-1: Protect every legacy data API and stop trusting caller ownership

Affected handlers:

- `app/api/places/route.ts`
- `app/api/places/[userId]/route.ts`
- `app/api/map_routes/route.ts`
- `app/api/map_routes/[routeId]/route.ts`
- `app/api/map_routes/[routeId]/bounds/route.ts`
- `app/api/traffic/route.ts`
- `app/api/traffic/batch/route.ts`
- `app/api/traffic/[routeId]/route.ts`
- `app/api/traffic/[routeId]/peak-hours/route.ts`
- `app/api/camera/route.ts`
- `app/api/test-mongo/route.ts`

Current behavior:

- Saved places can be created for any caller-supplied `userId`.
- Places can be enumerated for a user ID supplied in the URL.
- Persisted routes can be created/read with caller-supplied ownership and route IDs.
- Traffic readings can be written and read anonymously.
- Camera records and stream URLs can be registered anonymously.
- MongoDB connection state and database name are publicly returned by the diagnostic route.

Impact:

- Cross-user data access and impersonation.
- Database spam and provider/application resource abuse.
- Untrusted camera/traffic data poisoning.
- Exposure of internal operational information.
- No reliable audit trail for who created or modified records.

Required fix:

- Create a shared server helper that requires a Better Auth session.
- Remove `userId` from public request bodies and user-scoped URL contracts; derive it from `session.user.id`.
- Add owner-scoped lookups for every user-owned record.
- Define roles or a separate authenticated ingestion credential for traffic/camera administration; normal users should not create infrastructure data.
- Remove `/api/test-mongo` in production or restrict it to an internal readiness mechanism that reveals no database name.
- Return `401` for no session, `403` for insufficient role, and owner-safe `404`/`403` for cross-user records.

Done when:

- Anonymous requests to every protected read/write route fail with `401` or `403`.
- User A cannot read or mutate User B's place/route/history data.
- Traffic and camera writes require a documented privileged identity.
- Tests cover anonymous, authenticated owner, authenticated non-owner, and administrator cases for every alias.

## P0-2: Upgrade vulnerable production dependencies

`pnpm audit --prod` reported 15 advisories: 7 high and 8 moderate.

Important installed versions from `pnpm-lock.yaml`:

- `next@16.2.9`; audit reports multiple Next.js advisories fixed in `16.2.11`.
- `sharp@0.34.5`; audit reports inherited libvips vulnerabilities fixed in Sharp `0.35.0`.
- `postcss@8.4.31` under Next.js and `postcss@8.5.25` elsewhere; several PostCSS advisories were reported.
- `hono@4.12.33` through `shadcn`; the reported Hono issue is fixed in `4.12.34`.

Required fix:

- Upgrade Next.js to at least the audit-reported patched version, regenerate the pnpm lockfile, and verify the resolved Sharp and PostCSS versions.
- Move `shadcn` to development dependencies or remove it from installed production dependencies if it is only used as a code-generation tool.
- Ensure the Hono dependency resolves to a patched version.
- Do not add broad overrides without verifying that Next.js and its native Sharp integration still build and run.

Done when:

- `pnpm audit --prod` reports no high-severity vulnerabilities.
- Lint, build, unit/integration tests, image handling, auth, and the API smoke suite all pass after the upgrade.
- The regenerated lockfile is reviewed and committed with `package.json`.

## P0-3: Harden the fare API against abuse and provider failure

Affected files:

- `app/api/fares/route.ts`
- `app/(main)/fares/page.tsx`
- `components/FareResults.tsx`
- `lib/fares.ts`

Current behavior:

- `/api/fares` is anonymous and has no rate limit.
- Any truthy values are accepted; finite numbers, positivity, passenger range, and maximum distance/duration are not checked.
- The fares page accepts negative values because its guard only checks JavaScript truthiness.
- `PATHAO_FARE_API!` suppresses a TypeScript warning but does not validate runtime configuration.
- Provider calls have no timeout, `response.ok` check, response schema validation, cache, or failure fallback.
- Pathao calls run sequentially for each Pathao rate, increasing latency.
- A single provider error can fail the whole response.
- The client assumes `d.results` always exists and has no catch, non-2xx, empty, retry, or unmount/race handling.

Impact:

- Provider quota exhaustion and database/provider denial of service.
- Invalid or nonsensical estimates.
- Loading state can hang or the component can crash on error responses.
- One provider outage hides estimates from all other providers.

Required fix:

- Decide whether fare comparison is authenticated. If it remains public, apply a strict shared rate limit and cache; if it is part of saved trips, require the session.
- Validate a typed schema: finite positive distance/duration, passengers 1–8, and documented upper bounds.
- Derive fare inputs from a server-owned route-history record where possible instead of trusting URL/body metrics.
- Validate `PATHAO_FARE_API` at startup or return a controlled `503` when absent.
- Add request timeout, `response.ok` handling, validated response shape, parallelized/deduplicated provider calls, and per-provider fallback results.
- Return a consistent response envelope and update the component with error, empty, retry, and cancellation states.

Done when:

- Negative, `NaN`, string, zero, excessive, and malformed values return `400` without database/provider work.
- Missing provider configuration returns a sanitized `503`.
- Provider timeout/failure still returns local estimates with a clear partial-data marker.
- Repeated requests are bounded by rate limiting/caching.
- Automated tests cover validation, provider timeout, non-JSON response, non-2xx response, partial success, and empty rates.

# P1 — reliability and architectural gaps

## P1-1: Consolidate the two disconnected route data models

Current active flow:

- ORS returns transient IDs such as `route-0`.
- `lib/trip-history.ts` stores route snapshots directly in `TripHistory.routeOptions`.
- The active planner does not create a `Map_route` document.

Legacy flow:

- `TrafficData.routeId`, `Alert.routeId`, and `TripHistory.routeId` reference `Map_route` MongoDB IDs.
- `/api/map_routes` persists a different route shape with an encoded `polyline`.

Impact:

- Traffic and alerts cannot be reliably attached to routes produced by the active planner.
- `TripHistory.routeId` is normally empty while route snapshots carry transient string IDs.
- Account deletion contains cleanup for a relationship the main planner does not create.
- Maintainers cannot tell whether `Map_route` is canonical, legacy, or intended for future ingestion.

Required decision:

Choose one architecture:

1. Persist a canonical route entity for every planned trip and reference it from history/traffic/alerts; or
2. Make trip-history snapshots canonical and redesign traffic/alerts around stable route signatures rather than `Map_route` IDs.

Do not continue adding features to both models independently.

Done when:

- One documented route identity is used from ORS response through history, fares, traffic, alerts, and deletion.
- Obsolete fields/routes/models are migrated and removed.
- Historical records remain readable after route/provider schema changes.

## P1-2: Correct scheduled-trip and completion semantics

Affected files:

- `components/map/RouteFinderForm.tsx`
- `lib/trip-input.ts`
- `lib/trip-history.ts`
- `models/TripHistory.ts`

Problems:

- The browser submits a `datetime-local` string without an offset. The server parses it in the server's timezone, which can shift Dhaka user times when deployed on a UTC host.
- Planning a route immediately writes `completedAt: new Date()`. A planned or scheduled route is not a completed journey.
- There is no trip status such as `planned`, `scheduled`, `started`, `completed`, or `cancelled`.
- Every route search creates a new history record, including repeated/cache-hit requests.

Required fix:

- Convert the browser value to an explicit ISO instant before sending, or send timezone/offset data and normalize server-side.
- Replace automatic `completedAt` with a lifecycle status and set completion only from a deliberate completion action.
- Define idempotency/deduplication behavior for repeated route searches.
- Decide how scheduled trips become past/completed/cancelled and how upcoming counts are maintained.

Done when:

- The same selected Dhaka time is stored/displayed correctly on UTC and Dhaka servers.
- Newly planned trips are not marked completed.
- Lifecycle transitions are server-validated and tested.

## P1-3: Finish fare integration instead of maintaining two calculators

Current gaps:

- `lib/fares.ts` implements a 90%–130% estimate band and vehicle `speedFactor`, but `/api/fares` implements a separate ±10% formula and does not use `lib/fares.ts`.
- The UI stores fare selection only in local component state.
- `TripHistory.selectedVehicle` is modeled but never written.
- Fare calculations trust route metrics passed through URL query parameters rather than the saved trip record.
- Profile travel priority is stored but not used to rank route or vehicle results.
- The “Fare compare” suggestion tile still says “Soon” even though a fare page now exists.

Required fix:

- Keep one fare calculation module and one response type.
- Version rate data and record the source/time of every estimate.
- Load route metrics from the authenticated history record.
- Add an owner-scoped action to save the selected vehicle/fare snapshot.
- Decide whether travel priority controls route sorting, fare sorting, or both, then implement it or remove the setting.
- Update product labels and documentation to match the implemented state.

Done when:

- API and UI use the same tested calculation rules.
- Selecting a vehicle updates only the authenticated user's trip history.
- Reloading the trip preserves the selected route and vehicle estimate.
- Historical estimates are not recalculated when rate tables change.

## P1-4: Add consistent request validation and sanitized error handling

Current gaps:

- Most legacy handlers use ad hoc truthiness checks instead of typed schemas.
- Invalid ObjectIds, negative values, overly long strings, malformed URLs, and extra fields are inconsistently handled.
- Several catch blocks return the raw `error` object.
- The empty-place smoke request returned HTTP 500 with Mongoose paths and validation details.
- Nominatim non-2xx handlers include raw upstream response text in the client message.
- API envelopes vary among `{ success, data }`, `{ error }`, Better Auth responses, and availability-only objects.

Required fix:

- Define reusable request/response schemas for every custom route.
- Reject unknown or excessive input where appropriate and cap request sizes/counts.
- Validate ObjectIds before database access.
- Validate camera URL scheme/allowed host policy before storing it.
- Log detailed errors server-side with a request/correlation ID; return stable codes and safe messages to clients.
- Standardize success/error envelopes for custom APIs while leaving Better Auth contracts intact.

Done when:

- Invalid client input consistently returns `400`, not `500`.
- No custom API response contains stack traces, Mongoose internals, provider bodies, keys, or database metadata.
- Contract tests cover malformed JSON and field boundaries for every route.

## P1-5: Make account/profile operations failure-safe

Affected files:

- `app/api/profile/route.ts`
- `app/(main)/profile/profile-form.tsx`
- `lib/auth.ts`

Problems:

- Profile JSON parsing and Better Auth email-change errors are not caught locally.
- Email validation only checks for `@`, while signup uses a stronger shared validator.
- Display names have no maximum length.
- Name is updated directly in the Better Auth collection, while email changes use the Better Auth API.
- Account deletion performs multiple domain/auth deletions in separate phases without a transaction or durable deletion job. Partial failure can leave an inconsistent account.
- Account deletion bypasses the enabled Better Auth `deleteUser` flow and any current/future hooks it owns.
- Client save/delete requests have no network-error `try/catch`, so loading state can remain stuck.

Required fix:

- Use shared input schemas and Better Auth-supported user operations where available.
- Define transactional or retryable deletion semantics. If MongoDB transactions are unavailable, use a deletion state/job with idempotent steps.
- Audit all user-related collections and external data before claiming complete deletion.
- Add client network-error handling and always clear pending state in `finally`.

Done when:

- Duplicate/invalid email and network/provider failures produce controlled errors.
- Retrying account deletion after any interrupted step completes safely.
- An automated deletion test proves no user-owned/auth records remain.

## P1-6: Replace process-local protection where production scale requires it

Affected files:

- `app/api/trip-input/routes/route.ts`
- `lib/rate-limit.ts`
- `app/api/trip-input/autocomplete/route.ts`

Problems:

- Rate counters and route cache reset on restart and are not shared across instances.
- Route cache hits bypass the route rate counter but still create a new trip-history record, allowing repeated cached requests to amplify database writes.
- Limits are mostly IP-based, which is weak for authenticated abuse and unfair for users behind shared NAT.
- Client IP headers are trusted without documenting the trusted-proxy boundary.
- Reverse geocoding and fares have no rate limits.

Required fix:

- Use a shared rate-limit/cache store in multi-instance/serverless production.
- Rate-limit authenticated work by both user and IP.
- Ensure cache hits are also bounded and history creation is idempotent or independently limited.
- Define trusted proxy handling for client IP extraction.
- Apply protection to every public provider proxy.

## P1-7: Add automated tests and a real CI release gate

Current state:

- No unit, integration, API, or browser tests were found.
- `package.json` has no `test` or `typecheck` script.
- No `.github` CI workflow or other CI configuration was found.
- Production build passes, but lint currently fails.

Minimum test order:

1. Unit tests: password rules, trip validation, fare formulas, schedule/timezone normalization, route de-duplication, rate limiter.
2. API integration tests: auth/ownership matrix, malformed input, provider failures, profile update/deletion, fare selection, route-history persistence.
3. Browser tests: signup/signin/reset, anonymous trip handoff, route planning, route selection, fare error/success, profile editing/deletion.
4. Contract tests for ORS, Nominatim, Resend, and Pathao adapters using mocked providers.

Required CI gate:

```text
install with frozen lockfile
lint
typecheck
unit/integration tests
production build
production dependency audit policy
```

## P1-8: Fix environment and database configuration drift

Problems:

- `.gitignore` ignores `.env*`, so the local `.env.example` is untracked and will not reach a fresh clone.
- `.env.example` and `README.md` omit `PATHAO_FARE_API`, even though the fare API requires it.
- They also omit referenced optional settings such as `MONGODB_DB`, `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`, and `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Mongoose explicitly selects `MONGODB_DB`, but Better Auth calls `authMongoClient.db()` without that value. If the MongoDB URI does not contain the intended database, auth and domain data can land in different databases.
- No Node/pnpm engine version is pinned.

Required fix:

- Add `!.env.example`, commit a secret-free complete template, and document required versus optional variables.
- Use one explicit database-name configuration for Better Auth, Mongoose, and seed scripts.
- Validate configuration at startup with safe errors.
- Pin supported Node and pnpm versions.

# P2 — product, accessibility, and scale gaps

## P2-1: Complete or remove partial features

| Feature | Current state | Needed decision/work |
| --- | --- | --- |
| Saved places | Model and unsafe APIs exist; no user UI | Secure APIs, add CRUD UI and indexes, or remove until planned. |
| Alerts | Model exists; no creation/read/UI flow | Define alert source, ownership, delivery/read UI, retention, or remove. |
| Traffic | APIs/models reference legacy routes; no trusted ingestion or planner integration | Define data source and canonical route mapping before UI work. |
| Cameras | Public registration/lookup; no trusted source or user UI | Define admin ingestion, URL policy, privacy/security, and map integration. |
| Fare selection | Estimates render; selection is client-only | Persist owner-scoped selection and clearly separate estimate from booking. |
| Trip history | Last three items are display-only | Add detail, reuse/replan, pagination, delete/export, and scheduled-trip actions. |
| Travel priority | Stored in profile only | Use it in documented ranking logic or remove it. |

## P2-2: Fix autocomplete and form accessibility

Affected components:

- `components/map/PlaceAutocomplete.tsx`
- `components/map/RouteFinderForm.tsx`
- `components/FareResults.tsx`

Gaps:

- Place inputs rely on placeholders rather than visible labels.
- Autocomplete lacks combobox/listbox roles, `aria-expanded`, active option state, arrow-key navigation, Enter selection, and Escape handling.
- Old autocomplete responses can overwrite newer queries because requests are not cancelled or sequence-checked.
- There is no “no suggestions” state.
- Fare options are clickable `<div>` elements, so keyboard users cannot select them and assistive technology receives no selected state.
- Loading/saved/error status changes are not consistently exposed through live regions.
- The profile delete overlay does not implement dialog semantics, focus management, Escape close, or focus return.
- Schedule mode controls do not expose pressed/selected state, and the datetime input has no associated label.

Done when:

- Keyboard-only and screen-reader flows work for location selection, route choice, fare choice, profile editing, and deletion.
- Automated accessibility checks and a manual keyboard pass are part of CI/release QA.

## P2-3: Add resilient page-level UX

No route-level `loading.tsx`, `error.tsx`, or custom `not-found.tsx` files were found.

Add:

- Page/error boundaries for database/provider failures.
- Skeleton/loading states for session-aware home/profile/fare views.
- Retry actions for fare and geocoding failures.
- Empty and partial-provider states.
- A clear route back from fare results to the selected trip.
- Network error handling for signout and profile actions.

## P2-4: Revisit geocoding and map-provider production usage

Gaps:

- Autocomplete uses a hard `bounded=1` Dhaka box. This can exclude relevant nearby or weakly indexed results; representative query testing is still needed.
- Reverse geocoding is an unrate-limited public proxy and does not enforce the service area itself.
- Nominatim and Resend calls have no explicit timeout.
- The default Nominatim user agent has no operator contact information.
- Direct public OpenStreetMap tiles may not be suitable for production traffic; provider policy/capacity needs an explicit decision.
- Tile attribution is static even though the component switches between Mapbox and OpenStreetMap.

Required work:

- Test English/Bangla spellings and boundary locations before changing geographic bias.
- Add provider adapters with timeout, cache, rate limiting, and safe error handling.
- Choose a production tile/geocoder plan consistent with provider usage policies and expected traffic.

## P2-5: Add indexes and schema constraints around real query patterns

Candidate indexes after the canonical data model is chosen:

- `TripHistory`: `{ userId: 1, createdAt: -1 }` and `{ userId: 1, departureMode: 1, scheduledAt: 1 }`.
- `TrafficData`: `{ routeId: 1, recordedAt: -1 }`.
- `Map_route`: user/endpoint lookup pattern, if retained.
- `Place`: `{ userId: 1 }`, optionally unique user/label rules.
- `Camera`: normalized location or geospatial index, depending on final lookup design.

Also replace `Schema.Types.Mixed` for trip endpoints/route legs where practical, validate coordinate ranges, and define data retention for traffic/history/verification records.

## P2-6: Add observability and operational readiness

Missing or incomplete:

- Structured logging and request IDs.
- Error monitoring and provider latency/failure metrics.
- Rate-limit/cache metrics.
- Health versus readiness semantics.
- Database backup/restore and index deployment procedure.
- Provider quota/credential rotation runbook.
- Alerting for auth email, ORS, Nominatim, Pathao, and MongoDB failures.
- Deployment configuration and rollback procedure.
- Security headers/CSP and an explicit geolocation permissions policy.

# P3 — maintainability and cleanup

## P3-1: Restore lint and remove duplicate DNS overrides

Current lint result:

- Errors: forbidden CommonJS `require()` in `app/(main)/page.tsx`, `app/api/camera/route.ts`, `app/api/places/route.ts`, and `app/api/places/[userId]/route.ts`.
- Warnings: unused default `mongoose` imports in `Camera`, `Map_route`, `Place`, and `TrafficData` models.

The repository already has a development-only DNS workaround in `instrumentation.ts`. Route-local `setServers()` calls are duplicated, run at module load, and can affect production/process-wide DNS behavior. Keep one documented environment-appropriate solution and remove the rest.

## P3-2: Remove drift and misleading names/comments

- Fare files use a different formatting style from the rest of the repository.
- `getPathaоEstimate` contains a Cyrillic-looking character in the identifier, making search/review error-prone.
- Comments in `app/api/map_routes` describe `/api/routes`, not the actual `/api/map_routes` URL.
- `POST /api/traffic/batch` is a batch read, not a batch write; name/method/documentation should reflect that.
- The route-bounds comment says every route point is included, but the handler uses only origin, stops, and destination—not the stored polyline geometry.
- `/dashboard` only redirects to `/` and adds no product value.
- `SuggestionTiles` still labels fare comparison “Soon.”
- The older untracked `REPOSITORY_STRUCTURE_AND_HANDOFF.md` predates the merged fare files and contains endpoint-contract drift; refresh it after fixes or clearly archive it as a snapshot.

## P3-3: Clean dependency and asset placement

- Move `@types/leaflet` to `devDependencies`.
- Move/remove `shadcn` from runtime dependencies if it is not imported by runtime code.
- Confirm whether all starter SVG files in `public/` are unused, then remove them.
- Add a formatting command/config so merged files do not introduce inconsistent style.
- Consider disabling `allowJs` if JavaScript source is not intentionally supported.

## Recommended implementation sequence

### Phase 1: Secure the release boundary

1. Upgrade vulnerable dependencies and regenerate the lockfile.
2. Add shared authentication/authorization helpers and protect legacy APIs.
3. Add strict schemas and sanitized errors to all custom API routes.
4. Remove/restrict the Mongo diagnostic endpoint.
5. Harden the fare/provider proxy and all other public provider proxies.
6. Restore lint to green.

### Phase 2: Establish a testable architecture

1. Choose the canonical route identity/data model.
2. Fix trip lifecycle and timezone handling.
3. Consolidate fare calculation and persist selected vehicle snapshots.
4. Align Better Auth and Mongoose database selection.
5. Add indexes/migrations only after the data-model decision.
6. Add unit and API integration suites plus CI.

### Phase 3: Complete the product

1. Make trip history reusable and actionable.
2. Either implement or remove saved places, alerts, traffic, and cameras.
3. Apply travel priority or remove it.
4. Complete fare error/partial/selection UX.
5. Fix accessibility and add page-level error/loading boundaries.

### Phase 4: Production operations

1. Move limits/cache to shared infrastructure where required.
2. Add structured observability and provider dashboards/alerts.
3. Define production map/geocoder providers and usage-policy compliance.
4. Document deployment, rollback, backups, secrets, quotas, and incident response.

## Minimum release acceptance checklist

- [ ] No anonymous or cross-user access to user-owned records.
- [ ] Traffic/camera writes require a documented privileged identity.
- [ ] No raw database/provider errors are returned to clients.
- [ ] Fare and geocoding proxies have validation, timeouts, rate limits, and safe failure behavior.
- [ ] `pnpm audit --prod` has no high-severity findings.
- [ ] Lint, typecheck, tests, and production build pass in CI.
- [ ] Authenticated owner/non-owner/anonymous API matrix is covered by tests.
- [ ] Scheduled times are timezone-correct and planned trips are not marked completed.
- [ ] One canonical route identity connects history, fares, traffic, and alerts.
- [ ] Fare selection persists as an immutable snapshot on the correct trip.
- [ ] `.env.example` is committed, complete, and contains no secrets.
- [ ] Better Auth, Mongoose, and seeding use the same explicit database.
- [ ] Real Resend delivery and ORS/Pathao/Nominatim failure cases are verified in a staging environment.
- [ ] Deployment, backup/restore, provider quota, and rollback runbooks exist.

## Validation performed during this review

```text
./node_modules/.bin/eslint .
  FAIL: 4 errors, 4 warnings

./node_modules/.bin/next build
  PASS: compiled, TypeScript passed, 23 routes generated

pnpm audit --prod
  FAIL: 15 advisories (7 high, 8 moderate)

Safe local API probes
  PASS: MongoDB health, Better Auth anonymous session/guards,
        trip validation, autocomplete, reverse geocoding,
        missing-record responses, valid fare estimate
  FAIL: empty place write returned 500/raw Mongoose validation data
  FAIL: negative fare page parameters were accepted with HTTP 200
```

The review did not create valid legacy records, delete accounts, send live email, perform an authenticated ORS route request, or run load testing. Those require a disposable/staging data plan and test identities rather than the current non-destructive review boundary.
