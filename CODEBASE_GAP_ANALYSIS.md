# NoboJatra — Current Repository Review and Gap Analysis

> Checkout-time review of `main` at commit `1dec6f2` on 2026-08-14. Scope: all 104 tracked files, every page and route handler, `components/`, `lib/`, `models/`, scripts, configuration, recent merges, dependency state, anonymous smoke tests, authenticated disposable-account integration tests, live provider checks, database metadata inspection, and bounded local concurrency checks.

This document answers four questions for the current checkout:

1. What is implemented and working by design?
2. What is only partially implemented or misleading?
3. What is unsafe, broken, or missing?
4. What exact fixes and acceptance criteria are required?

The existing working-tree documentation changes were preserved. This review updates only this untracked report; it does not modify application source.

> **Re-verified twice on 2026-08-14.** The first re-verification pass confirmed every statically checkable claim against the audited commit `1dec6f2`. A second pass then re-checked the tree at **`2f6f84a`** (PR #18, `traffic3`), which is the first remediation to land. **P0-2 is resolved and the deployment gate is green.** That change also surfaced a new and more serious traffic finding — the tile overlay has no data coverage in Dhaka at all. See [§15](#15-independent-re-verification-2026-08-14) for the full record, the corrections applied to this document, and the new findings P1-16 through P2-16.

---

## 1. Executive verdict

**The product has a coherent core journey, but this checkout is not deployable yet.** Route planning, trip ownership checks, weather-aware fares, saved places, and the signed-in dashboard are real implementations. As of `2f6f84a` the production build is no longer blocked. However, a live TomTom key is committed *and published to GitHub*, deployed client auth is hardcoded to localhost, known-high dependency advisories are present, account deletion is unreliable, and a legacy unauthenticated API surface exposes user-location CRUD.

### Verification baseline

Results below are as of **`2f6f84a`**. Where PR #18 changed an earlier result, the superseded value is shown struck through.

| Check | Current result | Meaning |
|---|---|---|
| `npm run build` | ~~Failed~~ → **Passes** | Fixed by PR #18; deployment gate is green |
| `tsc --noEmit` | ~~Failed~~ → **Passes** | Exit code 0, no diagnostics |
| `eslint .` | **Failed: 7 errors, 5 warnings** | Was 7 errors / 7 warnings; PR #18 cleared two `RouteMap` warnings. Remaining: React effect errors, `any`, inline `require`, unused imports |
| Automated tests | **None found** | No unit, integration, E2E, or API contract tests |
| CI | **Secret scanning only** | `.github/workflows/secret-scan.yml` added for P0-1 (uncommitted). No lint, typecheck, test, build, or audit gate yet — see P3-2 |
| `pnpm audit --prod` | **19 advisories** | 8 high, 10 moderate, 1 low |
| Anonymous smoke tests | **Partial pass** | Core protected APIs returned 401; short autocomplete returned 200. ~~traffic `GET` returned 500; tile proxy returned 404~~ → both resolved; tile proxy now returns 200 with a valid PNG |
| Traffic tile data coverage | **Empty in the service area** | The proxy works, but TomTom returns a fully transparent tile for every Dhaka coordinate — see P1-16 |
| Authenticated API integration | **Core journey passed; defects confirmed** | Disposable signup/session, profile preferences, routing, route ownership, fares, Best Options, traffic, weather, saved places, legacy CRUD, and deletion were exercised |
| Live providers | **ORS, Pathao, OpenWeather, TomTom, Nominatim passed** | One bounded request path per provider succeeded with the configured local credentials |
| Browser E2E | **Blocked** | No in-app or external browser was connected to this workspace |

### Immediate deployment blockers

1. Revoke the committed TomTom credential and remove it from source/history. **Now urgent — the key is published on GitHub (see P0-1).**
2. ~~Move the traffic tile handler to the route the map actually calls; restore build and type-check.~~ **Done in PR #18 (`2f6f84a`).**
3. Remove the hardcoded `http://localhost:3000` Better Auth client URL.
4. Delete or authenticate the orphaned location/traffic/camera APIs and remove the public DB diagnostic.
5. Replace the broken direct-auth-collection account-deletion path with one Better Auth-owned cascade.
6. Upgrade vulnerable dependencies and re-run the production audit.
7. **New:** rate-limit or authenticate the new public tile proxy before deploying it — it is an open, uncapped path to a paid provider (P1-17).

---

## 2. What happens next and where

The live product flow is:

```text
Anonymous visitor opens /
  -> app/(main)/page.tsx selects AnonymousHome
  -> PlaceAutocomplete calls public Nominatim proxy
  -> submitted trip is stored in sessionStorage
  -> visitor is sent to /signup
  -> Better Auth creates a session
  -> MapDashboardSection replays the pending trip
  -> POST /api/trip-input/validate
  -> POST /api/trip-input/routes
  -> server validates again, calls OpenRouteService, stores TripHistory
  -> dashboard draws route options and requests TomTom traffic
  -> selected route is PATCHed into TripHistory
  -> /fares loads the owned TripHistory record
  -> server reads VehicleRate, fetches midpoint weather and Pathao estimates
  -> /best-options optionally fetches traffic/weather again and ranks vehicles
```

This separation is broadly sound: provider keys are intended to remain server-side, route/fare lookups use trusted persisted trip IDs, and ownership is checked before returning trip geometry. The gaps are in deployment wiring, external-service resilience, duplicated business rules, legacy routes, and incomplete persistence/lifecycle semantics.

---

## 3. Feature-by-feature status

| Module / feature | Status | What is implemented properly | Remaining caveat |
|---|---|---|---|
| App shell and navigation | **Implemented** | Separate auth/main layouts, signed-in navbar, responsive page shells | `/fares` and `/best-options` do not enforce auth at the server-page boundary |
| Signup/signin | **Partial** | Better Auth email/password, generic signin error, shared password UI | Client points at localhost in production; signup exposes duplicate-email detail |
| Password reset | **Implemented with caveat** | Resend integration, escaped HTML, 1-hour token, session revocation | No timeout on Resend; password digit rule is not applied to change-password |
| Email verification | **Partial** | Verification sender and profile status exist | Signup neither sends verification by default nor requires verified email |
| Anonymous trip handoff | **Implemented** | Validated `sessionStorage` payload; no location payload in URL | Replay effect has lifecycle/stale-dependency debt |
| Place autocomplete | **Partial** | Debounced search, short-query no-op, service-area viewbox, IP/global counters | Nominatim policy is not truly enforced; no timeout/cache/keyboard combobox behavior |
| Current location | **Partial** | Browser permission path, client service-area check, reverse geocode fallback | Public reverse-geocode proxy is unlimited and accepts global coordinates |
| Trip validation | **Implemented** | Server-side coordinate, area, stop, passenger, minimum-distance, schedule-window checks | Browser-local datetime is sent without an offset; sparse stop-error arrays |
| Route planning | **Implemented with caveats** | Auth, server validation, ORS timeout, friendly upstream errors, dedupe, ownership-backed history | Multi-stop geometry boundaries are fabricated; no-features response is treated as success |
| Route alternatives | **Implemented for direct trips** | Up to three direct alternatives, selectable and persisted | ORS alternatives are disabled for trips with stops; UI couples alternatives to leg count |
| Live traffic summary | **Partial** | Authenticated POST, TomTom timeouts, congestion bands, stale-response guard | Unbounded raw points, no rate limit, sequential paid calls, route mismatch, broken tile proxy |
| Traffic map overlay | **Implemented, but has no data** | Server-side tile proxy now works correctly and the client key is gone (`2f6f84a`) | TomTom publishes no traffic-tile coverage for Dhaka, so the layer is always empty (P1-16); the proxy is also public and uncapped (P1-17) |
| Traffic route colouring | **Implemented** | `POST /api/traffic/live` returns genuine live Dhaka congestion; route segments are coloured from it | Unrelated to the tile layer above and unaffected by its coverage gap; P1-4/P1-5 caveats still apply |
| Trip history | **Partial** | Per-user records, route snapshots, recent/upcoming summaries | Every search is a completed trip; unbounded full polylines; selected vehicle never saved |
| Fare estimation | **Partial** | Owned trip lookup, server rate table, capacity filtering, map replay, one shared provider service with isolated failures (P1-2) | `lib/fares.ts` is still a third dead implementation and `speedFactor` is still ignored (P1-10) |
| Weather-aware restrictions | **Implemented with caveats** | Server-only key, timeout, normalized units, process cache, graceful fallback | Current midpoint weather is used even for scheduled trips; policy is untested |
| Best Options | **Partial** | Owned trip lookup, weather/traffic degradation, deterministic top-three ranking | It ranks vehicles, not routes; ignores saved priority; “AI” label overstates the implementation |
| Profile defaults | **Partial** | Passenger default is used; values validated and persisted; name updates now go through Better Auth and PATCH validates before writing (P1-1 resolved) | Travel priority is persisted but still unused by scoring (P1-7) |
| Saved places | **Partial** | Profile-owned allowlisted embedded values; planner shortcuts work | Editing can silently retain an old place; server accepts out-of-area coordinates/duplicate labels |
| Frequent trips / Plan Again | **Partial** | 30-day grouping and replay cards exist | Repeated replays can fail to refill; grouping drops stops and schedule details |
| Account deletion | **Broken** | App collections are enumerated for cleanup | Two competing paths; raw auth deletes do not coerce Better Auth ObjectIds |
| Legacy map/place/camera APIs | **Unsafe / unused** | Mongoose schemas and basic CRUD exist | No caller, no auth, no ownership, raw errors returned |
| Tests and delivery | **Missing** | Strict TypeScript and ESLint are configured | Both currently fail; no tests or CI |

---

## 4. What is implemented well

These parts are worth preserving while remediating the repository:

- **Trip authorization is server-enforced on the core path.** `/api/trip-input/routes`, `/api/trip-input/history/[tripHistoryId]`, `/api/fares`, and `/api/best-options` all require a Better Auth session. Fare and best-option lookups scope `TripHistory` by both `_id` and `session.user.id`, preventing cross-user trip reads ([fares route](app/api/fares/route.ts#L252), [best-options route](app/api/best-options/route.ts#L261)).
- **Trip input is normalized and revalidated server-side.** Coordinates, service-area bounds, passenger count, stops, minimum distance, and schedule window live in one module rather than only in the form ([trip-input](lib/trip-input.ts#L167)).
- **OpenRouteService is kept server-side and has a bounded request.** The client never receives `ORS_API_KEY`; failures are translated to user-safe messages and the call has a 12-second timeout ([route-service](lib/route-service.ts#L311)).
- **Route ownership is persisted by snapshot.** `TripHistory` stores the coordinates and metrics used at the time, so later route-provider changes do not silently rewrite an old selection ([TripHistory model](models/TripHistory.ts#L21)).
- **Weather is a non-blocking enhancement.** The fare route still returns estimates when the weather key or provider is unavailable. Weather normalization, unit conversion, timeout, cache versioning, and cache validation are unusually careful for this codebase ([weather service](lib/weather.ts#L283), [fare fallback](app/api/fares/route.ts#L228)).
- **The client protects against stale traffic responses.** `trafficRequestRef` prevents a slower response for a previously selected route from overwriting the current route's traffic state ([MapDashboardSection](components/map/MapDashboardSection.tsx#L148)).
- **Saved places use an allowlisted profile contract.** The API strips unexpected fields and stores locations by value, which keeps the planner independent of another lookup ([profile route](app/api/profile/route.ts#L38)).
- **Anonymous-to-authenticated handoff avoids query-string leakage.** `sessionStorage` keeps the typed trip out of URLs and server access logs, and the stored value is shape-checked before replay ([pending-trip](lib/pending-trip.ts#L43)).
- **Client auth forms have useful baseline UX.** Password requirements, confirmation state, caps-lock feedback, generic signin failures, and disabled submit states are present.

---

## 5. P0 findings — fix before deployment

### P0-1. A live TomTom API key is committed — PARTIALLY REMEDIATED

> **Status:** source literal removed and secret scanning added (working tree, uncommitted). **Two items remain and neither can be done from the codebase:** the key has not yet been rotated in the TomTom console, and Git history has not been rewritten. Until both are done this finding stays open — see "Remaining work" below.

**Original finding.** `scripts/test-tomtom.js:3` contained a plaintext provider credential. The file is tracked, and was added in commit `2f57aca`, so deleting the current line does not remove the secret from Git history.

**The credential has left this machine.** `git log -S` locates the literal in exactly one commit, `2f57aca`, and `git branch -r --contains 2f57aca` places that commit on `origin/main`, `origin/saved-places`, and `origin/traffic2` at `https://github.com/Sakif16/nobojatra.git`. The key is therefore published to a third-party host and present in at least three remote refs. Repository visibility could not be checked from this workspace (`gh` is not installed), but "pushed to GitHub" already clears the bar for treating the key as compromised rather than merely at risk.

**Impact:** anyone with read access to the GitHub repository — and everyone who has ever cloned or forked it — can consume quota or incur cost. Rotation is time-sensitive in a way no other P0 here is: every other finding costs the same to fix next week, this one does not.

**Required fix:** revoke/rotate the key in the TomTom console **first** — before any Git work, since rewriting history does not un-publish a key that has already been fetched. Then move all scripts to `process.env.TOMTOM_API_KEY`, remove the literal, and treat history rewriting as scoped to all three affected remote refs rather than `main` alone (this needs coordination with anyone holding a clone). Add automated secret scanning so the next one is caught pre-merge.

#### Completed

- **The literal is gone from the source.** `scripts/test-tomtom.js` now reads `process.env.TOMTOM_API_KEY` and exits `1` with an actionable message naming both invocation forms when the variable is absent. Verified: `env -u TOMTOM_API_KEY node scripts/test-tomtom.js` prints the message and exits 1.
- **A `test:tomtom` script was added** to `package.json`, matching the existing `seed:rates` convention (`node --env-file=.env …`) so the key is supplied the same way everywhere.
- **A repository-wide scan confirms this was the only committed secret.** `git grep` for secret-shaped literals across all tracked files returns exactly one historical hit — the line just removed.
- **Automated secret scanning added** at `.github/workflows/secret-scan.yml`, running gitleaks on pull requests and pushes to `main`. It scans only the commits a push or PR introduces, not full history — deliberately, because the leak in `2f57aca` is present in every ref until history is rewritten, so a full-history scan would fail on every run and be muted within a week. Verified against the real repository with gitleaks 8.28.0: the range containing `2f57aca` exits 1 (leak detected), the range `1dec6f2..2f6f84a` exits 0 (green today), and the current working tree contains no secret in any tracked file.

#### Remaining work — cannot be done from the codebase

1. **Rotate the key in the TomTom console.** Not yet done: the value in the local `.env` is still byte-identical to the published literal. Nothing in the repository can accomplish this, and until it happens the published key remains live.
2. **Rewrite Git history across all three remote refs.** Deliberately not attempted here. This rewrites published history on `origin/main`, `origin/saved-places`, and `origin/traffic2`, requires a force-push, and breaks every existing clone — it needs an explicit decision and coordination with the other contributor, not an autonomous action. Note that it is also the *lower*-value of the two remaining items: once the key is rotated, the literal in history is inert. Rewriting is hygiene; rotation is the actual fix.

**Acceptance:** ~~the script exits with a clear message when the environment variable is absent~~ **met**. Still outstanding: the old key returns an auth error from TomTom; no tracked revision on any remote ref contains an active key.

### P0-2. ~~The traffic tile implementation blocks the production build~~ — RESOLVED in `2f6f84a`

**Original finding.** [`app/api/traffic/live/route.ts:33`](app/api/traffic/live/route.ts#L33) declared a `GET` handler with `z/x/y` params even though `/api/traffic/live` has no dynamic path segments. Next correctly rejected the handler type, `npm run build` failed during TypeScript validation, `GET /api/traffic/live` returned 500, and `RouteMap.tsx` requested `/api/tiles/tomtom/{z}/{x}/{y}.png`, which returned 404.

**Resolution.** PR #18 (`traffic3`, merged as `2f6f84a`) implemented both recommended steps and did so cleanly. Verified against the merged tree:

- The invalid `GET` is deleted from `/api/traffic/live`; the authenticated `POST` is untouched.
- `app/api/tiles/tomtom/[z]/[x]/[y]/route.ts` exists and uses Next 16's `params: Promise<…>` signature.
- `npx tsc --noEmit` exits 0. The deployment gate is green.
- `NEXT_PUBLIC_TOMTOM_API_KEY` has been removed from the codebase entirely — zero references remain, so the browser no longer receives a provider key. This closes the client-key exposure noted in §11.
- Errors are sanitized: upstream bodies are logged server-side (truncated to 300 chars) and never returned. Non-numeric and negative coordinates return 400. There is an 8-second `AbortSignal.timeout` and a 60-second `Cache-Control` with `stale-while-revalidate`.

Live confirmation through the running proxy: `GET /api/tiles/tomtom/12/3076/1769` returns **200, `image/png`, a valid 512×512 RGBA tile**. `…/a/b/c` and `…/-1/0/0` both return 400 with a stable JSON contract.

**Acceptance: met, with two exceptions carried forward as new findings.** The stated criterion "invalid tile coordinates return 400" is only partly satisfied — *range* validation was not implemented, only a numeric-format check (see P2-15). And the feature this unblocks does not actually function in the product's service area (see P1-16), which is a data-coverage problem rather than a defect in this PR.

**Incidental fixes in the same PR, credited here:**

- The `Polyline` pairs were keyed on the children inside a keyless `<>` fragment — React discards those keys. Both loops now use `<Fragment key={…}>`, which is the correct fix, not a cosmetic one.
- The unused `idx` binding is gone, clearing a lint warning.
- The unreachable "implement a server tile proxy" fallback message noted in P3-11 is removed. The other half of P3-11 — attribution hardcoding Mapbox regardless of the active tile provider — **still stands** at [`RouteMap.tsx:173`](components/map/RouteMap.tsx#L173).

### P0-3. Client authentication is hardcoded to localhost

[`lib/auth-client.ts:4`](lib/auth-client.ts#L4) sets `baseURL: "http://localhost:3000"`. Every browser-side signin, signup, signout, reset-password, and request-reset call uses that host.

**Impact:** auth is broken on any non-local deployment and may send a production user's request to a local service if one is running.

**Required fix:** omit `baseURL` so Better Auth uses same-origin, or inject a validated public deployment URL only when genuinely required.

**Acceptance:** production/staging browser network requests target the current origin; localhost is absent from the client bundle.

### P0-4. Thirteen unused handlers expose unauthenticated data and writes

No application code calls the following legacy surface:

- `/api/map_routes` — GET and POST
- `/api/map_routes/[routeId]` — GET
- `/api/map_routes/[routeId]/bounds` — GET
- `/api/places` — POST
- `/api/places/[userId]` — GET
- `/api/camera` — GET and POST
- `/api/traffic` — POST
- `/api/traffic/batch` — POST
- `/api/traffic/[routeId]` — GET
- `/api/traffic/[routeId]/peak-hours` — GET
- `/api/test-mongo` — GET

They have no session or ownership check. Callers can write records under arbitrary user/route IDs, read saved coordinates when IDs are known, register arbitrary stream URLs, and query DB health/name. Several return raw Mongoose errors ([places](app/api/places/route.ts#L6), [map routes](app/api/map_routes/route.ts#L8), [camera](app/api/camera/route.ts#L7), [test-mongo](app/api/test-mongo/route.ts#L6)).

This was confirmed dynamically: anonymous requests created and read a disposable place, route, traffic sample, and camera; read route bounds and peak-hour data; and received the Mongo database name from `/api/test-mongo`. All created records were removed after verification.

**Required fix:** delete these handlers and their dead models if the feature spike is abandoned. If retained, use the core pattern: session first, server-derived user ID, ObjectId validation, ownership query, input schema, safe error contract, and rate limit.

**Acceptance:** anonymous requests cannot read/write any user, route, traffic, or camera data; public production routes contain no DB diagnostic.

### P0-5. Account deletion can report success while leaving auth data behind

There are two deletion systems:

1. Better Auth's `/api/auth/delete-user`, enabled at [`lib/auth.ts:158`](lib/auth.ts#L158), deletes auth data but has no hook to delete Mongoose application data.
2. `DELETE /api/profile` manually deletes app and raw auth collections ([profile route](app/api/profile/route.ts#L261)).

The installed Better Auth Mongo adapter stores IDs and referenced user IDs as Mongo `ObjectId`s while returning string IDs to the session. Raw driver queries such as `{ _id: session.user.id }` and `{ userId: session.user.id }` do not perform adapter coercion. Therefore the custom auth-collection deletes can match zero records, yet the endpoint always returns `success: true`. The built-in path has the opposite orphaning problem for `TripHistory`, `UserProfile`, and legacy collections.

The disposable-account test confirmed the exact failure mode. `DELETE /api/profile` returned 200 and correctly reported deletion of the test profile, two TripHistory records, one legacy route, one place, and its traffic record. However, the same session remained valid and signin with the same email/password still returned 200. Direct metadata inspection found the Better Auth user, account, and session documents still present as `ObjectId` references. They were removed afterward by exact disposable IDs.

**Required fix:** make Better Auth the single deletion owner. Put an idempotent application-data cascade in a `beforeDelete` hook, disable/remove the custom raw-auth deletion logic, require a fresh session or password confirmation, and fail closed if cleanup fails.

**Acceptance:** either supported delete entry point removes user, account, session, verification, profile, and trip data; repeat deletion is safe; integration test proves no orphan remains.

### P0-6. Production dependencies contain known high-severity advisories

`pnpm audit --prod` found 19 advisories: 8 high, 10 moderate, 1 low. The high findings include Next.js 16.2.9 advisories, `sharp`/libvips issues, PostCSS file disclosure, and `nanoid`; Hono findings arrive through `shadcn`, which is incorrectly installed as a runtime dependency. Some advisory conditions are not exercised by this app today, but the vulnerable packages are still shipped.

**Required fix:** upgrade Next.js and `eslint-config-next` to at least the patched line reported by the audit, refresh the lockfile so patched `sharp`, PostCSS, and `nanoid` resolve, move `shadcn` to `devDependencies`, then re-audit and rebuild. Review changelogs before accepting a broad lockfile update.

**Acceptance:** production audit has no high findings; build, lint, typecheck, and route smoke tests pass after upgrade.

---

## 6. P1 findings — correctness, privacy, cost, and abuse

### P1-1. ~~Profile name updates target the wrong ID type and PATCH can partially commit~~ — RESOLVED (working tree)

**Original finding.** `app/api/profile/route.ts:147` performed a raw update with a string `_id`; the Better Auth adapter stores an `ObjectId`. `matchedCount` was ignored, so the API reported “Profile saved” after a no-op. The route then changed email and profile defaults in separate operations, so a Resend/email failure could land after the name write but before the profile write. Malformed JSON was unguarded.

**Root cause confirmed directly against the database.** Querying the live `user` collection showed `_id` is stored as an `ObjectId`, and that the exact query the route was issuing matches nothing:

```
_id constructor:            ObjectId
query {_id: "<string>"}     matches: 0
query {_id: ObjectId}       matches: 1
```

The name update was not merely unreliable — it could never succeed.

**Fix applied.** The `PATCH` handler is now split into two explicit phases:

1. **Validate everything before writing anything.** Previously the name write executed before passenger count, travel priority, and saved places were validated, so a late 400 could leave an earlier field already committed. All validation now runs first and nothing touches the database until every field passes.
2. **Write in a deliberate order**, cheapest and most reliable first: name (Better Auth) → profile (Mongoose) → email change. The email change is last because it is the only step that calls an external mail provider, so a Resend outage can no longer block or partially roll back the local saves.

Other changes:

- Name changes go through `auth.api.updateUser`, so the adapter coerces the ID. No route writes the Better Auth `user` collection directly any more.
- `req.json()` is wrapped in `try/catch` in **both** `PATCH` and `DELETE` — the same unguarded parse existed in the delete handler one function away. Non-object bodies are rejected too.
- The response now carries a `data.committed` object (`{ name, profile, emailChangeRequested }`) reporting exactly what persisted. A failed email change returns 502 with a message that names what *did* save, rather than a blanket failure or a false green.
- A name identical to the current one is skipped rather than rewritten.

**Verified end-to-end** against a running server with a disposable account, since the original defect was invisible to static reading (the endpoint returned 200 either way):

| Test | Before | After |
|---|---|---|
| Change display name, then `GET` | 200, **old name returned** | 200, **new name returned** |
| Malformed JSON body | Empty 500 | 400 `Request body must be valid JSON.` |
| Non-object JSON body (`"a string"`) | 500 | 400 `Request body must be a JSON object.` |
| Valid new name + invalid passenger count | 400, name write already issued | 400, **name and priority both unchanged** |
| Unchanged name resubmitted | Redundant write | `committed.name: false`, no write |
| `DELETE` with malformed JSON | 500 | 400, account untouched |
| `DELETE` with wrong confirmation | 400 | 400, account untouched |

The disposable user, session, account, and profile were deleted afterwards by exact `_id`; zero documents remain for that address.

**Not addressed here (separate findings):** `DELETE /api/profile` still deletes Better Auth collections with raw string-keyed queries and has the same ObjectId mismatch — that is [P0-5](#p0-5-account-deletion-can-report-success-while-leaving-auth-data-behind) and needs the Better Auth cascade hook, not a patch. Saved-place coordinate bounds remain unvalidated ([P1-11](#p1-11-saved-place-editing-can-silently-submit-the-previous-location)).

### P1-2. ~~Pathao can take down all fares and is duplicated inconsistently~~ — RESOLVED (working tree)

**Original finding.** `app/api/fares/route.ts:333` awaited Pathao sequentially in the rates loop. Missing `PATHAO_FARE_API`, network failure, non-2xx, invalid JSON, or missing fare threw out of the handler and prevented Uber/CNG results. There was no timeout and `response.ok` was not checked. `/api/best-options` copied the integration and skipped only the failed Pathao option, so the two pages disagreed.

**Both halves confirmed by measurement.** Running the code at `2f6f84a` with `PATHAO_FARE_API` pointed at a closed port, using a disposable account and a seeded trip:

| Endpoint | Before (HEAD) | After |
|---|---|---|
| `/api/fares` | **500**, empty body, **0 of 7 options** — Uber and CNG lost too | **200**, all 7 options |
| `/api/best-options` | 200, but **Pathao dropped entirely** (Uber Premier / Go / Moto) | 200, **Pathao Car back in the top 3** |

So the divergence was real and observable: with one provider down, one page showed nothing and the other silently showed a different option set.

**Fix applied.** All fare maths moved into one module, [`lib/fare-providers.ts`](lib/fare-providers.ts), which both endpoints now call through `estimateFaresForRates()`:

- **Validated.** `response.ok`, JSON parseability, and `estimatedFare` being a finite positive number are all checked. A quote in any currency other than BDT is rejected rather than rendered behind a `৳`. Every failure mode raises one `FareProviderError`.
- **Timed out.** `AbortSignal.timeout(6_000)`, matching the pattern already used in `lib/weather.ts`. Verified against a server that never responds: aborts at 6.0s instead of hanging.
- **Isolated with a documented fallback policy.** A provider failure never fails the request and never drops the option — that vehicle falls back to its seeded `VehicleRate` rate card and is returned with `fareSource: "rate_card"` plus a `fareSourceNote`. The policy is stated at the top of the module and in the README, and the fallback fare is byte-identical to the rate-card formula.
- **Concurrent under a bound.** Provider lookups run with at most 4 in flight. Measured against a 700ms stub: two Pathao rates complete in 707ms rather than ~1400ms sequentially, and nine provider rates hold at exactly 4 concurrent.
- **`fareSource` / `fareSourceNote`** are threaded through `ScorableOption` so ranked cards carry the same provenance the fares page does. Client types were widened to match.

`PATHAO_FARE_API` is now documented in `README.md` and `.env.example`, and is genuinely optional rather than "required in practice".

**Failure modes exercised directly** against the module, all returning a full option set and never throwing: env var unset, unreachable host, DNS/connection refused, 404, 500, 200-with-HTML, 200 without `estimatedFare`, negative fare, fare sent as a string, a USD quote, and a hanging upstream.

The disposable accounts, sessions, credential accounts, and trip documents created during verification were deleted afterwards; zero residual documents remain. (One orphaned `account` document dated 2026-07-23 predates this work and was left untouched — it is [P0-5](#p0-5-account-deletion-can-report-success-while-leaving-auth-data-behind) evidence, not test residue.)

**Not addressed here (separate findings):** `lib/fares.ts` is still a third, dead fare implementation and `speedFactor` is still unused — that is [P1-10](#p1-10-fare-logic-has-three-implementations-and-the-live-paths-ignore-speedfactor). `/api/best-options` still prices from the stored ORS duration rather than the traffic-adjusted one, and neither endpoint is rate-limited ([P1-6](#p1-6-rate-limiting-is-incomplete-process-local-and-internally-inconsistent)).

### P1-3. Scheduled trips have three contradictory time behaviors

- [`RouteFinderForm.tsx:350`](components/map/RouteFinderForm.tsx#L350) sends a `datetime-local` string with no timezone offset. Server parsing uses the server's timezone, not necessarily Dhaka.
- `TripHistory.scheduledAt` becomes a `Date` on Mongoose `lean()`, but [`getDepartureOptions`](app/api/best-options/route.ts#L206) only accepts a string. Best Options therefore silently falls back to “now” for stored scheduled trips.
- Fares always fetch OpenWeather's current `/weather` endpoint, even for a departure up to seven days away.

The dashboard traffic request does receive the validated ISO time, so the same scheduled trip can show forecast traffic on the dashboard, current traffic in Best Options, and current weather on fares.

**Fix:** send `new Date(localValue).toISOString()` from the browser, accept/normalize stored `Date | string`, define whether TomTom is live or predictive for scheduled trips, and use a forecast provider/endpoint for scheduled weather.

### P1-4. `/api/traffic/live` allows unbounded paid fan-out from caller coordinates

The authenticated POST accepts any number of points anywhere in the world and makes one TomTom route request for every consecutive pair ([traffic route](app/api/traffic/live/route.ts#L63), [traffic service](lib/traffic-service.ts#L325)). The UI sends at most 10 sampled points, but the server does not enforce that contract. Calls are sequential and each can wait 10 seconds.

**Impact:** one authenticated caller can generate an arbitrarily long, costly request and occupy a server worker.

A bounded London-to-London request returned 200 from TomTom, confirming that the server does not enforce the declared Dhaka service area. It also returned a negative congestion percentage, which the UI can describe misleadingly as slower traffic.

**Fix:** accept an owned `tripHistoryId`/`routeId` and derive geometry server-side, or cap points at 10, enforce the service area, limit request/body size, add distributed per-user/IP quotas, and use bounded concurrency or a single provider request where supported.

### P1-5. Traffic values do not necessarily describe the selected ORS route

The app samples points from an ORS polyline, then asks TomTom for its own fastest car route between each pair. The UI colors the original ORS slice as if TomTom measured that exact segment ([sampling](components/map/MapDashboardSection.tsx#L26), [TomTom URL](lib/traffic-service.ts#L372), [rendering](components/map/RouteMap.tsx#L143)). TomTom may choose different roads, so congestion colors and summed duration can diverge from the selected route.

**Fix:** use a provider/API capable of map-matching or traffic annotation for the chosen geometry, or clearly label traffic as a corridor estimate and validate deviation before coloring the line.

### P1-6. Rate limiting is incomplete, process-local, and internally inconsistent

- Route-cache hits occur before the route limiter and still create a full `TripHistory` record.
- `/api/fares`, `/api/best-options`, `/api/traffic/live`, current-location, profile, and legacy write routes have no meaningful quota.
- Both limiters trust the first `x-forwarded-for` value without deployment-specific trusted-proxy handling.
- Autocomplete increments the global counter even when the IP counter already denied the request, allowing one blocked caller to consume the global budget.
- The “global” Nominatim limit allows a burst of 60 calls, not a true one-request-per-second schedule.
- All counters reset per process/instance.

**Fix:** centralize limits in a shared distributed store, key authenticated expensive routes by user plus IP, apply limits before caches/writes, enforce trusted proxy headers, and add a Nominatim cache/queue consistent with its policy.

### P1-7. “Best Options” does not use the saved travel priority and is not AI

`UserProfile.defaultTravelPriority` is persisted and editable, but [`route-scoring.ts:45`](lib/route-scoring.ts#L45) always uses fixed cost/time/comfort weights (`{ cost: 0.35, time: 0.35, comfort: 0.3 }`). The endpoint does not load `UserProfile`. It also ranks vehicle services for one already-selected route; it does not rank alternative routes. The code and UI call this an “AI Route Scoring Engine,” but it is a deterministic min/max weighted formula with hand-authored multipliers.

**The source comment on this constant is factually wrong, which makes the gap easy to miss.** [`route-scoring.ts:43`](lib/route-scoring.ts#L43) reads *“No per-user priority selector exists yet in the UI, so this uses a balanced default.”* The selector does exist and has since shipped: it renders at [`profile-form.tsx:42`](app/\(main\)/profile/profile-form.tsx#L42), validates at [`profile route:180`](app/api/profile/route.ts#L180), and persists correctly. So this is not deferred work awaiting a UI — it is a shipped, saveable user control that silently changes nothing. Anyone reading the scoring module in isolation will conclude the feature is not built yet and skip the finding.

**Fix (addendum):** delete or correct the stale comment in the same change, whichever direction the priority decision goes. A wrong comment about an unimplemented dependency is worse than no comment, because it redirects the next reader away from the defect.

**Fix:** rename it accurately (for example, “recommended ride options”) or implement a documented model. Thread the user's priority into explicit weights, version the scoring policy, and add golden-vector tests explaining why each option wins.

### P1-8. Selecting a fare or best option has no persisted outcome

`TripHistory.selectedVehicle` is designed for a by-value fare snapshot ([model](models/TripHistory.ts#L51)), but neither fare UI writes it. Clicking a card only changes local highlight state ([FareResults](components/FareResults.tsx#L377), [BestOptionsResults](components/BestOptionsResults.tsx#L401)). There is no booking/deep link/confirmation step.

**Fix:** either label card selection as comparison-only, or add an authenticated ownership-checked endpoint that persists the selected rate/fare snapshot and advances an explicit trip status.

### P1-9. Trip history is unbounded and records searches as completed trips

Every route search, including cache hits and repeated identical requests, creates a new document containing up to three full polylines. `completedAt` defaults to now and is set during planning, before any vehicle choice or trip completion ([create history](lib/trip-history.ts#L82), [model](models/TripHistory.ts#L156)). There is no TTL, per-user cap, trip signature, status, cancellation, or archive.

**Fix:** define a lifecycle (`planned`, `selected`, `completed`, `cancelled`), make repeated planning idempotent where appropriate, add retention/pruning, and add `{ userId: 1, createdAt: -1 }` plus schedule-query indexes.

### P1-10. Fare logic has three implementations and the live paths ignore `speedFactor`

`lib/fares.ts`, `/api/fares`, and `/api/best-options` each implement fare behavior. They disagree on bands, rounding, currency symbol, error handling, and duration. `speedFactor` is seeded for every vehicle but omitted from the live API document shape and calculation. The dead library even declares BDT while formatting with `$` ([fares lib](lib/fares.ts#L1), [seed](scripts/seed-vehicle-rates.mts#L37)).

**Fix:** make one tested domain module the only fare calculator and have both endpoints call it. Decide whether traffic-adjusted or ORS duration drives per-minute cost, use `৳`/`BDT` consistently, and document estimate provenance.

### P1-11. Saved-place editing can silently submit the previous location

When an existing Home, Work, or custom location is edited, the `onChange` handlers retain the old resolved `place` whenever the new text is non-empty ([profile form](app/(main)/profile/profile-form.tsx#L303)). A user can type a different address without choosing a suggestion, click Save, and unknowingly keep the old coordinates and old stored place label.

The API also accepts any finite coordinates, including outside latitude/longitude bounds and outside the service area, and does not require unique labels ([profile validation](app/api/profile/route.ts#L41)). Duplicate labels later collide as React keys in the saved-place dropdown.

This was confirmed with a disposable profile: a saved place at latitude/longitude `999,999` returned 200 and was persisted. The profile was restored and later removed during cleanup.

**Fix:** clear `place` on every text edit, block save for incomplete rows, validate geographic/service-area bounds server-side, and enforce normalized unique labels.

### P1-12. “Plan Again” stops refilling after the first restored/replayed trip

`RouteFinderForm` reads `initialValues` only in state initializers. `MapDashboardSection` keys it as either `"fresh"` or `"restored"` ([MapDashboardSection](components/map/MapDashboardSection.tsx#L331)). Once any restored trip has set the key to `restored`, later Plan Again selections keep the same key and do not remount the form, although the route search itself runs.

**Fix:** key by a replay nonce/trip signature, or make the form react explicitly to changed initial values. Test two different cards and a repeated click on the same card.

### P1-13. Password and email-verification policies are only partially enforced

The Better Auth hook applies the “must contain a number” rule to signup and reset only; the enabled `/change-password` route bypasses it ([auth hook](lib/auth.ts#L163)). Verification email plumbing exists, but `sendOnSignUp` and `requireEmailVerification` are not enabled, so new accounts are not required to verify. The explicit duplicate-email lookup also gives signup a reliable account-enumeration response.

Runtime checks confirmed all three observable behaviors: signup without a digit returned `PASSWORD_MISSING_NUMBER`, duplicate signup returned `EMAIL_ALREADY_EXISTS`, and changing an existing password to a digit-free value returned 200 and allowed a new signin.

**Fix:** define the intended policy, apply password validation to every password mutation, decide whether verification is required, and use a product-approved generic/explicit duplicate-account response consistently.

### P1-14. Auth and app data can silently split across Mongo databases

Better Auth uses `authMongoClient.db()` and therefore the DB name in the URI. Mongoose forces `MONGODB_DB ?? "nobojatra"` ([auth](lib/auth.ts#L122), [Mongoose](lib/mongodb.ts#L3)). A URI with no DB path sends auth collections to the driver's default DB while application collections remain in `nobojatra`.

The current local configuration resolves both clients to `nobojatra`, so no split was present during this test. The risk remains configuration-dependent because the two names are still derived independently.

**Fix:** derive one required database name, pass it explicitly to both clients, and assert the resolved names match at startup. Prefer one connection configuration module.

### P1-15. Public provider proxies can leak quota and upstream details

`/api/trip-input/current-location` has no rate limit, timeout, service-area enforcement, or cache and accepts arbitrary world coordinates. Autocomplete has no fetch timeout and returns Nominatim's response body to the client on non-2xx ([autocomplete](app/api/trip-input/autocomplete/route.ts#L79), [reverse geocode](app/api/trip-input/current-location/route.ts#L18)). The tile handler similarly returns upstream details.

**Fix:** cap, cache, timeout, constrain inputs, and return stable sanitized errors. Add provider-specific observability server-side without exposing bodies.

### P1-16. TomTom traffic tiles have no coverage in Dhaka — the overlay is empty across the entire service area

*New finding, discovered while verifying the PR #18 fix.*

The tile proxy works correctly. The data behind it does not exist for this product's only market. Every Dhaka coordinate returns a byte-identical 4,671-byte PNG whose alpha channel is **zero at all 262,144 pixels** — a fully transparent, completely empty tile.

Measured through the running proxy at four zoom levels over central Dhaka (23.7808875, 90.4192):

| Tile | Bytes | MD5 | Content |
|---|---|---|---|
| `10/769/442` (Dhaka) | 4,671 | `2ae566…fdde` | Empty |
| `12/3076/1769` (Dhaka) | 4,671 | `2ae566…fdde` | Empty |
| `14/12307/7077` (Dhaka) | 4,671 | `2ae566…fdde` | Empty |
| `15/24614/14154` (Dhaka) | 4,671 | `2ae566…fdde` | Empty |
| `14/8186/5448` (London) | 93,543 | `39f494…bcd7` | **Full traffic flow** |
| `14/8415/5384` (Amsterdam) | 100,901 | `4d69b6…daf2` | **Full traffic flow** |

The London tile renders a dense green/orange/red road network with alpha values spanning 0–255. Dhaka renders nothing, at any zoom, including a mid-ocean control tile that returns the same empty hash.

**This is not a bug in PR #18, a key problem, or a wrong endpoint.** The key is valid and entitled — it successfully renders Orbis traffic tiles for European cities. The classic `traffic/map/4` endpoint was tested as a control and is *also* empty for Dhaka, so switching endpoints will not help. TomTom simply does not publish traffic-flow tile coverage for Bangladesh.

Note the asymmetry that makes this easy to miss: TomTom's **routing** API *does* return live traffic for Dhaka, which is why `POST /api/traffic/live` works and why the route-line congestion colouring is genuine. Tile coverage and routing coverage are different products with different coverage maps. A prior verification pass recording "TomTom traffic returned 200" was testing the routing path, not tiles, and does not contradict this.

**Impact:** the "Show map traffic" toggle is a no-op for every real user. Worse, PR #18 removed the conditional that previously rendered an explanatory message, so the button now always renders ([`RouteMap.tsx:264`](components/map/RouteMap.tsx#L264)). A Dhaka user toggles it on, sees no change whatsoever, and has no way to tell whether the feature is broken, still loading, or reporting genuinely clear roads. Each toggle also fires a full viewport grid of tile requests against a paid API to fetch blank images.

**Required fix — a product decision, not a code fix:**

1. **Preferred:** remove the map-tile overlay from the Dhaka build. The route-line congestion colouring from `POST /api/traffic/live` already delivers the actual user value and does have coverage. Shipping a second, empty traffic visual alongside a working one only creates doubt about both.
2. If the overlay is retained for future markets, gate it on a coverage check and render an explicit "map traffic unavailable in your area" state rather than a silent no-op.
3. Either way, confirm coverage with TomTom directly before investing further in this surface.

**Acceptance:** no user-facing control offers a traffic layer that cannot render data; no billable tile request is issued for a region with no coverage.

### P1-17. The new tile proxy is a public, uncapped path to a paid provider

*New finding, introduced by PR #18.*

[`app/api/tiles/tomtom/[z]/[x]/[y]/route.ts`](app/api/tiles/tomtom/%5Bz%5D/%5Bx%5D/%5By%5D/route.ts) has no session check, no rate limit, and no referer or origin restriction. There is no `middleware.ts` in the repository, so nothing gates it upstream either. Every tile request in this verification was made anonymously with no cookie and succeeded.

This is a real change in exposure, not merely a relocation of the old `NEXT_PUBLIC_TOMTOM_API_KEY` risk. The public key was at least attributable and independently revocable; the proxy spends the *server* key, on the server's behalf, for anyone on the internet who knows the URL shape — which is guessable and visible in any browser's network tab.

The abuse is not theoretical, and P1-16 makes it sharper rather than softer: Dhaka tiles are empty, but **London and Amsterdam tiles are not**. An open proxy that returns real, useful map tiles for high-coverage cities is worth scraping. A third party can back a map of their own with your TomTom quota indefinitely.

**Required fix:** require a session, or at minimum enforce a per-IP quota plus same-origin/referer checks, and cap the tile pyramid to the service-area bounding box and a sane zoom band. If P1-16 is resolved by removing the overlay, delete this route with it — that closes the finding outright.

**Acceptance:** an anonymous request from an unknown origin cannot consume provider quota; tile requests outside the service area are rejected before the upstream call.

---

## 7. P2 findings — narrower correctness and UX gaps

| ID | Finding and evidence | Required fix |
|---|---|---|
| P2-1 | Multi-stop leg boundaries are split by equal coordinate count instead of ORS `way_points`, even though that field is typed ([route-service](lib/route-service.ts#L263)). Colors can change at the wrong road location. | Use `feature.properties.way_points` and validate indices; add a multi-stop fixture test. |
| P2-2 | ORS responses with zero `features` return success, create an empty TripHistory, and leave the UI with neither routes nor an error ([route-service](lib/route-service.ts#L372), [routes API](app/api/trip-input/routes/route.ts#L224)). | Treat zero routes as a typed 404/422 provider outcome; do not create history. |
| P2-3 | Route alternative UI is gated by `activeRoute.legs.length`, conflating number of route options with number of stops ([RouteResults](components/map/RouteResults.tsx#L34), [RouteMap](components/map/RouteMap.tsx#L141)). It is masked because ORS disables alternatives when stops exist. | Base switching only on `routes.length`; separately render leg details. Decide whether multi-stop alternatives are a product requirement. |
| P2-4 | `FitBounds` uses stops but omits them from its effect dependencies ([RouteMap](components/map/RouteMap.tsx#L93)). | Depend on a stable waypoint signature or memoized stops array; remove the lint suppression. |
| P2-5 | Frequent-trip grouping keys only origin/destination and Plan Again always drops stops, departure mode, and schedule ([trip-history](lib/trip-history.ts#L194), [cards](components/home/PlanAgainCards.tsx#L38)). | Include the intended trip shape in the signature/snapshot or label cards as endpoint-only shortcuts. |
| P2-6 | Recent “activity” shows the scheduled time for planned trips and creation time for now trips, but has no status and cannot be opened, cancelled, or rerun directly ([RecentTrips](components/home/RecentTrips.tsx#L30)). | Define lifecycle and provide detail/replan/cancel affordances, or rename the section to recent searches. |
| P2-7 | CNG hard-block requires severity `>= 9`; reaching it requires near-maximum precipitation, wind, and visibility penalties together ([weather](lib/weather.ts#L198)). | Validate the policy with product/safety owners and table-driven tests; lower/remove the threshold if it is not intentional. |
| P2-8 | Dashboard copy always says “X% slower than free flow,” even when the calculated percentage is negative ([RouteResults](components/map/RouteResults.tsx#L189), [traffic calculation](lib/traffic-service.ts#L139)). | Clamp impossible negative delay or use faster/slower/versus wording. Validate provider invariants. |
| P2-9 | Stop validation writes by index into an initially empty array; serialization can produce `null` holes ([trip-input](lib/trip-input.ts#L187)). | Use a keyed error object or a fully initialized array with a documented contract. |
| P2-10 | `origin` and `destination` are `Mixed`; route `legs` are mixed; many numeric rate fields have no min/max constraints ([TripHistory](models/TripHistory.ts#L98), [VehicleRate](models/VehicleRate.ts#L33)). | Reuse typed sub-schemas, enforce coordinate/rate bounds, and add migration/validation tests. |
| P2-11 | Profile network operations, fare loading, and best-option loading assume JSON and do not consistently catch network/parse failures; some buttons can remain stuck or all server detail is discarded. | Add shared typed fetch/error handling, abort on unmount/change, and distinguish 401/404/422/503 for actionable UI. |
| P2-12 | The fares and best-options server pages check query strings but not session, so signed-out deep links render a product shell and later show a generic API error ([fares page](app/(main)/fares/page.tsx#L8), [best-options page](app/(main)/best-options/page.tsx#L13)). | Check the session server-side and redirect to signin with a safe return target. |
| P2-13 | Weather is sampled at one route midpoint. Long/multi-stop routes can cross materially different conditions, while the UI presents one reading as route-wide. | Either label it explicitly as midpoint weather or sample origin/destination/legs and aggregate with a documented rule. |
| P2-14 *(new)* | The "Show map traffic" button now renders unconditionally ([RouteMap](components/map/RouteMap.tsx#L264)). PR #18 removed the branch that explained when tiles were unavailable, and `trafficTileUrl` is now an unconditional string, so the `trafficTileUrl &&` guard at [line 183](components/map/RouteMap.tsx#L183) is permanently true and dead. Combined with P1-16 the control is a silent no-op; if `TOMTOM_API_KEY` is unset server-side it is worse, because Leaflet will request tiles that return a 500 JSON body and render as broken images. | Derive the control's availability from real tile-provider state, and render an explicit unavailable/empty state instead of an inert button. Remove the dead guard. |
| P2-15 *(new)* | Tile coordinates are validated for numeric *format* only (`/^\d+$/`), not range. `z=99`, `x=999999999` passes validation and issues a live billable upstream request, returning 502 rather than the 400 the P0-2 acceptance criteria specified. Verified against the running proxy. | Validate `0 ≤ z ≤ 22` and `0 ≤ x,y < 2^z`, and reject out-of-range coordinates with 400 *before* calling TomTom. Pairs with the service-area cap in P1-17. |
| P2-16 *(new)* | `app/api/tiles/tomtom/[z]/[x]/[y]/route.ts` has no trailing newline, so `git diff` reports `\ No newline at end of file`. Trivial, but it is a new file and the rest of the tree is consistent. | Add the newline; consider an `.editorconfig` or formatter check in CI. |

---

## 8. P3 findings — maintainability, delivery, and polish

| ID | Finding | Required fix |
|---|---|---|
| P3-1 | No test files exist. Pure validation, weather, fare, traffic, route-mapping, and scoring logic are unprotected. | Add unit fixtures first, then API ownership/provider-failure integration tests and a small browser journey. |
| P3-2 | **Partly addressed.** A secret-scan workflow now exists (added for P0-1), but it is the only gate — nothing stops failing lint/typecheck/build from reaching `main`, which is how the P0-2 type error got there. | Extend `.github/workflows/` with install, lint, typecheck, tests, build, and production audit policy. The secret-scan job is a working template for the runner setup. |
| P3-3 | `.env.example` is ignored by `.env*` and is not tracked. It omits `MONGODB_DB`, Pathao, Nominatim, TomTom private/public, and Mapbox variables. | Add `!.env.example`, document required/optional/fallback behavior, and remove the public TomTom key path after proxying. |
| P3-4 | `shadcn` and `@types/leaflet` are runtime dependencies; no `typecheck` script, `engines`, or `packageManager` field exists. | Move tooling/types to dev dependencies and pin the supported Node/pnpm toolchain and scripts. |
| P3-5 | `lib/fares.ts`, `Alert`, `Camera`, `Map_route`, `Place`, `TrafficData`, and most associated routes are dead or legacy. `GET /api/profile` is also unused by the current UI. | Delete unused surface after data-migration review, or document a real owner/caller and secure it. |
| P3-6 | Landing/suggestion copy says live congestion and saved places are “On the way”/“Soon” although both merged into `main` ([AnonymousHome](components/home/AnonymousHome.tsx#L24), [SuggestionTiles](components/home/SuggestionTiles.tsx#L19)). | Update the feature catalog from actual behavior and avoid hardcoded roadmap copy in product UI. |
| P3-7 | The root has competing, stale, untracked/deleted handover and integration documents; the prior report referenced commit `992dbf5`, not current `1dec6f2`. | Keep one current handover and one current audit under `docs/`, stamp commit/date, and archive superseded reports. |
| P3-8 | Lint reports 7 errors and 5 warnings (down from 7/7 — PR #18 cleared two `RouteMap` warnings): 4 inline DNS `require`s, 2 React state-in-effect errors, 1 explicit `any` in `lib/traffic-service.ts:452`, 4 unused `mongoose` imports in dead models, and 1 missing effect dependency. | Fix causes rather than suppressing rules; make zero warnings the merge baseline. Note the 4 unused-import warnings disappear for free when the dead models are deleted per P3-5. |
| P3-9 | `app/(main)/page.tsx` contains a source comment saying it was reconstructed from a chat, and recent commit messages are not review-friendly. | Remove provenance scaffolding from production files and adopt a concise conventional commit/PR standard. |
| P3-10 | Autocomplete is not a real accessible combobox: no programmatic label/roles, keyboard navigation, active descendant, Escape behavior, or selection announcement. Navbar `<details>` and deletion modal also lack full focus management. | Follow the ARIA combobox/dialog patterns and run keyboard plus screen-reader checks. |
| P3-11 | **Partly resolved in `2f6f84a`.** The unreachable fallback proxy message is gone. Still open: map attribution hardcodes Mapbox even when OSM tiles are used and the traffic layer is TomTom ([RouteMap](components/map/RouteMap.tsx#L173)) — now also a provider-attribution compliance question, since TomTom tiles carry their own attribution requirement. | Generate attribution and controls from the actual selected tile provider; add the TomTom attribution the terms require while that layer is in use. |
| P3-12 | A local patch changes React Leaflet unmount semantics. It may be necessary, but there is no regression test or upgrade note beyond the patch itself. | Add a map mount/unmount test and re-evaluate the patch on every React Leaflet upgrade. |
| P3-13 | App metadata is only “NoboJatra / Travel Planner”; stock Next/Vercel SVGs remain unused. Security headers are not configured in `next.config.ts`. | Remove template assets, improve metadata, and define CSP/referrer/permissions/frame policies compatible with map/provider domains. |
| P3-14 *(new)* | `scripts/test-tomtom.js` calls `routing/matrix/2`, but the app's traffic path uses `routing/1/calculateRoute` ([traffic-service](lib/traffic-service.ts#L5)). The account is not provisioned for Matrix: running the script returns **403 `InsufficientFunds`**, while a direct `calculateRoute` request for the same city returns 200 with live traffic (5,016 m / 232 s, verified). The diagnostic therefore reports failure when the feature it sits next to is working — actively misleading during an incident. Its hardcoded origin `23.7808875, 90.2792371` also fails map-matching (`MAP_MATCHING_FAILURE`), so the request would not succeed even with credits. | Point the script at `routing/1/calculateRoute` with coordinates that snap to a road, so it exercises the endpoint the app depends on. Left unchanged here because switching endpoints changes what the script tests — a call for the script's owner, not a side effect of the P0-1 secret fix. |

---

## 9. API inventory and disposition

### Active and protected

| Endpoint | Purpose | Ownership/auth status |
|---|---|---|
| `POST /api/trip-input/routes` | Validate, call ORS, persist route snapshot | Session required; history uses session user |
| `PATCH /api/trip-input/history/:id` | Change selected route | Session + `{_id,userId}` ownership |
| `POST /api/traffic/live` | Fetch TomTom traffic for caller points | Session required; input trust/cost gap remains |
| `POST /api/fares` | Fare/weather for saved route | Session + owned TripHistory |
| `POST /api/best-options` | Rank vehicles for saved route | Session + owned TripHistory |
| `GET/PATCH/DELETE /api/profile` | Profile and account settings | Session required; mutation/deletion implementation gaps remain |
| `/api/auth/*` | Better Auth routes | Provider-owned auth behavior; configuration gaps remain |

### Intentionally public

| Endpoint | Reason | Caveat |
|---|---|---|
| `GET /api/trip-input/autocomplete` | Anonymous landing-page search | Provider-policy/rate-limit/timeout gaps |
| `GET /api/trip-input/current-location` | Reverse geocode browser coordinates | Unlimited public proxy today |
| `POST /api/trip-input/validate` | Cheap shared validation | Acceptable public CPU path; still needs body-size observability |
| `GET /api/tiles/tomtom/[z]/[x]/[y]` | Serve traffic tiles without shipping the key to the browser | **Added `2f6f84a`. Public by construction but uncapped — see P1-17.** Not "intentionally public" in the same considered sense as the rows above; it is public because a Leaflet `TileLayer` cannot send credentials. That constraint argues for origin/quota controls, not for leaving it open |

### Broken or remove/secure

- ~~Broken: `GET /api/traffic/live` and missing `/api/tiles/tomtom/[z]/[x]/[y]`.~~ **Both resolved in `2f6f84a`.** The tile route now exists and returns valid PNGs; the invalid `GET` is deleted. It serves no data in Dhaka (P1-16) and needs a quota (P1-17), but it is no longer broken.
- Remove/secure: all `map_routes`, legacy `traffic` storage/history, `places`, `camera`, and `test-mongo` routes listed in P0-4. **Unchanged by PR #18** — all eleven files and their thirteen handler methods are still present and still unauthenticated.

---

## 10. Data-model inventory

| Model / collection | Live role | Status and caveat |
|---|---|---|
| Better Auth `user/session/account/verification` | Identity and sessions | Core; raw app writes/deletes are unsafe |
| `TripHistory` | Route snapshots, recent/upcoming, fare source | Core; unbounded, loose subdocuments, incomplete lifecycle |
| `VehicleRate` | Fare configuration | Core; manual seed only, approximated rates, live code ignores `speedFactor` |
| `UserProfile` | defaults and saved places | Core; priority unused, saved-place validation incomplete |
| `Map_route` | Legacy saved-route spike | No current caller |
| `Place` | Legacy string place storage | Superseded by embedded `UserProfile.savedPlaces` |
| `TrafficData` | Legacy stored traffic readings | Superseded by live TomTom path |
| `Camera` | Legacy camera registry | No current caller |
| `Alert` | Planned alerts | Nothing creates or reads alerts; deletion only |

Database indexes were inspected directly. `UserProfile.userId` is uniquely indexed, `VehicleRate` has the expected unique `{ provider, vehicleType }` index, and `TripHistory` has only a single-field `userId` index. `Map_route`, `Place`, `TrafficData`, `Camera`, and the Better Auth collections have only `_id` indexes. The main reads still need compound indexes for recent trips, upcoming scheduled trips, frequent-trip windows, and latest traffic readings. Index creation should be migration-owned rather than relying on Mongoose auto-index behavior in production.

---

## 11. Environment and operational contract

The code reads or relies on:

| Variable | Requirement | Notes |
|---|---|---|
| `MONGODB_URI` | Required | Must include/agree with explicit DB name |
| `MONGODB_DB` | Should be required | Currently defaults only on Mongoose side |
| `BETTER_AUTH_SECRET` | Required | Better Auth-managed |
| `BETTER_AUTH_URL` | Required server config | Current local value resolves to `http://localhost:3000`; do not duplicate as a hardcoded client base URL |
| `RESEND_API_KEY` | Required for reset/change-email mail | Missing key makes mail flow fail |
| `RESEND_FROM_EMAIL` | Production-required | Fallback is Resend sandbox sender |
| `ORS_API_KEY` | Required for route planning | Server-only |
| `TOMTOM_API_KEY` | Required for traffic | Server-only; **rotate the published key immediately (P0-1)**. Now also powers the tile proxy, so an unset value degrades the map layer to broken images rather than a clean fallback (P2-14) |
| `PATHAO_FARE_API` | Required by current seed/data | Undocumented custom upstream; failure policy needed |
| `OPENWEATHER_API_KEY` | Optional enhancement | Fares degrade without weather |
| `OPENWEATHER_BASE_URL` | Optional | Defaults to v2.5 current weather |
| `NOMINATIM_BASE_URL` / `NOMINATIM_USER_AGENT` | Optional config | Defaults exist; production contact identity should be explicit |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Optional map tiles | Browser-visible by design |
| `NEXT_PUBLIC_TOMTOM_API_KEY` | ~~Should be removed~~ **Removed** | Deleted in `2f6f84a`; zero references remain in the codebase. The private tile proxy replaced it as recommended. Purge the value from any deployment environment that still sets it |

Secrets must never be placed in `NEXT_PUBLIC_*`, scripts, documentation examples, or client bundles.

---

## 12. Remediation plan

### Phase 0 — contain and restore the deployment gate

The six P0s differ by roughly an order of magnitude in cost, so they should not be scheduled as one block. Four are same-day:

1. **Rotate the TomTom credential** and remove the literal. Minutes of work, and the only item whose cost grows with delay — do it first regardless of what else is queued.
2. ~~**Delete the `GET` handler from `app/api/traffic/live/route.ts`.**~~ **Done in `2f6f84a`**, along with the tile proxy. Both steps shipped together and both are correct. The follow-on work is now P1-16 (decide whether the overlay ships at all, given zero Dhaka coverage), P1-17 (cap the proxy), and P2-15 (range validation) — none of which block the gate.
3. **Remove the Better Auth client localhost base URL.** One line. Auth is non-functional on every deployed host until this ships.
4. **Delete the unused unauthenticated APIs, `test-mongo`, and their dead models.** One commit, and the highest value-per-unit-effort item in this document: it removes the entire anonymous read/write surface (P0-4), four of the seven current lint warnings (P3-8), and five dead models (P3-5) simultaneously.

The remaining two are genuine multi-day work and should be planned as such:

5. **Consolidate account deletion through Better Auth hooks** (P0-5) — needs an ObjectId-coercion fix, a cascade hook, a re-auth step, and an integration test to prove no orphan remains.
6. **Upgrade vulnerable dependencies** (P0-6) — but note that moving `shadcn` to `devDependencies` clears the Hono advisories from the production audit with no application-code change, so the residual Next/`sharp`/PostCSS/`nanoid` upgrade is smaller than the raw count of 19 suggests. Do the dependency reclassification first and re-audit before scoping the rest.

### Phase 1 — make provider-backed behavior reliable

0. **Decide the fate of the map-tile overlay first (P1-16).** It has no data in Dhaka, so every other item on this list that touches it — quotas, range validation, attribution, the toggle's empty state — is only worth doing if the answer is "keep it." Removing it deletes P1-17, P2-14, P2-15, P2-16 and half of P3-11 at a stroke. Make this call before writing any more tile code.
1. ~~Extract one fare service and isolate Pathao failures.~~ **Done (P1-2)** — `lib/fare-providers.ts`. Folding the dead `lib/fares.ts` and `speedFactor` into it remains open as P1-10.
2. Redesign traffic requests around owned stored routes, caps, and quotas.
3. Correct scheduled-time serialization and forecast semantics.
4. Add timeouts, safe errors, caching, and distributed rate limits to public proxies — now including the tile proxy if it survives step 0.
5. Make Mongo DB selection explicit and shared.

### Phase 2 — complete user-facing promises

1. Decide whether Best Options ranks routes, vehicles, or both; use travel priority.
2. Persist selected vehicle or remove the implied selection workflow.
3. Define trip lifecycle and retention.
4. Fix saved-place edits and Plan Again replays.
5. Correct multi-stop leg boundaries and route/traffic representation.

### Phase 3 — prevent regression

1. Unit-test pure domain modules with table-driven fixtures.
2. Integration-test auth ownership, deletion, provider failure, and schedule behavior.
3. Add one browser E2E journey from anonymous input through fares.
4. Add CI gates for secret scan, lint, typecheck, tests, build, and audit.
5. Consolidate documentation and remove dead code/models/assets.

---

## 13. Release acceptance checklist

- [ ] Old TomTom key revoked in the TomTom console. *(outstanding — `.env` still holds the published value)*
- [ ] Git history rewritten on all three affected remote refs. *(outstanding — needs force-push coordination)*
- [x] No secret literal in the working tree; scripts read the key from the environment.
- [x] Automated secret scanning gates pull requests and pushes to `main`.
- [x] `npm run build` passes. *(green as of `2f6f84a`)*
- [x] `tsc --noEmit` passes. *(exit 0 as of `2f6f84a`)*
- [ ] ESLint passes with zero warnings. *(7 errors, 5 warnings remaining)*
- [ ] Production dependency audit has no high findings.
- [ ] Deployed auth uses the current origin.
- [ ] Anonymous legacy data reads/writes are removed or return 401/403.
- [ ] Account deletion removes both auth and application records in an integration test.
- [x] Pathao outage still returns non-Pathao fares. *(P1-2; measured — `/api/fares` returns all 7 options with `PATHAO_FARE_API` pointed at a closed port, and the two Pathao rows degrade to `fareSource: "rate_card"`)*
- [ ] Scheduled Dhaka time produces one consistent ISO instant across route, traffic, weather, and history.
- [ ] Traffic API enforces owned geometry, point cap, service area, and quota.
- [x] No provider key is shipped to the browser. *(`NEXT_PUBLIC_TOMTOM_API_KEY` removed in `2f6f84a`; verify deployment env no longer sets it)*
- [ ] The map traffic layer either renders real data in the service area or is removed / shows an explicit unavailable state.
- [ ] The tile proxy rejects anonymous or out-of-area requests before calling the provider.
- [ ] Saved-place edits cannot retain stale coordinates.
- [ ] Two consecutive Plan Again selections refill the form correctly.
- [ ] Travel priority either changes ranking or is removed from the UI.
- [ ] Selected vehicle behavior is explicitly persisted or explicitly comparison-only.
- [ ] Trip retention/lifecycle and indexes are documented and tested.
- [ ] CI enforces the above checks on every merge.

---

## 14. Runtime verification record

> Recorded against commit `1dec6f2`. The traffic-tile rows in this section are superseded by [§15 Pass B](#pass-b--against-2f6f84a-pr-18-traffic3); everything else still applies.

All checks below used the then-current checkout and configured `.env`. Successful tests used two uniquely named disposable Better Auth accounts and exact disposable application records. Cleanup was verified directly: both users, both accounts, all four test sessions, and the test camera had zero remaining matches; the application deletion endpoint had already removed the test profile, trips, legacy route, place, and route-owned traffic sample.

### Confirmed working in this environment

| Area | Evidence |
|---|---|
| Better Auth basics | Signup 200, session lookup 200, signin 200, weak signup 400, duplicate signup 409, unknown-email reset request returned the generic 200 contract |
| Profile-owned values | GET 200; passenger priority/count and sanitized saved-place values persisted across a following GET |
| Trip validation | Valid direct trip 200; invalid service area, passenger count, and departure mode returned field-level 400 errors |
| OpenRouteService | Authenticated route request returned two route alternatives and created owned TripHistory |
| Ownership | A second signed-in user received 404 for both route-selection PATCH and fare lookup against the first user's trip |
| Route cache | Repeating the same route returned `X-Route-Cache: HIT` and created a second history record as diagnosed |
| Route selection | Owned `PATCH /api/trip-input/history/[id]` persisted `route-0` |
| Fares and Pathao | Fare API returned seven configured vehicle options, including Pathao estimates, capacity eligibility, and map/trip context |
| Weather | Fare and Best Options both returned available route-midpoint weather with a low severity band |
| TomTom traffic | Live Dhaka traffic returned 200; Best Options returned live congestion and three ranked options |
| Nominatim | `Dhanmondi` autocomplete returned three results; reverse geocoding returned a coordinate-matched label |
| Valid result pages | `/fares?tripHistoryId=...&routeId=route-0` and `/best-options?...` returned 200; missing IDs redirected to `/` |
| Database wiring | Better Auth and Mongoose both resolved to `nobojatra` locally; stored auth IDs/references were confirmed as `ObjectId` |
| Bounded local concurrency | At 10-way concurrency, 20/20 homepage requests and 20/20 profile requests returned 200. Homepage p95 was about 310 ms; profile p95 about 1,068 ms |

### Confirmed failures and caveats

| Check | Result |
|---|---|
| Profile name update | PATCH 200, but following GET retained the old name — **fixed, see P1-1** |
| Malformed profile JSON | Returned 500 instead of a stable 400 contract — **fixed, see P1-1** |
| Saved-place coordinate validation | Persisted impossible `999,999` coordinates with status 200 |
| Password consistency | `/change-password` accepted a digit-free password and subsequent signin succeeded |
| Account deletion | Reported success and deleted app data, but left the auth user/account/sessions usable |
| Legacy APIs | Anonymous create/read succeeded for places, routes, traffic, cameras, bounds, peak hours, and Mongo diagnostics |
| Traffic scope | Authenticated traffic for points outside Bangladesh returned 200; no service-area restriction exists |
| Traffic tile GET | `GET /api/traffic/live` returned 500; the URL used by the map returned 404 |
| Security headers | Local `/` response lacked CSP, frame, MIME-sniffing, referrer, permissions, and HSTS headers |
| Scheduled input | Naive Dhaka local time and explicit `+06:00` normalized identically on this machine, but this does not remove the deployment-time UTC parsing risk |

### Still not verifiable from this workspace

- **Actual password-reset and verification email delivery:** a real controlled inbox and approved Resend recipient/domain are required. The unknown-email non-sending path was tested; no message was intentionally sent to an uncontrolled address.
- **Email change and token redemption:** these require the same controlled inbox and a real one-time token.
- **Visual/browser behavior:** no browser was connected, so map tiles, geolocation permission UI, responsive/mobile layout, keyboard interaction, screen-reader semantics, client console errors, and the full click journey remain unverified.
- **Production deployment:** there is no deployment target/session in scope, so real-host Better Auth origin behavior, TLS/HSTS, serverless cold starts, multi-instance rate limits/caches, provider egress, and production environment variables remain unverified.
- **Provider failure and quota behavior:** live success compatibility was checked, but outages, invalid keys, throttling, billing limits, and long-tail timeouts were not induced against paid services.
- **Existing production data compatibility:** collection structure and indexes were inspected, but unrelated user documents were not read or mutated.
- **Sustained load and distributed concurrency:** only a small local read-only probe was run; this is not a capacity test.

These remaining items need controlled external resources rather than more static code inspection. They should become repeatable integration/E2E checks in CI or a staging environment after the P0 fixes.

---

## 15. Independent re-verification (2026-08-14)

Two verification passes ran on this date. **Pass A** re-checked the audited commit `1dec6f2`. **Pass B** re-checked `2f6f84a` after PR #18 landed. Both are recorded below; where they disagree, Pass B governs.

### Pass A — against `1dec6f2`

Re-ran every statically checkable claim in this document to establish whether the audit had gone stale and whether its findings survive independent confirmation.

**Repository state at Pass A:** unchanged from the audit. `HEAD` was `1dec6f2`; the working tree differed only by untracked Markdown reports and one added `.gitignore` line (`.atlas/`).

#### Confirmed by re-execution

| Claim | Re-verification method | Result |
|---|---|---|
| Type-check is red | `npx tsc --noEmit` | Fails with the exact `RouteHandlerConfig<"/api/traffic/live">` mismatch described in P0-2 |
| Lint is red | `npx eslint .` | 7 errors, 7 warnings — matches the baseline table exactly |
| Production audit | `pnpm audit --prod` | 19 advisories: 8 high, 10 moderate, 1 low — matches exactly |
| No tests | Recursive search for `*.test.*` / `*.spec.*` | Zero files |
| No CI | `.github/workflows` | Directory does not exist |
| Committed key is remote | `git log -S`, `git branch -r --contains` | Present in `2f57aca` on three `origin` refs — see the P0-1 escalation |
| Legacy handlers have no caller | Grep for each path across `app/`, `components/`, `lib/`, excluding `app/api/` itself | Zero references; the only `/api/traffic*` caller in the app is `lib/routing.ts:122` → `/api/traffic/live` |
| Tile proxy missing | `app/api/tiles/` | Does not exist, while `RouteMap.tsx:134` requests it |
| `selectedVehicle` never written | Grep across app source | Appears only in `models/TripHistory.ts` |
| Travel priority never scored | Grep across app source | Read/written in profile surfaces only; absent from `lib/route-scoring.ts` |
| Profile name uses a string `_id` | Read `app/api/profile/route.ts:147` | Confirmed raw `updateOne({ _id: session.user.id })` |
| Split database derivation | Read `lib/auth.ts:128`, `lib/mongodb.ts:4` | `client.db()` with no argument vs `MONGODB_DB ?? "nobojatra"` — independent, as described |
| Pathao serialized in the rates loop | Read `app/api/fares/route.ts:339` at `2f6f84a` | `await` inside `for…of`, no timeout, no `response.ok` check. **Fixed in P1-2** — now `estimateFaresForRates()` in `lib/fare-providers.ts` |
| Fares page has no session check | Read `app/(main)/fares/page.tsx` | Validates query strings only, then renders |
| Saved-place edit retains old place | Read `profile-form.tsx` | `place: v ? r.place : null` — confirmed verbatim |
| Plan Again remount key | Read `MapDashboardSection.tsx:332` | `key={restoredTrip ? "restored" : "fresh"}` — confirmed |
| `.env.example` untracked | `git ls-files` | Untracked, ignored by `.env*`. Note in passing: `.env` itself is correctly untracked — no environment secrets are in Git beyond the P0-1 script literal |

Nothing checked was found to be inaccurate.

#### Corrections applied to this document

1. **P0-1 escalated.** The original text hedged on whether the key had been shared. It has: the commit is on three remote refs at `github.com/Sakif16/nobojatra`. Rewritten to reflect confirmed publication, with rotation ordered before any Git history work.
2. **P1-7 strengthened.** Added the stale source comment at `route-scoring.ts:43`, which asserts the travel-priority UI does not exist when it does. This changes the finding from "unfinished feature" to "shipped control that silently does nothing," and explains why a reader of the scoring module alone would miss it.
3. **Two line references corrected.** `lib/auth-client.ts:2` → `:4` (P0-3); `lib/auth.ts:154` → `:158` (P0-5). Both cited the right file and construct, but off-by-a-few line anchors, which matters for anyone navigating by them.

---

### Pass B — against `2f6f84a` (PR #18, `traffic3`)

**Repository state at Pass B:** two new commits on `main` — `7391fcf` "Updated traffic", merged as `2f6f84a` (PR #18). The diff touches exactly three files: `app/api/tiles/tomtom/[z]/[x]/[y]/route.ts` (new, 67 lines), `app/api/traffic/live/route.ts` (−30), `components/map/RouteMap.tsx` (+18/−29). Nothing else in the tree changed; `lib/traffic-service.ts` and `lib/routing.ts` are byte-identical, so P1-4 and P1-5 are untouched.

#### Gate status changes

| Check | Pass A (`1dec6f2`) | Pass B (`2f6f84a`) |
|---|---|---|
| `tsc --noEmit` | Failed | **Exit 0** |
| `eslint .` | 7 errors, 7 warnings | 7 errors, **5** warnings |
| `GET /api/tiles/tomtom/z/x/y` | 404 | **200, valid PNG** |
| `GET /api/traffic/live` | 500 | Handler removed |
| `NEXT_PUBLIC_TOMTOM_API_KEY` in bundle | Present | **Zero references** |

#### Live testing performed

A dev server was started on an isolated port and the tile proxy exercised directly. All requests were anonymous, read-only, and bounded — 14 tile fetches total, plus 6 direct upstream calls to TomTom for control comparison.

| Test | Result |
|---|---|
| Valid Dhaka tile, z10/z12/z14/z15 | 200, `image/png`, 512×512 RGBA, 4,671 bytes, identical MD5 at every zoom |
| Alpha-channel decode of the Dhaka tile | **All 262,144 pixels have alpha = 0** — fully transparent, no data |
| London `14/8186/5448` | 200, 93,543 bytes, alpha range 0–255 — dense traffic network renders correctly |
| Amsterdam `14/8415/5384` | 200, 100,901 bytes — renders correctly |
| Mid-ocean control tile | Byte-identical to the Dhaka tile, confirming "empty" not "unrendered" |
| TomTom classic `traffic/map/4` endpoint, Dhaka | Also empty — rules out a wrong-endpoint explanation |
| TomTom Orbis, `style=relative` / `relative-light` | 400 `INVALID_STYLE` — the code's `style=light` is the correct parameter |
| Non-numeric coordinates `a/b/c` | 400, stable JSON contract |
| Negative coordinate `-1/0/0` | 400 |
| Out-of-range `99/999999999/999999999` | **502 after a live upstream call** — no range validation (P2-15) |
| Anonymous access with no cookie | Succeeds — route is fully public (P1-17) |
| `middleware.ts` present | No — nothing gates the route upstream |

Tile indices were computed with the standard slippy-map projection from Dhaka's centre (23.7808875, 90.4192); an initial hand-guessed coordinate was discarded as incorrect before these measurements were taken.

#### Findings added by Pass B

- **P1-16** — TomTom publishes no traffic-tile coverage for Dhaka; the overlay is empty across the entire service area. This is the most consequential result of the pass: the feature PR #18 restored cannot show anything to a real user. It is a provider-coverage fact, not a defect in the PR.
- **P1-17** — the new tile proxy is public and uncapped, and serves *real* tiles for high-coverage cities, making it worth abusing.
- **P2-14** — the toggle now renders unconditionally with the explanatory fallback removed, so the no-op is silent.
- **P2-15** — coordinate validation checks numeric format but not range.
- **P2-16** — missing trailing newline in the new file.

#### Assessment of PR #18

The change is well-executed and should be credited as such: it implements exactly the two-step fix this document recommended, uses the correct Next 16 promised-params signature, sanitizes upstream error bodies while still logging them server-side, adds a timeout and bounded caching, removes the browser-visible provider key entirely, and fixes a genuine React keying bug in the polyline rendering as a bonus. The residual findings are about *product scope and exposure*, not about the quality of what was written.

### Not re-verified in either pass

The runtime findings in [§14](#14-runtime-verification-record) — the deletion orphaning, the persisted `999,999` coordinates, the `/change-password` policy bypass, the anonymous legacy CRUD, the out-of-service-area traffic call — were not re-executed, since they require a live database and disposable accounts. They are recorded as originally observed and carry the confidence of that first pass. Their underlying source-level causes were all re-confirmed statically, which is consistent with the observed behavior but is not a substitute for re-running them.

Browser rendering of the map remains unverified in all passes. The tile-level evidence above is stronger than a screenshot for the coverage question — a transparent PNG cannot render as anything — but the toggle's actual on-screen behavior, the Leaflet layer ordering, and the broken-image case when `TOMTOM_API_KEY` is unset have not been observed in a browser.
