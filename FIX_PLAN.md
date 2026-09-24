# Nobojatra fix plan

**Date:** 17 September 2026
**Source:** [PROJECT_ASSESSMENT_AND_EXPANSION_ROADMAP.md](PROJECT_ASSESSMENT_AND_EXPANSION_ROADMAP.md), Sections 5, 19, 21, 22 and 23 (fourth pass)
**Code baseline:** `main` at `2d6f172`. All file and line references are to this commit.

This plan turns every **issue and caveat** in the assessment into a fix step. It covers:

- the G-series defects (G01–G38);
- the C-series configuration and auth findings (C01–C10; C11 is out of scope for this demo project);
- the P-series finish issues (P01–P14);
- the R-series refinements (R01–R30);
- the verification checks and product decisions that the fixes depend on.

It does not cover the feature candidates (F01–F24, and R15, which is F24) or the commercial roadmap in Sections 8–18. Where the fourth pass corrected a finding, this plan follows the corrected version. For example, R20 is planned as "retire the legacy collections", not "index them".

## How to read this plan

Steps are ordered from easiest to hardest, in six tiers:

| Tier | Effort per step | What it contains |
|---|---|---|
| 0 | No code | Checks and decisions that other steps depend on |
| 1 | Trivial: under an hour | One-file or few-line changes |
| 2 | Small: up to a day | Contained changes across a few files |
| 3 | Medium: two to five days | Changes that span layers or need a migration |
| 4 | Large: one to three weeks | New subsystems or provider changes |
| 5 | External | Work that needs data, contracts or partners the team does not have yet |

Tier 1 steps each take under an hour, so their order matters little; they are grouped by area. In Tier 2, the P0 and security steps (2.1–2.6) come first. Elsewhere, steps are grouped so related changes sit together. Severity uses the assessment's scale: **P0** blocks an unrestricted launch, **P1** is needed for a dependable pilot, **P2** can be phased. Finish items carry no severity.

Every step has three parts:

- **Issue:** what is wrong, with the file that shows it.
- **Approach:** how to fix it.
- **Acceptance criteria:** checks that must pass before the step is done.

"Depends on" names steps that must land first.

## Caveats that apply to the whole plan

- **Estimates are judgement.** They assume one engineer who knows the codebase, and exclude review and deployment time.
- **Effort order is not the same as priority.** The P0 items G30, G01 and G03 are cheap, so they land early anyway. G02 is P0 but large; its interim mitigations (steps 1.3 and 2.3) are early. The recommended execution order is in [Milestones](#milestones).
- **Some steps change stored data:** 2.2, 2.6, 2.20, 3.3, 3.7 and 4.9. Take a backup and write a rollback note before each.
- **Some steps touch provider terms:** attribution, storing provider output, and tile usage. Check the provider's current terms when the step starts; the assessment's links were checked on 9 September 2026.
- **The audit harnesses assert today's defects.** When a fix lands, the matching assertion in `docs/audits/*/` will fail. Convert it into a regression test that asserts the fixed behavior (step 3.15); do not delete it quietly.
- **Every step should ship with a test** once the test runner exists (step 3.15), and the pull request should name the assessment IDs it closes.

## Milestones

These are suggested groupings, not commitments.

1. **Days 1–2:** all of Tier 0, then all of Tier 1.
2. **Week 1–2:** Tier 2 steps 2.1–2.6 (the P0 and security items) first, then the rest of Tier 2.
3. **Weeks 3–5:** Tier 3, starting with 3.1 (Next.js upgrade) and 3.3 (time zones).
4. **After that:** Tier 4, in the order the pilot needs (assessment Section 14). Tier 5 runs in parallel as business work.

## Summary

| Step | Assessment IDs | Issue | Severity | Depends on |
|---|---|---|---|---|
| **Tier 0 — verify and decide** | | | | |
| 0.3 | G24 | Which database holds auth data is unknown (done: `nobojatra`) | P1 | — |
| 0.4 | G01, R20 | Whether anyone still uses the legacy endpoints is unknown (done: none) | P0 | — |
| 0.5 | G03 | Rotation of the key leaked in `2f57aca` is unconfirmed (key revoked; history decision open) | P0 | — |
| 0.6 | R26 | Whether map tiles are fetched at the wrong size is unconfirmed (done: TomTom only) | — | — |
| 0.7 | C05, C07, G02, G05, G07, G09, G10, G17, P12 | Product decisions that gate fixes (decided) | — | — |
| **Tier 1 — trivial** | | | | |
| 1.1 | C01, G24 | Auth client hardcodes the production URL (done) | P1 | — |
| 1.2 | C02, P14 | No environment or setup documentation in the repository (done; latest version not committed) | P1 | — |
| 1.3 | C03, G02 | Nominatim User-Agent has no contact details (done) | P0 (interim) | — |
| 1.4 | P08, G24 | Four files override DNS for the whole process | P1 | — |
| 1.5 | P14, Appendix B | Lint picks up audit scripts; `any` and unused imports (done) | — | — |
| 1.6 | P10, G29 | CI runs no type-check, lint or build (done; lint non-blocking) | P1 | 1.5 |
| 1.7 | G03 | `shadcn` CLI is a runtime dependency (14 advisories) | P0 | — |
| 1.8 | C04 | No security headers | P1 | — |
| 1.9 | G18 | Saved trips accept another country's rate | P1 | — |
| 1.10 | G19 | Live traffic accepts unlimited stops; tile coordinates unchecked | P1 | — |
| 1.11 | G20 | Null bodies crash handlers; `"false"` enables a condition | P1 | — |
| 1.12 | G21 | Password digit rule skips `/change-password` | P1 | — |
| 1.13 | G13 | Distinct routes discarded on matching rounded metrics | P1 | — |
| 1.14 | G27 | Model load failure is cached; photo search offered outside Bangladesh | P2 | — |
| 1.16 | Section 22.1 | Secret comparison leaks length; comment wrong | — | — |
| 1.17 | R01, G25 | Older search responses overwrite newer ones | P1 | — |
| 1.18 | R04 | Stops keyed by array index | — | — |
| 1.19 | R05 | No swap control for origin and destination | — | — |
| 1.20 | R06 | Schedule bounds frozen when the form opens | — | — |
| 1.21 | R07 | Geolocation can hang indefinitely | — | — |
| 1.22 | R13, P14 | TomTom tiles uncredited; Mapbox credited when not used | — | — |
| 1.23 | R14 | Marker labels interpolated into raw HTML | — | — |
| 1.24 | R23 | Photo match shows an internal slug; scope never stated | — | — |
| 1.25 | R27 | Saved-trip form submits a hidden vehicle | — | — |
| 1.26 | R29 | Pausing a saved trip has no failure path | — | — |
| 1.27 | G05, G07, G34, R30, P14 | Copy claims more than the product does | P1 | — |
| 1.28 | P14 | Stale comments, Bangladesh-only icons, dead "Not verified" label | — | — |
| 1.29 | P12 | Scaffolding assets, no robots file, weekend pricing value | — | 0.7 |
| **Tier 2 — small** | | | | |
| 2.1 | G30 | Shared route cache leaks one user's labels to another | P0 | — |
| 2.2 | G01, R20 | Unprotected legacy APIs and collections (routes removed; models and collections remain) | P0 | 0.4 |
| 2.3 | G38, G02, G19 | Public geocoding and tile proxies; reverse geocoding unlimited | P1 | 2.19 |
| 2.5 | C02, G24 | No startup environment validation | P1 | — |
| 2.6 | G24 | Auth database name implicit (done) | P1 | 0.3 |
| 2.7 | G06 | Route change keeps a stale confirmed vehicle | P1 | — |
| 2.8 | G16 | Fare alerts compare different calculations | P1 | — |
| 2.9 | G33 | Disabled and expired conditions still cost provider calls | P1 | — |
| 2.10 | G37 | Deleted trips can still receive alerts | P2 | — |
| 2.11 | G11 | Fare source and provider attribution not shown | P1 | — |
| 2.12 | G12 | Ranking language claims certainty with missing data | P1 | — |
| 2.13 | G14 | Round trips rejected; long trips fail on alternatives | P1 | — |
| 2.14 | G15 | Nothing evaluates alerts while the app is closed | P1 | — |
| 2.15 | G25 | Planner form and results drift apart (Plan Again part done) | P1 | 1.17 |
| 2.16 | G27 | Stale photo inference; no decode limits | P2 | 1.14 |
| 2.17 | G28 | Camera embed over-permissioned; no offline state | P2 | — |
| 2.18 | G32 | Notification list skips records and misses updates | P2 | — |
| 2.19 | C09 | Session and cookie behavior entirely default | — | — |
| 2.20 | C05 | Email verification implemented but never used (decision: do not enforce for now) | P1 | 0.7 |
| 2.21 | C06 | Auth limits only per IP | P1 | — |
| 2.22 | C07 | Sign-up confirms which emails exist | P1 | 2.21 |
| 2.23 | P13 | Session and profile read several times per render | P2 | 2.19 |
| 2.24 | P01 | No persistent navigation | — | — |
| 2.25 | P03 | No loading, error or not-found boundaries | — | — |
| 2.26 | R22, G26 | Both modals inaccessible (photo-modal reset done) | — | — |
| 2.27 | P04 | Saved trips and conditions deleted without confirmation | — | 2.26 |
| 2.28 | R08 | Stop validation not shown per field | — | — |
| 2.29 | R10, R11 | No map recenter; unlabeled markers | — | 1.23 |
| 2.30 | R16, R17 | Fares unsortable; exclusions give no remedy | — | — |
| 2.31 | R21 | Saved trips: no sort, search or limit indicator | — | — |
| 2.32 | R26 | Tile size mismatch (done) | — | 0.6 |
| 2.33 | R28 | Non-JSON responses break client code | — | — |
| 2.34 | G09 | Rain alone can never reach "severe" | P1 | 0.7 |
| 2.35 | P12 | No manifest; one title for every page | — | — |
| **Tier 3 — medium** | | | | |
| 3.1 | G03 | Next.js 16.2.9 has critical advisories | P0 | 1.7 |
| 3.2 | C08 | Page access is a per-page convention | P1 | 3.1 |
| 3.3 | G04, G36, R09 | Trip times depend on server and browser zones | P1 | — |
| 3.4 | G20 | No shared request schemas | P1 | 1.11 |
| 3.5 | G07 | Unsupported traffic shown as live and light | P1 | 0.7 |
| 3.6 | G22, R18, R19 | History reads unbounded and unindexed | P2 | — |
| 3.7 | G23 | Saved-trip writes race; no migration system | P2 | — |
| 3.8 | G21 | Account deletion not transactional | P1 | — |
| 3.9 | G31 | Alert escalation and recovery lost | P1 | 2.9 |
| 3.10 | G08 | Traffic context refetched at every step | P1 | 2.12 |
| 3.11 | G26, R02, R03 | Accessibility and device performance untested | P1 | 2.26 |
| 3.12 | G35 | Unreachable route endpoints not detected | P2 | — |
| 3.13 | C04 | No Content-Security-Policy | P1 | 1.8 |
| 3.14 | P02, R12 | Light theme unreachable; tiles ignore theme | — | — |
| 3.15 | P10 | No automated tests | P1 | 1.6 |
| 3.16 | P11, G29 | No error tracking or fallback metrics | P1 | — |
| 3.17 | P06 | Nothing can be copied, exported or added to a calendar | — | 3.3 |
| 3.18 | R24, R25 | No shared UI primitives or feedback pattern | — | 2.26 |
| **Tier 4 — large** | | | | |
| 4.1 | G02 | Public Nominatim autocomplete breaks its usage policy | P0 | 0.7, 2.3 |
| 4.2 | G15, P05 | No durable evaluation or delivery | P1 | 2.14, 3.9 |
| 4.3 | G05, G06 | Confirmation recomputes; no immutable quote | P1 | 3.10 |
| 4.4 | G19, P09 | Budgets, limits and caches are per process | P1 | — |
| 4.5 | G08 | Traffic sampled on different roads with one departure time | P1 | 3.10 |
| 4.6 | G09 | Weather is current, not forecast | P1 | 3.3 |
| 4.7 | G17 | Countries are rectangles with one time zone | P1 | 0.7, 3.3 |
| 4.8 | G34 | Every vehicle priced on a car route | P1 | 4.7 |
| 4.9 | G22 | Searches, plans and journeys share one record | P2 | 3.6 |
| 4.10 | G29 | No monitoring, restore drill or privacy tooling | P1 | 3.16 |
| 4.11 | P07 | No internationalization | — | 3.18 |
| **Tier 5 — external** | | | | |
| 5.1 | G10 | Fares not calibrated against the market | P1 | 0.7 |
| 5.2 | G07 | No live traffic source for Bangladesh | P1 | 3.5 |
| 5.3 | G35 | No verified entrances or pickup points | P2 | 3.12 |
| 5.4 | G12 | Ranking is per route, with modeled ETAs | P1 | 4.3 |
| 5.5 | G27 | Image model has no provenance or evaluation | P2 | 2.16 |
| 5.6 | G28 | Camera feeds not operated or moderated | P2 | 2.17 |

---

## Tier 0 — Verify and decide

These are the caveats the assessment could not settle from the repository. None needs code, but later steps depend on the answers.

### 0.3 · G24 — Confirm which database holds auth data · P1 (done)

**Issue.** `authMongoClient.db()` takes the database name from `MONGODB_URI`. If the URI has no path, the driver uses `test`, while Mongoose writes to `MONGODB_DB` or `nobojatra`.

**Approach.**
- Check whether the production `MONGODB_URI` has a database path.
- In Atlas, list the databases that contain the `user`, `session`, `account` and `verification` collections.

**Result (24 September 2026).** The local `MONGODB_URI` has the path `/nobojatra`, so auth data and app data share one database. The cluster holds:

| Database | `user` | `session` | `account` | `verification` |
|---|---|---|---|---|
| `nobojatra` | 12 | 30 | 13 | 2 |
| `test` | 1 | 0 | 1 | — |

The single user in `test` is left over from early development, when the URI had no path. Still to confirm: that the `MONGODB_URI` on Render points at the same cluster (`main.zutwim7`) with the `/nobojatra` path.

**Acceptance criteria.**
- [x] The database that holds production auth data is recorded for step 2.6.
- [x] Nobody changes the database name before step 2.6. Changing it without a migration would orphan every account.

### 0.4 · G01, R20 — Confirm nobody uses the legacy endpoints, and export their data · P0 (done)

**Issue.** Nine unauthenticated legacy handlers read and write `places`, map routes, traffic readings and cameras. No code in the repository calls them, but an external script or old client might.

**Approach.**
- Search Render request logs for the last 30 days for `/api/places`, `/api/map_routes`, `/api/traffic` (excluding `/api/traffic/live`), `/api/camera` and `/api/test-mongo`.
- List the actual collection names with `db.getCollectionNames()`, count documents in each, and export them to backup storage.

**Result (24 September 2026).**
- No code in the repository or its git history calls the legacy routes. The only remaining caller of `/api/traffic*` is [lib/routing.ts](lib/routing.ts), which uses `/api/traffic/live`.
- Every legacy document was created on 15 July 2026, between 11:41 and 16:58 UTC, and nothing has been written since. This looks like one afternoon of manual testing.
- The app was tested by hand before the routes were removed.
- The legacy collections were exported as Extended JSON to `nobojatra-backups/legacy-2026-09-24/`, outside the repository:

| Collection | Documents |
|---|---|
| `places` | 1 |
| `map_routes` | 3 |
| `trafficdatas` | 3 |
| `cameras` | 1 |

**Acceptance criteria.**
- [x] Every legacy route's consumers are listed, or confirmed as none.
- [x] An export of each legacy collection exists, with document counts recorded.

### 0.5 · G03 — Confirm the leaked TomTom key was revoked · P0 (done)

**Issue.** The secret-scan workflow records that a live TomTom key was committed in `2f57aca` and is still in history. The source comment says it was rotated, but there is no evidence.

**Approach.** In the TomTom developer portal, confirm the old key is deleted or disabled and the current key differs. Decide whether to rewrite history; if not, keep the key revoked permanently.

**Result (24 September 2026).** The key's owner deleted it in the TomTom developer portal. A test request with the leaked key then returned `401`. The same request with the current key returned `200` and a valid tile, which confirms the two keys differ and the app is unaffected.

**Acceptance criteria.**
- [x] The old key is confirmed revoked, with the date recorded (not the key).
- [ ] A decision on history rewriting is recorded.

### 0.6 · R26 — Confirm map tile sizing · — (done)

**Issue.** The TomTom proxy requests 512-pixel tiles, and Mapbox's styles tile API also returns 512-pixel tiles by default, but the Leaflet layers use the 256-pixel grid. That likely means four times the bytes and half-size labels.

**Approach.** In a browser, compare one tile's network size and label size with and without `tileSize={512}` and `zoomOffset={-1}`, for OSM, Mapbox (if a token is set) and TomTom.

**Result (24 September 2026).** The same TomTom flow tile (z13, central London) was fetched at both sizes:

| Tile size | Transfer size | Result in Leaflet's 256 grid |
|---|---|---|
| `tileSize=512` | 163 KB | Squeezed into the slot, so lines draw at half width |
| `tileSize=256` | 66 KB | Drawn at its intended size |

Both sizes cover the same area.

Settings for each tile source:
- **OpenStreetMap:** 256 is native. No change.
- **TomTom:** request `tileSize=256` from the proxy.
- **Mapbox:** not used. The team decided on 24 September 2026 not to set `NEXT_PUBLIC_MAPBOX_TOKEN`. If Mapbox is ever enabled, it needs `tileSize={512}` and `zoomOffset={-1}`. Its `traffic-day-v2` layer is also a full map style rather than a transparent overlay, so it cannot be stacked over the base map.

**Acceptance criteria.**
- [x] The correct settings for each tile source are recorded for step 2.32.

### 0.7 · Product decisions that gate fixes · — (done)

**Issue.** Several fixes need a decision the code cannot make.

**Approach.** Record an owner and a decision for each:

| Decision | Needed by | Options |
|---|---|---|
| Enforce email verification (C05) | 2.20 | Enforce for new accounts only; enforce for everyone, with existing users verifying at next sign-in; or do not enforce |
| Account-enumeration trade-off (C07) | 2.22 | Neutral sign-up response with an email to the existing owner; or keep the message with strict limits |
| Bangladesh weekend for pricing (P12) | 1.29 | `[5]` (Friday) as today, or `[5, 6]` |
| Wording for "Confirm" (G05) | 1.27 | For example "Save travel plan" and "Plan saved" until real booking exists |
| Who reviews weather hazard rules (G09) | 2.34 | A named reviewer with local weather knowledge |
| Pathao-named estimator ownership and terms (G10) | 5.1 | Keep with verified terms, relabel as a third-party estimate, or remove |
| Place-search provider shortlist (G02) | 4.1 | Licensed hosted provider, or self-hosted search |
| Bangladesh traffic source (G07) | 3.5, 5.2 | Hide traffic in Bangladesh, or pursue a licensed or fleet source |
| Launch service areas (G17) | 4.7 | Which cities or corridors are supported at launch |

**Decisions (24 September 2026).** The owner for every row is the team.

| Decision | Needed by | Decision | What it means for the step |
|---|---|---|---|
| Enforce email verification (C05) | 2.20 | **Do not enforce, for now.** | While emails come from Resend's testing sender, they reach only the Resend account owner, so enforcing would lock every other user out. Revisit once the team has a domain to verify in Resend. The preferred option then is to enforce for everyone, with existing users verifying at their next sign-in. |
| Account-enumeration trade-off (C07) | 2.22 | **Keep the message** ("An account with this email already exists"). | Do not build the neutral response. Rely on the per-account limits in 2.21. |
| Bangladesh weekend for pricing (P12) | 1.29 | **Friday and Saturday**: `nonPeakWeekdays: [5, 6]`. | Change the value in [lib/country-config.ts](lib/country-config.ts), and delete the comment that defers the decision. |
| Wording for "Confirm" (G05) | 1.27 | **Reword** the button and the pages so nothing implies a ride was booked. | For example: "Confirm" → "Save this option", "Trip confirmed" → "Plan saved", "Confirmed trips" → "Saved plans". Keep the wording consistent across the fares, best-options, summary and history pages. |
| Who reviews weather hazard rules (G09) | 2.34 | **Keep the rules as they are,** with wording that presents them as guidance. | No threshold changes, and no reviewer needed. Word warnings as advice (for example "may be unsafe"), and make clear the rules are general guidance, not an official weather warning. |
| Pathao-named estimator ownership and terms (G10) | 5.1 | **Keep as is.** | No relabelling. The team accepts the naming risk while the project is a demo. Revisit before any public launch. |
| Place-search provider shortlist (G02) | 4.1 | **Keep Nominatim.** | No provider change. If the public server blocks the app, first reduce the request rate (debounce and cache, step 2.3). |
| Bangladesh traffic source (G07) | 3.5, 5.2 | **Show "not available".** | In Bangladesh, hide the traffic overlay and the delay figures, and show "Live traffic isn't available in this area" instead of zero delays. No new source for now (5.2 on hold). |
| Launch service areas (G17) | 4.7 | **Not applicable for now.** | There is no launch planned. Revisit if the project goes to production. |

**Acceptance criteria.**
- [x] Each row has a named owner and a recorded decision, or a date by which one will be made.

---

## Tier 1 — Trivial fixes

Each step should take under an hour.

### 1.1 · C01, G24 — Stop hardcoding the auth URL · P1 (done)

**Issue.** [lib/auth-client.ts](lib/auth-client.ts) sets `baseURL: "https://nobojatra.onrender.com"`. Sign-in, sign-up, sign-out and password reset therefore fail on every other origin: local, staging, previews and any custom domain.

**Approach.**
- Remove the `baseURL` line. The client then uses `NEXT_PUBLIC_BETTER_AUTH_URL` if set, otherwise same-origin `/api/auth`.
- Keep `BETTER_AUTH_URL` set on the server for each environment.
- If the Render problem that commit `796ef7f` fixed comes back, set `NEXT_PUBLIC_BETTER_AUTH_URL` in Render's environment rather than in code.

**Done (24 September 2026).** The `baseURL` line was removed from [lib/auth-client.ts](lib/auth-client.ts). Commit `796ef7f` had only swapped one hardcoded URL (`localhost:3000`) for another, so same-origin covers both environments. After a clean build:
- the client bundle contains no `onrender.com` URL;
- against the local server, `/api/auth/sign-in/email` answers wrong credentials with `401 INVALID_EMAIL_OR_PASSWORD`, and `/api/auth/get-session` returns `200`.

**Acceptance criteria.**
- [x] Sign-in and sign-out work in a browser on `localhost:3000` (confirmed 24 September 2026). Password reset was not tested separately, because its email reaches only the Resend account owner.
- [x] Production sign-in still works (confirmed 24 September 2026).
- [x] No production hostname appears in `lib/`.

### 1.2 · C02, P14 — Commit environment and setup documentation · P1 (done)

**Issue.** `.gitignore` (`.env*`) excludes `.env.example`, which has never been committed. The current README names no environment variables and has no setup steps.

**Approach.**
- Add `!.env.example` to `.gitignore`.
- Commit `.env.example` with all sixteen variables, grouped as required or optional, each with a one-line note on what happens when it is unset (the C02 table in the assessment has the wording).
- Add a README "Local setup" section covering Node version, `pnpm install`, `.env`, `pnpm seed:rates`, `pnpm dev`, and the Resend sender caveat.

**Progress (24 September 2026).**
- `.gitignore` now has `!.env.example`.
- `.env.example` lists all sixteen variables, grouped as required, recommended and optional, with a note on each saying what happens when it is unset. `NEXT_PUBLIC_MAPBOX_TOKEN` is listed commented out, because the team does not use Mapbox (0.6).
- The README has a "Local Setup" section with a matching variable table, and the Resend sender caveat is under Known Issues.
- An earlier version of `.env.example` is committed. The sixteen-variable version is not committed yet.

**Acceptance criteria.**
- [ ] `git ls-files .env.example` lists the file, and it names all sixteen variables. The file is tracked; this passes once the sixteen-variable version is committed.
- [ ] A new contributor can follow the README from a fresh clone to a running planner.

### 1.3 · C03, G02 — Identify the app to Nominatim · P0 (interim) (done)

**Issue.** Both geocoding routes fall back to the User-Agent `NoboJatra/1.0`, which has no contact route, as Nominatim's policy requires.

**Approach.**
- Change the fallback to include the site URL and a monitored contact address, for example `NoboJatra/1.0 (+https://nobojatra.onrender.com; <real address>)`. The footer address is a placeholder (G29), so use a real one.
- Move the duplicated `getNominatimConfig` into one module.
- Document `NOMINATIM_USER_AGENT` and `NOMINATIM_BASE_URL` (done in 1.2).

**Acceptance criteria.**
**Done (24 September 2026).**
- The default User-Agent is now `NoboJatra/1.0 (+https://github.com/Sakif16/nobojatra)`. The team chose the public repository URL as the contact route, through GitHub Issues, so no email address is published in the code.
- A private email can be added through `NOMINATIM_USER_AGENT` in the deployment environment.
- `getNominatimConfig` now lives in [lib/nominatim.ts](lib/nominatim.ts), and both geocoding routes import it.
- A reverse-geocode request with the new User-Agent returned `200`.

**Acceptance criteria.**
- [x] Requests to Nominatim carry a User-Agent with a working contact. This holds wherever `NOMINATIM_USER_AGENT` is unset; check Render's value.
- [x] One helper defines the configuration.

### 1.4 · P08, G24 — Remove the process-wide DNS overrides · P1

**Issue.** Four files call `require("node:dns/promises").setServers([...])` at module scope, in production too: [app/(main)/page.tsx:10](app/(main)/page.tsx#L10), [app/api/camera/route.ts:4](app/api/camera/route.ts#L4), [app/api/places/route.ts:4](app/api/places/route.ts#L4) and `app/api/places/[userId]/route.ts:4`. They are also four of the lint errors.

**Approach.** Delete the four lines. [instrumentation.ts](instrumentation.ts) already applies the development-only workaround.

**Acceptance criteria.**
- [ ] `git grep setServers` finds only `instrumentation.ts`.
- [ ] A production build connects to Atlas.
- [ ] The four `no-require-imports` errors are gone.

### 1.5 · P14, Appendix B — Clear the easy lint errors · —

**Issue.** Lint reports 14 errors and 4 warnings. Seven errors come from the `.cjs` audit scripts, one from an `any`, and the four warnings from unused `mongoose` imports.

**Approach.**
- Add `"docs/**"` to `globalIgnores` in [eslint.config.mjs](eslint.config.mjs).
- Type the TomTom response in [lib/traffic-service.ts:440](lib/traffic-service.ts#L440) with a small interface for the fields the code reads.
- Remove the unused `mongoose` default imports from the four legacy models (or delete the models in step 2.2).
- The remaining two `set-state-in-effect` errors are fixed in steps 2.15 and 2.26.

**Done (25 September 2026).** Lint went from 11 errors and 4 warnings to 3 errors and no warnings:
- `docs/**` is added to `globalIgnores` in [eslint.config.mjs](eslint.config.mjs), which clears 7 errors from the audit scripts.
- The TomTom response in [lib/traffic-service.ts](lib/traffic-service.ts) is typed with `TomTomRouteResponse`, which clears 1 error.
- The unused `mongoose` default imports are removed from the four legacy models, which clears 4 warnings.

The remaining errors:
- the two `set-state-in-effect` errors (`ImageLocationModal.tsx:39` and `MapDashboardSection.tsx:273`), which steps 2.15 and 2.26 fix;
- the `require()` at `app/(main)/page.tsx:10`, which step 1.4 deletes.

**Acceptance criteria.**
- [ ] Lint reports only the two `set-state-in-effect` errors until 2.15 and 2.26 land, then none. The `set-state-in-effect` errors are gone, fixed in 2.15 and 2.26. One error remains: the `require()` at `app/(main)/page.tsx:10`, which step 1.4 removes.

### 1.6 · P10, G29 — Add a CI quality gate · P1

**Issue.** The only workflow runs gitleaks. Nothing checks types, lint or build.

**Approach.**
- Add a workflow that runs on pull requests and pushes to `main`: `pnpm install --frozen-lockfile`, `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm build`, with placeholder environment values where the build needs them.
- Make the lint job non-blocking until steps 2.15 and 2.26 land, then blocking.
- Add `engines` and `packageManager` to `package.json` so CI and local installs match.
- Add a `permissions: contents: read` block to both workflows, and pin the gitleaks image to a digest rather than `latest`.

**Done (25 September 2026).**
- [.github/workflows/ci.yml](.github/workflows/ci.yml) runs install (`--frozen-lockfile`), type-check, lint and build on pull requests and on pushes to `main`. It uses Node 24 and placeholder values for `MONGODB_URI`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.
- Lint has `continue-on-error: true`.
- `package.json` now has `engines.node: ">=20.9.0"` and `packageManager: "pnpm@11.18.0"`.
- Both workflows have `permissions: contents: read`.
- Gitleaks is pinned to `v8.30.1@sha256:c00b6bd0…abbb7f`.

This was simulated locally in a copy of the project without `.env`. Install, type-check and build passed. Lint failed, but did not block, on the known `require()` in `app/(main)/page.tsx`. A planted type error made the type-check exit with code 2.

**Acceptance criteria.**
- [ ] A pull request with a type error fails CI. The local simulation fails as expected; confirm on the first real pull request.
- [ ] After 2.15 and 2.26, a pull request with a lint error fails CI. Lint stays non-blocking until then. To make it blocking, remove `continue-on-error` from the Lint step. Lint also needs step 1.4's `page.tsx` line gone before it can pass.

### 1.7 · G03 — Move the `shadcn` CLI out of runtime dependencies · P0

**Issue.** `shadcn` is a scaffolding CLI listed under `dependencies`. It alone brings 14 of the 32 production advisories (`hono`, `fast-uri`, `qs`, `js-yaml`).

**Approach.** Move `shadcn` to `devDependencies` (or remove it and use `pnpm dlx shadcn` when needed), then re-run `pnpm audit --prod`.

**Acceptance criteria.**
- [ ] `pnpm audit --prod` no longer lists `hono`, `fast-uri`, `qs` or `js-yaml`.
- [ ] Build and lint still pass.

### 1.8 · C04 — Send the basic security headers · P1

**Issue.** [next.config.ts](next.config.ts) is empty, so no security headers are sent. The app embeds a third-party iframe and requests geolocation.

**Approach.** Add an `async headers()` rule for all paths, plus `poweredByHeader: false`:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000` (without `preload`)
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`

The `camera=()` rule also removes the camera permission the embed requests. Check with the embed's owner whether contributors stream through the embed; if they do, allow that origin explicitly. The CSP comes later (3.13).

**Acceptance criteria.**
- [ ] `curl -I` on `/` and on an API route shows all five headers and no `X-Powered-By`.
- [ ] Geolocation still works in the planner.

### 1.9 · G18 — Enforce the country on saved-trip vehicle rates · P1

**Issue.** `loadPreferredRate` ([lib/saved-trips.ts:264-267](lib/saved-trips.ts#L264-L267)) and the evaluator's `loadRateColumns` ([lib/alert-evaluator/context.ts:79-84](lib/alert-evaluator/context.ts#L79-L84)) look rates up by ID only. A direct API call can attach a UK rate to a Bangladesh trip.

**Approach.** Pass the trip's country into both functions and add `country` to both queries. In `updateSavedTrip`, use `record.country`.

**Acceptance criteria.**
- [ ] Creating or updating a Bangladesh trip with a UK `vehicleRateId` returns a 400 before any provider call.
- [ ] Valid same-country rates still work.
- [ ] The evaluator treats an existing cross-country record as "fare unavailable".

### 1.10 · G19 — Cap live-traffic stops and validate tile coordinates · P1

**Issue.** `/api/traffic/live` accepts any number of stops; each adds a TomTom call. The tile proxy checks only that `z`, `x` and `y` are digits.

**Approach.**
- In [app/api/traffic/live/route.ts](app/api/traffic/live/route.ts), require `stops` to be an array of at most 8 points. The planner sends up to eight sampled intermediate points, so `MAX_STOPS` (6) is too low.
- In the tile route, require `0 ≤ z ≤ 22` and `0 ≤ x, y < 2^z`.

**Acceptance criteria.**
- [ ] 9 stops, or a non-array `stops`, returns 400 with no TomTom call.
- [ ] The planner's traffic preview still works.
- [ ] `/api/tiles/tomtom/30/0/0` and `/api/tiles/tomtom/2/9/0` return 400.

### 1.11 · G20 — Add the quick input guards · P1

**Issue.**
- [validate/route.ts:27](app/api/trip-input/validate/route.ts#L27) throws on a `null` body.
- Condition PATCH uses `Boolean(body.isActive)`, so the string `"false"` enables a condition.
- `/api/trip-input/current-location` with no query reverse-geocodes (0, 0), because `Number(null)` is 0.
- Profile saved places accept a `null` latitude as 0.

**Approach.**
- Reject non-object bodies with 400 in `validate` and in the condition routes.
- Accept `isActive` only when it is a boolean.
- Treat `null` and empty strings as missing before calling `Number()` in `isValidLatitude`/`isValidLongitude` and in the profile validator; add range checks for saved places.

The full schema work is step 3.4.

**Acceptance criteria.**
- [ ] `null`, array and string bodies return 400 on these routes.
- [ ] `{"isActive":"false"}` returns 400.
- [ ] `current-location` with no query returns 400.
- [ ] A saved place with `lat: null` is rejected.

### 1.12 · G21 — Apply the password rule to password changes · P1

**Issue.** The digit rule in [lib/auth.ts:188](lib/auth.ts#L188) runs only for `/sign-up/email` and `/reset-password`. Better Auth's `/change-password` endpoint skips it.

**Approach.** Add `/change-password` to the hook and read `newPassword` for it.

**Acceptance criteria.**
- [ ] A direct `/api/auth/change-password` call with a digit-free new password returns 400 with `PASSWORD_MISSING_NUMBER`.

### 1.13 · G13 — Stop discarding distinct routes · P1

**Issue.** `limitUniqueRoutes` ([lib/route-service.ts:250-268](lib/route-service.ts#L250-L268)) drops a route whenever its rounded distance and time match an earlier one, even if the geometry differs.

**Approach.** Remove the `metricSignatures` shortcut. `areDuplicateRoutes` already checks the metric tolerance before comparing geometry.

**Acceptance criteria.**
- [ ] The first harness's "distinct geometries, same rounded metrics" case returns two routes.
- [ ] The same road with small coordinate noise still returns one.
- [ ] The result never exceeds three routes.

### 1.14 · G27 — Retry model loading and scope photo search · P2

**Issue.**
- A failed model load is cached in `modelPromise` until reload ([lib/image-classifier.ts:35-45](lib/image-classifier.ts#L35-L45)).
- Any image size is accepted.
- The photo button appears in the US and UK, where no landmark is supported.

**Approach.**
- Clear `modelPromise` when the promise rejects.
- Reject files over 10 MB before decoding.
- Render the camera buttons in `RouteFinderForm` only when the active country is BD.

**Acceptance criteria.**
- [ ] After a simulated load failure, a second attempt retries the download.
- [ ] A 20 MB file shows a size error.
- [ ] No camera button appears in US or UK mode.

### 1.16 · Section 22.1 — Compare the evaluation secret properly · —

**Issue.** [app/api/alerts/evaluate/route.ts:25-34](app/api/alerts/evaluate/route.ts#L25-L34) returns early on a length mismatch, which reveals the secret's length, while the comment claims the opposite. The risk is small for a long random secret.

**Approach.** Hash both values with SHA-256 and compare the digests with `crypto.timingSafeEqual`. Correct the comment.

**Acceptance criteria.**
- [ ] Right secret: 200. Wrong secret of any length: 401.
- [ ] No early return depends on length.

### 1.17 · R01, G25 — Ignore stale place-search responses · P1

**Issue.** [components/map/PlaceAutocomplete.tsx:67-81](components/map/PlaceAutocomplete.tsx#L67-L81) debounces requests but never cancels one already in flight, so an older response can overwrite a newer one.

**Approach.**
- Give `searchPlaces` an optional `AbortSignal`.
- In the effect, create an `AbortController`, abort it in the cleanup function, and ignore `AbortError`.

**Acceptance criteria.**
- [ ] With the network throttled, typing "Dhan" and then "Dhanmondi" always ends with results for "Dhanmondi".
- [ ] Switching country mid-request shows only the new country's results.

### 1.18 · R04 — Key stops by a stable ID · —

**Issue.** `stops.map((stop, i) => <div key={i}>)` in [components/map/RouteFinderForm.tsx:479-482](components/map/RouteFinderForm.tsx#L479-L482) is in a reorderable list, so field state follows the position rather than the stop.

**Approach.** Add `id: crypto.randomUUID()` to `StopField` when a stop is created (including from `initialValues`), and use it as the key.

**Acceptance criteria.**
- [ ] With a search panel open on stop 1, moving stop 1 down keeps the panel with that stop.

### 1.19 · R05 — Add a swap control · —

**Issue.** There is no way to reverse origin and destination.

**Approach.** Add an icon button with `aria-label="Swap origin and destination"` beside the shared rail. It swaps the two place values and labels.

**Acceptance criteria.**
- [ ] One click reverses both fields, and the next search runs in the reverse direction.
- [ ] The button can be reached and used with the keyboard.

### 1.20 · R06 — Recompute the schedule bounds · —

**Issue.** `scheduleBounds` is computed once, in a `useState` initializer, so a form left open accepts a past time.

**Approach.** Compute the bounds when Schedule is selected and again on submit. On submit, reject a time earlier than now plus one minute with a clear message. The server check already exists. The time-zone part is step 3.3.

**Acceptance criteria.**
- [ ] After the form sits open for ten minutes, the picker's minimum moves forward, and a past time is rejected before any request.

### 1.21 · R07 — Time out geolocation · —

**Issue.** `getCurrentPosition` has no options, so a weak GPS fix can leave the button on "Locating…" forever.

**Approach.** Pass `{ timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }`. In the error callback, tell timeout apart from permission denial.

**Acceptance criteria.**
- [ ] With location simulated as unavailable, the button recovers within about 10 seconds with a "could not get your location" message.

### 1.22 · R13, P14 — Credit the tile providers correctly · —

**Issue.**
- The TomTom traffic overlay has no attribution.
- The base layer credits Mapbox even when it serves OpenStreetMap tiles.
- The OpenStreetMap URL uses the legacy `{s}` subdomains.

**Approach.**
- Build each `TileLayer`'s attribution from the source actually used: "© OpenStreetMap contributors" for OSM, "© Mapbox © OpenStreetMap" for Mapbox, and "© TomTom" for the TomTom overlay. Use the exact wording each provider's current terms require.
- Change the OSM URL to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.

**Acceptance criteria.**
- [ ] With and without `NEXT_PUBLIC_MAPBOX_TOKEN`, and with the traffic layer on, the attribution names exactly the sources on screen.

### 1.23 · R14 — Escape marker labels · —

**Issue.** `numberedIcon` in [components/map/RouteMap.tsx:26-42](components/map/RouteMap.tsx#L26-L42) puts its label into an HTML string unescaped. It is safe today, but step 2.29 will put user-supplied place names there.

**Approach.** Escape `& < > " '` in the label before building the HTML, or build the element with DOM APIs and pass it as `html`.

**Acceptance criteria.**
- [ ] A label of `<img src=x onerror=alert(1)>` renders as text.

### 1.24 · R23 — Name photo matches and say what can be recognized · —

**Issue.** The photo modal shows the internal class slug (`bracu_campus`), hides the score when no match clears the threshold, and never says which landmarks it can recognize.

**Approach.**
- Add a display name to each entry in [lib/image-location-classes.ts](lib/image-location-classes.ts) and show that instead of the slug.
- Below the threshold, show the best score.
- Add a line under the drop zone naming the three recognizable landmarks.

**Acceptance criteria.**
- [ ] A match shows "BRAC University campus (82%)", not `bracu_campus`.
- [ ] The three landmarks are named before any upload.

### 1.25 · R27 — Keep the saved-trip form's vehicle valid · —

**Issue.** Raising the passenger count hides small vehicles, but `vehicleId` keeps a hidden selection and submits it. Clearing the passenger field submits 0 ([components/saved-trips/SavedTripForm.tsx:147-176](components/saved-trips/SavedTripForm.tsx#L147-L176)).

**Approach.** Clear `vehicleId` when the selected vehicle leaves the filtered list. Clamp the passenger count to 1–8 on change, treating empty input as 1.

**Acceptance criteria.**
- [ ] Choosing a 1-seat vehicle and then setting 3 passengers resets the vehicle to "No vehicle".
- [ ] An empty passenger field never submits 0.

### 1.26 · R29 — Handle pause failures · —

**Issue.** `toggleTrip` in [components/saved-trips/SavedTripsManager.tsx:80-93](components/saved-trips/SavedTripsManager.tsx#L80-L93) ignores failed responses and parse errors.

**Approach.** Wrap the call in `try/catch`, check `response.ok`, show the error in the existing error area, and disable the button while the request is pending.

**Acceptance criteria.**
- [ ] A 500 from the PATCH shows "Could not pause this trip" and leaves the state unchanged.

### 1.27 · G05, G07, G34, R30, P14 — Stop the copy overclaiming · P1

**Issue.** Several screens promise more than the product does:
- "Confirm" and "Your trip has been confirmed" suggest a booking.
- The sign-in panel and planner say "Live traffic", including in Bangladesh, where the provider has no live coverage.
- Footer and home links label the camera page "Live traffic".
- "Check now" says trips are re-checked every 15 minutes.
- The feature tile names Pathao and CNG in every country, and calls the ranking "AI".
- Trip history labels summed estimates "Total cost".
- Vehicle options present car-route timings as if they applied to each vehicle.

**Approach.** Apply the wording decided in 0.7:
- "Confirm" → "Save travel plan"; "Your trip has been confirmed" → "Travel plan saved"; "Conditions when you booked" → "Conditions when you saved".
- In Bangladesh, drop "Live" from traffic labels (step 3.5 removes the data itself).
- Rename the camera links "Live cams".
- "Check now" result: "Trips are checked while the app is open."
- Build the fare tile's provider list from the active country's rates; rename "AI route ranking" to "Ranked vehicle options".
- "Total cost" → "Estimated total".
- Add "Times are based on a car route" to the fare and best-options pages.

**Acceptance criteria.**
- [ ] No screen uses "confirmed", "booked" or "AI" for a saved estimate.
- [ ] No Bangladesh screen says "live traffic".
- [ ] UK users see no mention of Pathao or CNG.

### 1.28 · P14 — Fix stale comments, icons and the verification label · —

**Issue.**
- Five comments describe code that no longer exists (listed in assessment P14).
- Fare icons exist only for Bangladesh products.
- The profile shows "Not verified" with no way to act on it.

**Approach.**
- Correct or delete the five comments.
- Key the fare icons by vehicle class (two-wheeler, CNG, car, XL) instead of provider.
- Hide the verification status until step 2.20 adds a way to act on it.

**Acceptance criteria.**
- [ ] None of the five stale statements remain.
- [ ] US and UK options show class-appropriate icons.
- [ ] No dead "Not verified" label is shown.

### 1.29 · P12 — Remove leftovers and apply the weekend decision · —

**Issue.** The Next.js scaffolding SVGs are still shipped, there is no robots file, and Bangladesh's non-peak weekend is Friday only, pending a decision.

**Approach.**
- Delete `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg` and `window.svg`.
- Add `app/robots.ts` that disallows everything except the sign-in and sign-up pages.
- Set `nonPeakWeekdays` for Bangladesh to the value decided in 0.7.

The `/api/test-mongo` removal is part of step 2.2.

**Acceptance criteria.**
- [ ] Only `brand-icon.png` remains in `public/`.
- [ ] `/robots.txt` is served.
- [ ] A Saturday Dhaka departure is priced according to the decision.

---

## Tier 2 — Small fixes

Each step should take up to a day. Steps 2.1–2.6 are the P0 and security items and should go first.

### 2.1 · G30 — Stop sharing private labels through the route cache · P0

**Issue.** The route cache in [app/api/trip-input/routes/route.ts](app/api/trip-input/routes/route.ts) is keyed by coordinates only, but stores routes whose legs carry the first caller's place labels. A second user searching the same coordinates gets those labels back, and they are saved to that user's history.

**Approach.**
- Call `fetchRouteSuggestions` with label-free waypoints, so cached routes contain only geometry and metrics.
- Add a helper that copies the cached routes and sets each leg's `fromLabel` and `toLabel` from the current request's origin, stops and destination. Apply it on both the cache-hit and cache-miss paths, before responding and before `createTripHistoryRecord`.
- Add the routing profile (`driving-car`) and a version constant to the cache key.
- Move the rate-limit check before the cache lookup, so cache hits also count.
- Deploying restarts the process, which clears the in-memory cache.
- Existing history rows cannot be traced to their original labels; record that in the privacy log.

**Acceptance criteria.**
- [ ] The second harness's cross-user case returns and saves user B's own label on a cache hit.
- [ ] Concurrent A/B requests, and rounded-coordinate collisions, also keep labels separate.
- [ ] The cached value contains no label fields.
- [ ] Cache hits count towards the rate limit.

### 2.2 · G01, R20 — Retire the legacy APIs and collections · P0

**Depends on:** 0.4.

**Issue.** Nine unauthenticated handlers read and write legacy places, routes, traffic readings and cameras, and `/api/test-mongo` exposes database details. No product code uses any of them.

**Approach.**
- Delete these route files:
  - `app/api/places/route.ts` and `app/api/places/[userId]/route.ts`
  - `app/api/map_routes/route.ts`, `[routeId]/route.ts` and `[routeId]/bounds/route.ts`
  - `app/api/traffic/route.ts`, `batch/route.ts`, `[routeId]/route.ts` and `[routeId]/peak-hours/route.ts` (keep `app/api/traffic/live/route.ts`)
  - `app/api/camera/route.ts` and `app/api/test-mongo/route.ts`
- If uptime monitoring needs an endpoint, add `/api/health` that returns `{ ok: true }` and nothing about the database.
- Delete `models/Place.ts`, `Map_route.ts`, `TrafficData.ts` and `Camera.ts`. Remove the unused `ref: "Map_route"` fields from `TripHistory` and `Alert`.
- In [lib/account-cleanup.ts](lib/account-cleanup.ts), delete legacy rows by raw collection name, using the names found in 0.4. Alternatively, drop the collections once the export is confirmed and remove those steps.

**Progress (24 September 2026).** The 11 route files are deleted, and `pnpm build` passes. Against the built app, every deleted path returns 404 to anonymous `GET` and `POST` calls, and `/api/traffic/live` returns 401 to anonymous callers. No `/api/health` was added. Still to do:
- delete the four models;
- rework [lib/account-cleanup.ts](lib/account-cleanup.ts), which still imports `Place`, `Map_route` and `TrafficData`;
- drop the collections.

**Acceptance criteria.**
- [x] Every deleted path returns 404 to anonymous callers. Signed-in callers were not tested.
- [x] `/api/traffic/live` still works.
- [ ] Account deletion still removes any remaining legacy rows (tested with disposable data).
- [ ] Lint has no warnings from the removed models.

### 2.3 · G38, G02, G19 — Close the public geocoding and tile proxies · P1

**Depends on:** 2.19 (session cookie cache), so the session check on every tile request is cheap.

**Issue.**
- `/api/trip-input/autocomplete`, `/current-location`, `/validate` and `/api/tiles/tomtom/...` are public. Their stated reason, a landing page, no longer exists.
- Reverse geocoding has no rate limit at all.
- Neither Nominatim call has a timeout, and both return upstream error bodies to the caller.

**Approach.**
- Require a session on all four routes and return 401 otherwise. Same-origin tile requests already send the cookie.
- Share one global Nominatim limiter between autocomplete and reverse geocoding.
- Add `AbortSignal.timeout(5000)` to both calls.
- Replace upstream error bodies with a fixed message, and log the detail server-side.
- Correct the comments in the autocomplete route and [lib/geocode.ts](lib/geocode.ts).

**Acceptance criteria.**
- [ ] Anonymous requests to all four routes return 401 without contacting a provider.
- [ ] The planner, saved-trip form and photo modal still search.
- [ ] A burst of 100 reverse-geocode calls produces at most 60 upstream requests a minute.
- [ ] A stalled upstream returns within about 6 seconds.

### 2.5 · C02, G24 — Validate the environment at startup · P1

**Issue.** Only `MONGODB_URI` is checked at startup. A missing secret or provider key surfaces later as a silent degradation.

**Approach.**
- Add `lib/env.ts`, called from `register()` in [instrumentation.ts](instrumentation.ts) for the Node runtime.
- In production, fail startup when any of these is missing: `MONGODB_URI`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ORS_API_KEY`, `OPENWEATHER_API_KEY`.
- Log one line for each missing optional variable, naming the degradation (for example, "TOMTOM_API_KEY unset: traffic unavailable").

**Acceptance criteria.**
- [ ] A production start without `BETTER_AUTH_SECRET` fails with a clear message.
- [ ] A development start lists the missing optional variables.
- [ ] No request path needs to discover a missing variable.

### 2.6 · G24 — Pin the auth database name · P1

**Depends on:** 0.3.

**Issue.** `authMongoClient.db()` uses whatever database the URI implies, possibly `test`, while app data goes to `nobojatra`.

**Approach.**
- If 0.3 found auth data in the app database, pass that name explicitly: `authMongoClient.db(MONGODB_DB)`.
- If it found auth data in `test`, choose between two options and record the choice:
  - pin `db("test")` explicitly and document why; or
  - in a maintenance window, copy the auth collections into the app database, verify, then switch.
- Take a backup either way, and never change the name without the migration.

**Done (24 September 2026).** Step 0.3 found auth data in `nobojatra`. `MONGODB_DB` is now exported from [lib/mongodb.ts](lib/mongodb.ts), and [lib/auth.ts](lib/auth.ts) calls `authMongoClient.db(MONGODB_DB)`. Both clients now read the same setting, and no data moves.

**Acceptance criteria.**
- [x] The auth database name is explicit in code and documented.
- [ ] Existing users can sign in after deployment.
- [ ] Local, staging and production each use the intended database.

### 2.7 · G06 — Clear a stale selection when the route changes · P1

**Issue.** `updateSelectedTripRoute` ([lib/trip-history.ts:321-365](lib/trip-history.ts#L321-L365)) changes the route but keeps `selectedVehicle`, `selectionSnapshot` and `selectedAt`. The summary can then combine route B with route A's fare.

**Approach.** When the new `routeId` differs from the current one, set all three fields to `null` in the same save. Immutable plan revisions come later, in step 4.3.

**Acceptance criteria.**
- [ ] Confirming route A and then selecting route B leaves the summary with "No vehicle confirmed yet".
- [ ] Confirming route B shows B's fare.
- [ ] Re-selecting the same route keeps the selection.

### 2.8 · G16 — Make fare alerts compare like with like · P1

**Issue.** The baseline is priced without weather and traffic adjustments ([lib/saved-trips.ts:308-333](lib/saved-trips.ts#L308-L333)); later evaluations include them ([lib/alert-evaluator/context.ts:159-171](lib/alert-evaluator/context.ts#L159-L171)). Bad weather alone can therefore look like a price change.

**Approach.**
- Define a fare alert as a change in the underlying price.
- In the evaluator, compute the comparison fare without the adjustment context, as the baseline does. Keep the adjusted fare for the message text only.
- When the fare source differs from the baseline's (live estimator versus rate card), return "unknown" instead of a percentage.
- Add a small hysteresis margin, for example re-arm only once the change falls below 80% of the threshold.

**Acceptance criteria.**
- [ ] With unchanged rates and severe weather, no fare alert fires.
- [ ] A 20% rate-card increase fires once.
- [ ] A change of source produces no alert and does not reset `lastState`.

### 2.9 · G33 — Evaluate only active, current conditions · P1

**Issue.** `findDueTrips` selects any trip with at least one condition, even if all are disabled or the scheduled departure has passed. Every evaluation fetches routing, traffic, weather and fare data, whether or not a condition needs it.

**Approach.**
- In [lib/alert-evaluator/index.ts:126-151](lib/alert-evaluator/index.ts#L126-L151), replace `"conditions.0"` with `conditions: { $elemMatch: { isActive: { $ne: false } } }`.
- Exclude `departureMode: "scheduled"` trips whose `scheduledAt` has passed.
- In `buildEvaluationContext`, fetch traffic only for an active traffic condition, weather only for an active weather condition, and the fare only for an active fare condition. After 2.8, the fare comparison ignores condition adjustments, so a fare-only trip needs neither weather nor traffic.
- Show "Departure passed, monitoring stopped" in the saved-trips UI for expired trips.

**Acceptance criteria.**
- [ ] With all conditions disabled, no provider is called (the second harness case flips).
- [ ] An expired scheduled trip is never selected.
- [ ] A weather-only trip makes one routing call and one weather call, and nothing else.

### 2.10 · G37 — Stop alerts for trips deleted mid-evaluation · P2

**Issue.** `evaluateSavedTrip` writes alerts before `trip.save()`. If the user deletes the trip meanwhile, the alerts stay behind and `save()` throws.

**Approach.** Until step 4.2's durable jobs exist:
- Immediately before `createAlert`, re-check that the trip exists.
- If `trip.save()` throws `DocumentNotFoundError`, call `deleteAlertsForSavedTrip` for that trip.
- Make `deleteSavedTrip` remove alerts even when the trip is already gone (G23).

**Acceptance criteria.**
- [ ] The fourth-pass harness's G37 case leaves no alert for the deleted trip.
- [ ] A normal evaluation still creates alerts.

### 2.11 · G11 — Show where each fare and reading comes from · P1

**Issue.** The fare and best-options APIs return `fareSource` and `fareSourceNote`, but the cards never show them. No screen credits OpenWeather or TomTom.

**Approach.**
- Add a small label to each fare and best-options card: "Estimate from rate card" or "Pathao estimator", with `fareSourceNote` as a tooltip or line.
- Save the source in `selectedVehicle` and show it on the summary and in history.
- Add a "Weather data: OpenWeather" credit wherever weather readings appear (fares, best options, summary), using the wording OpenWeather's terms require.
- Credit TomTom next to traffic readings.

**Acceptance criteria.**
- [ ] With `PATHAO_FARE_API` pointed at a failing URL in staging, Pathao cards show the rate-card label and note.
- [ ] Credits stay visible at 360 px width.
- [ ] A saved plan shows its fare source.

### 2.12 · G12 — Make the ranking honest when data is missing · P1

**Issue.**
- When traffic is unavailable, best options assumes "low" congestion ([app/api/best-options/route.ts:424](app/api/best-options/route.ts#L424)).
- The scorer still labels options "Fastest in current traffic", "Low overall risk" and "No weather caution" when data is missing.
- A single option is tagged both "Cheapest option" and "Higher cost than alternatives".
- Car durations are multiplied again for congestion that TomTom's duration already includes.

**Approach.**
- Pass `congestionLevel: null` when traffic is unavailable. Treat null as multiplier 1 and "risk not assessed".
- Emit "Fastest in current traffic" only with a traffic reading, and "Low overall risk" or "No weather caution" only with both readings.
- Emit "Higher cost than alternatives" only when there are at least two options and fares differ.
- Set the car duration multipliers to 1, since the TomTom duration already reflects congestion. Keep the two-wheeler and CNG adjustments, labelled as modeled.
- Show "Risk not assessed" when either input is missing.

**Acceptance criteria.**
- [ ] The first harness's "missing weather and traffic" case no longer returns "Low overall risk" or "Fastest in current traffic".
- [ ] A one-option result has no "higher cost" chip.
- [ ] Car ETAs match the TomTom duration plus dwell time.

### 2.13 · G14 — Accept round trips and fall back when alternatives fail · P1

**Issue.**
- Validation compares only origin and destination, so A → B → A is rejected, and a short origin-to-destination distance is rejected even when the stops make the trip long.
- A trip whose road distance exceeds ORS's 100 km alternatives limit fails instead of returning a single route.

**Approach.**
- In [lib/trip-input.ts:300-312](lib/trip-input.ts#L300-L312), when there are stops, check the straight-line sum of all legs against the 500 m minimum, and allow origin to equal destination.
- In `fetchRouteSuggestions`, when ORS returns 400 and the detail mentions alternatives, retry once without `alternative_routes`.
- Tell the user when fewer options are returned for this reason.

**Acceptance criteria.**
- [ ] The first harness's round-trip case validates.
- [ ] A → B → A with a 20-minute wait returns a route whose summary keeps the wait.
- [ ] A trip that trips ORS's alternatives limit returns one route with an explanation.
- [ ] A direct trip under 500 m is still rejected.

### 2.14 · G15 — Evaluate alerts on a schedule (interim) · P1

**Issue.** Alerts are only evaluated when a signed-in tab polls `/api/alerts/count`. The scheduled entry point exists but nothing calls it.

**Approach.** This is an interim measure until step 4.2.
- Set `ALERT_EVALUATION_SECRET` in production.
- Add a Render cron job (or a GitHub Actions scheduled workflow) that calls `POST /api/alerts/evaluate` every 15 minutes with the bearer secret.
- Change scheduled mode to respect the 15-minute throttle instead of `force: true`, and process due trips in batches until none remain or a time budget (for example 60 seconds) runs out.
- Once the cron job has run reliably for a week, remove the evaluation from the `after()` in `/api/alerts/count`, so the badge only reads.

**Acceptance criteria.**
- [ ] A staging trip with a triggering condition produces an alert within 20 minutes with no browser open.
- [ ] Each cron call's response reports trips evaluated and failed.
- [ ] The badge endpoint makes no provider calls.

### 2.15 · G25 — Keep the planner form, results and country in step · P1

**Depends on:** 1.17.

**Issue.**
- The form's key is only `"fresh"` or `"restored"`, so a second "Plan again" does not refill it ([components/map/MapDashboardSection.tsx:310](components/map/MapDashboardSection.tsx#L310)).
- Switching country keeps the previous country's results.
- The Plan Again effect is one of the two remaining lint errors.

**Approach.**
- Replace the effect with a callback. `HomeContent` holds a revision counter and the trip, and `MapDashboardSection` receives both and runs the search from an event handler.
- Key the form by that revision.
- In `HomeContent`, key `MapDashboardSection` by the active country, so a country switch resets the planner.
- Clear results when the user edits origin, destination or stops after a search.

**Progress (25 September 2026).** The Plan Again part is done:
- [MapDashboardSection](components/map/MapDashboardSection.tsx) now takes `frequentTrips` and renders the Plan Again cards itself.
- A card click calls `handlePlanAgain`, which runs the search as an event. The effect and the `planAgainTrip` and `onPlanAgainHandled` hand-off are gone.
- The form is keyed by a revision that increases on every click.

Keying by country and clearing results after edits are not done yet.

**Acceptance criteria.**
- [ ] Clicking two different Plan Again cards in turn fills the form with each trip. The code is in place; confirm it in a browser.
- [ ] Switching country clears results and inputs.
- [x] The `set-state-in-effect` lint error in this file is gone.

### 2.16 · G27 — Guard photo inference against stale results · P2

**Depends on:** 1.14.

**Issue.** A slow classification of an earlier image can overwrite the result for a newer one. Decoded image dimensions are unbounded.

**Approach.**
- Keep a request counter in the modal and ignore results from older requests.
- Decode with `createImageBitmap`, reject images wider or taller than 4096 px, and downscale before inference.
- Add a cancel control while the model is loading.

**Acceptance criteria.**
- [ ] Picking image A and then image B quickly always shows B's result.
- [ ] A 10000 × 10000 image shows a size error.

### 2.17 · G28 — Harden the camera embed · P2

**Issue.** The iframe has no `sandbox` attribute, requests camera access for viewers, and treats `onLoad` as proof of health.

**Approach.**
- Add `sandbox="allow-scripts allow-same-origin allow-popups"` and `referrerPolicy="no-referrer"`.
- Remove `camera` from `allow`, unless 1.8 established that contributors stream through the embed.
- If the frame has not loaded within 60 seconds, show "The camera service is unavailable" with the existing Reload and Open links.
- Make it clear the feeds come from a third party.

**Acceptance criteria.**
- [ ] The embed still plays feeds.
- [ ] The browser shows no camera permission prompt to viewers.
- [ ] With the host blocked, the page shows the unavailable state and the rest of the app is unaffected.

### 2.18 · G32 — Make notification paging and refresh reliable · P2

**Issue.**
- `listAlerts` pages by `createdAt` alone, so alerts with the same timestamp are skipped ([lib/alerts.ts:121-161](lib/alerts.ts#L121-L161)).
- The panel ignores `hasMore`.
- The open list refreshes only when the unread count rises.

**Approach.**
- Use a composite cursor (`createdAt`, `_id`), sort by both, and add a matching index.
- Add a "Load older" button that uses `nextCursor`.
- Return the newest visible alert's ID from `/api/alerts/count`, and reload the open list whenever it changes.

**Acceptance criteria.**
- [ ] The second harness's 21-tied-alerts case returns all 21 across two pages with no duplicates.
- [ ] More than 20 alerts can be reached from the panel.
- [ ] A new alert plus a dismissal in another tab still refreshes an open panel.

### 2.19 · C09 — Set session and cookie behavior explicitly · —

**Issue.** Better Auth runs with default session lifetime, cookie settings and trusted origins, and with no session cookie cache, so every session read queries the database.

**Approach.**
- In [lib/auth.ts](lib/auth.ts), set `session.expiresIn` and `updateAge` to agreed values (for example 30 days, refreshed daily).
- Enable `session.cookieCache` with a short `maxAge` (for example 5 minutes).
- Set `trustedOrigins` from `BETTER_AUTH_URL` plus any configured extra origins.
- Set `advanced.useSecureCookies` in production.
- Record the chosen values in the README.

**Acceptance criteria.**
- [ ] Session lifetime matches the agreed value.
- [ ] Repeated page loads within the cache window add no session queries.
- [ ] A request from an untrusted origin is rejected.

### 2.20 · C05 — Apply the email-verification decision · P1

**Depends on:** 0.7. The decision is not to enforce for now, so follow the "not enforced" path below.

**Issue.** A complete verification email exists, but `sendOnSignUp` and `requireEmailVerification` are unset, so no address is ever verified. Every existing account is unverified.

**Approach.** If the decision is to enforce verification:
- Set `emailVerification.sendOnSignUp: true` and `emailAndPassword.requireEmailVerification: true`.
- Set `emailVerification.sendOnSignIn: true`, so existing users can verify at their next sign-in.
- Before deploying, decide whether to mark existing accounts as verified, and record the choice.
- Add a "Send verification email" action to the profile page, and show the verification status again (hidden in 1.28).
- Take a backup before any bulk update.

If the decision is not to enforce, keep the status hidden. Keep the verification email code too, since the decision is to be revisited once a domain exists (0.7), and enforcing then becomes a configuration change.

**Acceptance criteria.**
- [ ] A new sign-up receives the email and cannot sign in until verified (if enforced).
- [ ] An existing user is not locked out without a way to verify.
- [ ] The profile status matches the account state.

### 2.21 · C06 — Limit sign-in and reset per account as well as per IP · P1

**Issue.** Better Auth's default limits are per IP only. There is no per-account or per-address limit, and nothing applies in development.

**Approach.**
- In the auth `before` hook, apply app limiters keyed by the normalized email: for example 5 sign-in attempts per 15 minutes with backoff, and 3 reset requests per hour per address.
- Add `rateLimit.customRules` for `/sign-up/email`.
- Share the counters across instances once step 4.4 exists; until then, document that they are per process.

**Acceptance criteria.**
- [ ] Six wrong passwords for one account, from different IPs, return 429 on the sixth.
- [ ] A fourth reset request for one address within an hour sends no email.
- [ ] Normal sign-in is unaffected.

### 2.22 · C07 — Stop sign-up revealing registered emails · P1

**Depends on:** 2.21 and the decision in 0.7.

**Issue.** The sign-up hook returns "An account with this email already exists", which lets anyone test whether an address is registered.

**Approach.** If the decision is to close the signal:
- For an existing address, return the same response as a new sign-up.
- Send the existing owner an email saying someone tried to register, with a sign-in link.
- If the decision is to keep the message, record it, and rely on 2.21's limits.

**Acceptance criteria.**
- [ ] The response status, body and timing for an existing address match a new sign-up (if closed).
- [ ] The existing owner receives the notice email.

### 2.23 · P13 — Read the session and profile once per request · P2

**Depends on:** 2.19.

**Issue.** The `(main)` layout, the navbar and each page call `auth.api.getSession` separately, and the home page reads `UserProfile` three times per render.

**Approach.**
- Add `lib/request-context.ts` with `getCurrentSession()` and `getCurrentProfile()`, each wrapped in React `cache()` so they run once per request.
- Use them in the layout, navbar, pages and `getUserCountry`.

**Acceptance criteria.**
- [ ] A home page render makes one session read and one profile read, checked with Mongoose debug logging.
- [ ] Behavior is otherwise unchanged.

### 2.24 · P01 — Add persistent navigation · —

**Issue.** The navbar has no links. `/scheduled-trips` cannot be reached when there are no upcoming trips, and moving between sections goes through the footer or the home page.

**Approach.**
- Add a primary navigation to [components/navbar.tsx](components/navbar.tsx): Plan, Scheduled, Saved trips, History, Live cams.
- Mark the current page with `aria-current`.
- On narrow screens, collapse the links into a menu or a bottom bar.
- Remove the duplicate links from the home header strip.

**Acceptance criteria.**
- [ ] Every section can be reached in one step from every signed-in page, at 360 px and at desktop width, using a keyboard alone.

### 2.25 · P03 — Add loading, error and not-found states · —

**Issue.** There are no `loading.tsx`, `error.tsx`, `not-found.tsx` or `global-error.tsx` files and no `Suspense` boundaries. Slow queries show nothing, and errors show the framework's default screen.

**Approach.**
- Add `app/(main)/loading.tsx` with skeletons that keep the page layout.
- Add `app/(main)/error.tsx` with a retry button, plus `app/global-error.tsx` and `app/not-found.tsx`.
- On the home page, wrap Plan Again in `Suspense` so the planner renders first.
- Make the summary and fares pages show "Trip not found" for invalid IDs.

**Acceptance criteria.**
- [ ] With a 3-second database delay in development, a skeleton appears immediately.
- [ ] A thrown error shows the retry screen, and retry recovers.
- [ ] `/trip-summary?tripHistoryId=bad` shows a designed not-found state.

### 2.26 · R22, G26 — Rebuild both modals on Base UI Dialog · —

**Issue.** The photo modal and the account-deletion overlay are hand-built. They have no dialog role, focus trap, Escape handling, scroll lock or focus return. The photo modal's reset effect is one of the two remaining lint errors.

**Approach.**
- Add `components/ui/dialog.tsx` on `@base-ui/react`'s Dialog, as the popovers already are, plus a `ConfirmDialog` built on it for step 2.27.
- Move the account-deletion overlay first, then the photo modal.
- Reset the photo modal's state by remounting it with a `key` when it opens, instead of in an effect.
- Make the photo drop zone a real button.

**Acceptance criteria.**
- [ ] Both dialogs announce themselves to a screen reader, trap focus, close on Escape, lock page scroll, and return focus to their trigger.
- [ ] The drop zone works from the keyboard.
- [x] Lint reports no `set-state-in-effect` errors (together with 2.15). The photo modal now mounts only while open, so each opening starts from fresh state without the reset effect (25 September 2026). The Dialog rebuild is still to do.

### 2.27 · P04 — Confirm before deleting saved trips and conditions · —

**Depends on:** 2.26.

**Issue.** Deleting a saved trip, which removes its conditions and alert history, and removing a condition both happen on a single click.

**Approach.**
- Use `ConfirmDialog` for both, naming what will be removed ("Delete Commute and its 3 conditions and 12 alerts?").
- Optionally, add a short undo instead of the dialog for condition removal.

**Acceptance criteria.**
- [ ] Neither action runs without an explicit second step.
- [ ] Cancel leaves everything unchanged.

### 2.28 · R08 — Show validation on the stop that failed · —

**Issue.** An incomplete stop blocks submission with a form-level message, but the stop itself is not marked.

**Approach.**
- Keep the indexes of incomplete stops in state; outline those rows and add `aria-invalid` and an inline message.
- Map server `errors.stops[index]` to the same rows.

**Acceptance criteria.**
- [ ] With six stops and the fourth empty, only the fourth row is marked, and focus moves to it on submit.

### 2.29 · R10, R11 — Add map recenter and marker labels · —

**Depends on:** 1.23.

**Issue.** Once the user pans away, nothing returns the map to the route, and markers show only "A", numbers and "B".

**Approach.**
- Add a "Fit route" control that reuses the `FitBounds` bounds logic.
- Add a Leaflet `Tooltip` to each marker with the place name, using the escaped label from 1.23.

**Acceptance criteria.**
- [ ] After panning away, "Fit route" shows the whole route.
- [ ] Hovering or tapping a marker shows its place name.

### 2.30 · R16, R17 — Sort fares and explain exclusions · —

**Issue.** The fares page lists options in API order with no sort control. Excluded options say "Max 4 passengers" without offering the fix.

**Approach.**
- Add a Cheapest / Fastest / Most comfortable toggle that sorts the data already loaded; no new request.
- For capacity exclusions, add a "Change passengers" link back to the planner with the trip prefilled.

**Acceptance criteria.**
- [ ] Changing the sort reorders the cards without a network request.
- [ ] A capacity exclusion links to a filled planner.

### 2.31 · R21 — Add sort, search and a limit indicator to saved trips · —

**Issue.** Saved trips are capped at 20 per country, but the page has no sort or search and does not show the limit until a create fails.

**Approach.**
- Show "N of 20 in <country>".
- Disable "New trip" at the limit, with an explanation.
- Add name search and a sort by name or last checked.

**Acceptance criteria.**
- [ ] At 20 trips, "New trip" is disabled with a reason.
- [ ] Search filters by name.
- [ ] The sort choice applies immediately.

### 2.32 · R26 — Fix the tile sizing · —

**Depends on:** 0.6.

**Issue.** The tile layers probably fetch 512-pixel tiles into a 256-pixel grid.

**Approach.** Apply the settings recorded in 0.6. Either set `tileSize={512}` and `zoomOffset={-1}` on the 512-pixel layers, or request 256-pixel tiles from TomTom (`tileSize=256`) and from Mapbox (`/tiles/256/{z}/{x}/{y}`).

**Done (24 September 2026).** The TomTom proxy at [app/api/tiles/tomtom/[z]/[x]/[y]/route.ts](app/api/tiles/tomtom/[z]/[x]/[y]/route.ts) now requests `tileSize=256`. No Leaflet change was needed.

**Acceptance criteria.**
- [x] Traffic lines draw at their intended width. The OSM labels were already normal size.
- [x] The TomTom tile is about 40% of its previous transfer size, not the expected quarter, because PNG compression does not scale with pixel count.

### 2.33 · R28 — Handle non-JSON responses in one place · —

**Issue.** Client code calls `response.json()` before checking the response. An HTML error page shows "Unexpected token '<'", and the profile Save button stays stuck.

**Approach.**
- Add `lib/fetch-json.ts`. It checks `content-type`, returns a typed result or a readable error, and never throws on non-JSON.
- Use it in the planner, routing helpers, profile form, saved trips, notifications and fares.
- Make sure every pending state clears in `finally`.

**Acceptance criteria.**
- [ ] With the API returning an HTML 502, every screen shows a readable message and no button stays disabled.

### 2.34 · G09 — Let hazardous weather reach "severe" · P1

**Depends on:** the reviewer named in 0.7.

**Issue.** The weighted score in [lib/weather.ts:159-180](lib/weather.ts#L159-L180) caps rain's contribution at 5.0 of the 7.0 needed for "severe", so no rainfall rate alone can block a two-wheeler. Unknown visibility counts as perfect visibility.

**Approach.**
- Add hazard overrides before the weighted average. For example, rain at or above 15 mm/h is at least "severe" for two-wheelers, and visibility under 500 m is always "severe". The reviewer sets the exact thresholds.
- Represent unknown visibility as "not assessed" and show that in the UI.
- Record the reviewer and the date in a comment.

This does not replace forecasts (step 4.6).

**Acceptance criteria.**
- [ ] The fourth-pass harness's "100 mm/h, calm, clear" case returns "severe" and blocks two-wheelers, as agreed.
- [ ] A missing visibility reading shows "not assessed".
- [ ] The reviewer's sign-off is recorded.

### 2.35 · P12 — Add a manifest and per-page titles · —

**Issue.** There is no web-app manifest, and every page has the title "NoboJatra".

**Approach.**
- Add `app/manifest.ts` with name, icons from `app/icon.png`, and `display: "standalone"`.
- Export `metadata` with a specific title from each page ("Saved trips · NoboJatra" and so on).

The service worker is not part of this step.

**Acceptance criteria.**
- [ ] `/manifest.webmanifest` is served, and the browser offers to install the app.
- [ ] Each page's tab shows its own title.

---

## Tier 3 — Medium fixes

Each step should take two to five days.

### 3.1 · G03 — Upgrade Next.js and clear the remaining advisories · P0

**Depends on:** 1.7.

**Issue.** Next.js 16.2.9 has two critical advisories (fixed in 16.3.3) and several high and moderate ones (most fixed in 16.2.11). `sharp`, `postcss` and `nanoid` advisories arrive through `next` and `better-auth`.

**Approach.**
1. Upgrade `next` and `eslint-config-next` to the latest 16.x release at or above 16.3.3. Check whether the `react-leaflet` patch still applies.
2. Run type-check, lint and build.
3. Smoke-test these journeys in staging: sign-up, sign-in, reset, plan, fares, best options, save plan, saved trips, notifications, map tiles, photo search, profile save and delete.
4. Re-run `pnpm audit --prod`.
5. For any advisory that remains, either upgrade the parent package or add a `pnpm.overrides` entry with a one-line reason in `package.json`.
6. Record the audit result in `docs/audits/`.

**Acceptance criteria.**
- [ ] No critical or high advisory remains in the production graph, or each remaining one has a written reachability reason.
- [ ] CI passes.
- [ ] The smoke test list passes in staging.

### 3.2 · C08 — Redirect anonymous visitors in `proxy.ts` · P1

**Depends on:** 3.1.

**Issue.** Five of the ten `(main)` pages (`/fares`, `/best-options`, `/trip-summary`, `/live-cams` and the `/dashboard` redirect) have no session check. Next.js 16 calls the file convention `proxy`, and 16.2.9 has a proxy bypass advisory.

**Approach.**
- Add `proxy.ts` with a matcher for the signed-in pages. It checks for Better Auth's session cookie and redirects to `/signin?next=…` when the cookie is absent.
- Treat the proxy as a convenience only: keep every page and route handler's own session check as the real gate.
- Add explicit checks to the four pages that lack one.

**Acceptance criteria.**
- [ ] An anonymous visit to any signed-in page lands on sign-in and returns to the page afterwards.
- [ ] With the proxy disabled, the pages still refuse anonymous access.

### 3.3 · G04, G36, R09 — Use one time-zone model for trips · P1

**Issue.**
- The form submits a zone-less `datetime-local` value, which the server interprets in its own zone.
- Three handlers read stored `Date` values as strings and fall back to "leave now".
- `/scheduled-trips` formats times in the server's zone and `/trip-summary` in the browser's.
- History filters and month groups use the server's zone.

**Approach.**
1. **Input.** Send `{ localDateTime, timeZone }`, using the trip country's zone (per service area once 4.7 exists). Convert it to an instant on the server with a maintained library, for example `date-fns-tz`. Reject or explicitly resolve times that fall in a daylight-saving gap or overlap.
2. **Storage.** Keep `scheduledAt` as an instant and add `scheduledTimeZone`.
3. **Reading.** Replace the three `getDepartureOptions` copies and the evaluator's `toDepartureOptions` with one `normalizeDeparture(record)` helper that accepts a `Date` or a string and rejects past times.
4. **Display.** Add `formatTripTime(instant, timeZone)` and use it everywhere trip times appear, including notifications, with a zone label.
5. **Form.** Compute the picker's bounds in the trip's zone (R09).
6. **History.** The client sends its zone; the server computes day bounds and month groups in that zone.
7. **Deployment.** Set `TZ=UTC`.
8. **Existing records.** If production has always run in UTC, existing Bangladesh schedules are six hours late. Decide whether to correct future-dated ones, and back up first.

**Acceptance criteria.**
- [ ] Choosing 09:00 for a Dhaka trip gives `03:00Z` in storage, 09:00 on every screen, and a peak-hour surcharge on a weekday. This holds with the server at UTC, Asia/Dhaka or America/Los_Angeles and the browser in any zone.
- [ ] The first harness's "stored Date" cases return `scheduled`.
- [ ] London daylight-saving boundary cases are handled explicitly.
- [ ] A "10 Sep" history filter includes exactly the trips of 10 September in the viewer's zone.

### 3.4 · G20 — Validate every request with shared schemas · P1

**Depends on:** 1.11.

**Issue.** Handlers cast JSON and read fields directly. Types, number ranges, string lengths and array sizes are checked unevenly, and some error messages include upstream detail.

**Approach.**
- Add `zod` as a direct dependency.
- Write schemas for every handler body and query: trip input, saved trip, conditions, alerts, profile, fares, best options, select, traffic.
- Add a `parseRequest(req, schema)` helper that rejects bodies over a size cap (for example 64 KB) and returns 400 with a stable error code and field messages.
- Add a request ID to every error response and the matching log line, and never return raw database or provider errors.

**Acceptance criteria.**
- [ ] For every route, `null`, arrays, primitives, invalid IDs, out-of-range coordinates, oversized strings and oversized arrays return a bounded 400, with no database or provider call.
- [ ] Current UI requests still pass.

### 3.5 · G07 — Show traffic only where it is supported · P1

**Depends on:** 0.7.

**Issue.** TomTom's coverage table lists no live traffic for Bangladesh, but the app calls it for Bangladesh trips, and treats missing delay figures as zero, which reads as "light traffic".

**Approach.**
- Add a `liveTraffic: "supported" | "unsupported"` capability to each country config (per service area once 4.7 exists).
- For unsupported areas, skip TomTom calls entirely (this also saves cost) and return `traffic: { status: "unsupported" }`.
- In [lib/traffic-service.ts:488-540](lib/traffic-service.ts#L488-L540), treat missing summary fields as "unknown", not 0.
- In the UI, show "Traffic not available in Bangladesh", hide the traffic overlay toggle, and exclude traffic from fare multipliers and ranking (with 2.12).
- Disable traffic conditions on Bangladesh saved trips, and explain why.

**Acceptance criteria.**
- [ ] A Bangladesh plan makes no TomTom calls and never shows a traffic level.
- [ ] A TomTom response missing delay fields yields "unknown".
- [ ] US and UK behavior is unchanged.

### 3.6 · G22, R18, R19 — Bound and index trip history reads · P2

**Issue.**
- `getTripHistoryPage` loads every confirmed trip, including route geometry, with no limit.
- `getTripHistoryActivityData` loads the user's entire history twice.
- `TripHistory` has only a `userId` index.

**Approach.**
- Add cursor pagination on (`createdAt`, `_id`) and project out `routeOptions` and route geometry from list queries.
- Compute the summary totals with an aggregation over the filtered set, so they stay correct across pages.
- Limit the activity view to recent months, with "Load more", and project only the fields it shows.
- Add the indexes `{ userId: 1, createdAt: -1 }`, `{ userId: 1, "selectedVehicle.provider": 1, "selectedVehicle.vehicleType": 1, createdAt: -1 }` and `{ userId: 1, departureMode: 1, scheduledAt: 1 }`. Confirm each with `explain()`.
- Rename `getTripHistoryPage` to match what it does once it paginates.

**Acceptance criteria.**
- [ ] With a synthetic user holding 5,000 records, the history API returns at most one page, under 100 KB, and uses the indexes (`IXSCAN`, not `COLLSCAN`).
- [ ] Totals match an unpaginated calculation.

### 3.7 · G23 — Make saved-trip writes safe and add migrations · P2

**Issue.**
- The per-country cap check can race.
- Condition edits use read-modify-save without version checks.
- Trip deletion removes the parent before the alerts.
- The old `{ userId, name }` unique index is never dropped.
- There is no migration system.

**Approach.**
- Enable `optimisticConcurrency` on `SavedTrip`, and return 409 on a version conflict.
- Enforce the cap atomically, either with a transaction around count and insert or with a per-user counter updated only while below 20.
- Delete alerts by `savedTripId` whether or not the parent exists, and wrap both deletions in a transaction.
- Add `scripts/migrations/` with a ledger collection and a runner that supports a dry run. The first migrations:
  - drop the old `userId_1_name_1` index where present;
  - backfill missing `country` fields;
  - move rate publishing out of the seed script.

**Acceptance criteria.**
- [ ] Twenty parallel creates at 19 trips produce exactly one success.
- [ ] Concurrent condition edits produce a 409, not a lost update.
- [ ] Retrying a failed deletion removes orphaned alerts.
- [ ] An old database accepts "Commute" in two countries after migration.

### 3.8 · G21 — Make account deletion resumable · P1

**Issue.** The cleanup in [lib/account-cleanup.ts](lib/account-cleanup.ts) runs independent deletions. If one fails, the account survives but some data is already gone, and new writes can still arrive during deletion.

**Approach.**
- Add a `deletionRequestedAt` field on the profile, set before cleanup.
- Reject writes from a session whose profile has that flag.
- Run the deletions in a transaction where the collections allow it; otherwise make the cleanup resumable and record progress.
- Let Better Auth delete the user only after cleanup reports complete. A retry resumes from the recorded point.

**Acceptance criteria.**
- [ ] Injecting a failure at each deletion step, then retrying, ends with no user data and no auth record.
- [ ] Writes attempted during deletion are rejected.

### 3.9 · G31 — Track alert episodes, escalation and recovery · P1

**Depends on:** 2.9.

**Issue.**
- Alerts fire only on a false-to-true change, and the hourly deduplication key hides a new alert after a quick clear-and-return.
- Moderate-to-severe escalation is never reported.
- A fare swing from −20% to +20% sends only the good news.
- Old alerts reappear after a snooze even when the condition has cleared.

**Approach.**
- Store a condition episode: state, direction, severity, `observedAt`, the last notified state, and resolution time.
- Fire on a first trigger, on escalation (higher severity, or a direction change for fares), and optionally on recovery.
- Deduplicate by event identity (condition, episode and severity) instead of by hour.
- Keep a minimum gap between repeats as an explicit rule that never suppresses an escalation.
- When an episode resolves, mark its alerts resolved, and have the list show "resolved" instead of resurfacing them after a snooze.
- Re-arm conditions when the route, vehicle or baseline changes, or when a trip is paused and resumed.

**Acceptance criteria.**
- [ ] The second harness's clear-and-return and fare-swing sequences each produce the missing alert.
- [ ] Moderate-to-severe escalation produces an alert.
- [ ] A retry of the same event produces no duplicate.
- [ ] A snoozed alert whose episode has resolved does not reappear as current.

### 3.10 · G08 — Fetch the planning context once · P1

**Depends on:** 2.12.

**Issue.** One search → fares → best options → confirm flow makes about 36 sampled TomTom calls. Every best-options Refresh and every priority toggle repeats the full request, clicking a route card refetches its traffic, and best options fetches weather and traffic one after the other.

**Approach.**
- Add a server-side context cache keyed by `tripHistoryId`, `routeId` and a departure bucket (for example 5 minutes), holding weather, traffic and fare estimates. Fares, best options and confirm all read it. It is in memory for now and moves to shared storage in 4.4.
- Have best options return the metrics needed to rank under all three priorities, and re-rank on the client when the priority changes. Refresh bypasses the cache on purpose.
- In the dashboard, keep traffic results per route ID and reuse them when a card is selected again.
- Fetch weather and traffic in parallel.

**Acceptance criteria.**
- [ ] A search → fares → best options → toggle priority twice → confirm flow makes at most one set of traffic calls per selected route, counted in staging logs.
- [ ] Toggling priority makes no network request.
- [ ] Fares shown on each screen match.

### 3.11 · G26, R02, R03 — Make the planner accessible and measure it on devices · P1

**Depends on:** 2.26.

**Issue.**
- Place search is not an accessible combobox: no roles, no arrow keys, no Escape, and dismissal by mouse only.
- Accessibility and mobile performance have not been tested; the report's Lighthouse screenshots show large layout shifts.

**Approach.**
- Rebuild [components/map/PlaceAutocomplete.tsx](components/map/PlaceAutocomplete.tsx) on Base UI's Combobox (or the ARIA combobox pattern): arrow keys, Enter, Escape, outside tap, and results announced to screen readers.
- Give every input a label.
- Reserve space for loading and result states to cut layout shift.
- Run a keyboard and screen-reader pass (VoiceOver and TalkBack) on the full journey, check contrast, and test at 200% zoom.
- Measure signed-in pages on a lower-end Android phone over a throttled connection.

**Acceptance criteria.**
- [ ] The full plan → fares → save journey works with keyboard only and with a screen reader.
- [ ] No page scrolls horizontally at 360, 390 or 430 px.
- [ ] Measured layout shift on fares and summary is below 0.1.
- [ ] The results are recorded in `docs/audits/`.

### 3.12 · G35 — Detect routes that start or end away from the pin · P2

**Issue.** The app never checks how far the routed start and end points are from the chosen coordinates, so a pin behind a barrier can produce a confident route that the user cannot reach.

**Approach.**
- In `mapOrsFeatureToRoute`, measure the distance from each requested waypoint to its routed position (from `way_points` indices).
- Store the distances on each leg.
- Above a threshold (for example 150 m), show "This route starts 400 m from your pin" and mark the ETA as approximate.

Curated entrances are Tier 5 (5.3).

**Acceptance criteria.**
- [ ] A pin inside a large campus shows the offset warning.
- [ ] Ordinary street addresses show none.
- [ ] Offsets are saved with the route snapshot.

### 3.13 · C04 — Add a Content-Security-Policy · P1

**Depends on:** 1.8.

**Issue.** No CSP is sent. The app loads model code from a third-party host, embeds a third-party frame, and uses Leaflet's inline styles.

**Approach.**
1. Add a nonce-based CSP in `Content-Security-Policy-Report-Only`, with a report endpoint, allowing:
   - the tile hosts (`img-src`);
   - the Teachable Machine model host (`connect-src`);
   - the camera app (`frame-src`);
   - Leaflet's inline styles (`style-src`).
2. Watch the reports in staging and production for a week.
3. Switch to the enforcing header.

**Acceptance criteria.**
- [ ] The enforcing CSP is live, with no violations from normal use for seven days.
- [ ] An injected inline script is blocked.

### 3.14 · P02, R12 — Make the light theme reachable · —

**Issue.** A full light palette exists, but `<html>` always has the `dark` class. Map tiles are light styles under a dark UI.

**Approach.**
- Add a theme toggle that defaults to `prefers-color-scheme` and stores the choice. Set the class before first paint with a small inline script (allowed by the CSP nonce from 3.13).
- Audit components tuned for dark: button glow, autofill override, toast shadows, fixed text colors.
- Choose tile styles by theme: Mapbox dark or light, and TomTom's matching style parameter.

**Acceptance criteria.**
- [ ] Both themes pass a contrast check on every page.
- [ ] Reloading does not flash the wrong theme.
- [ ] Map tiles match the active theme.

### 3.15 · P10 — Add a test suite and turn the harnesses into regression tests · P1

**Depends on:** 1.6.

**Issue.** There are no tests. The audit scripts are the closest thing to them, and they assert the defects.

**Approach.**
- Add Vitest.
- Unit-test the pure logic first: [lib/route-scoring.ts](lib/route-scoring.ts), the fare maths in [lib/fare-providers.ts](lib/fare-providers.ts), the severity rules in [lib/weather.ts](lib/weather.ts), `isPeakHour`, `validateTripInput`, and the alert evaluators.
- Port each harness assertion into a test that asserts the fixed behavior, marked as expected-to-fail until its step lands.
- Add route-handler tests with a test database (for example `mongodb-memory-server`) for the ownership matrix: anonymous, user A and user B.
- Run the suite in CI.

**Acceptance criteria.**
- [ ] CI runs the suite on every pull request.
- [ ] Each fixed G-item has a test that fails if the defect returns.
- [ ] The ownership matrix covers every remaining route.

### 3.16 · P11, G29 — Add error tracking and provider metrics · P1

**Issue.** There is no error tracking or structured logging. A provider that has been down for a week looks the same as a working one.

**Approach.**
- Add an error tracker (for example Sentry) for server and client, with personal data scrubbed: no coordinates, place labels or emails.
- Add structured logs carrying request IDs (from 3.4).
- Count per provider: fallbacks (`fareSource: rate_card` with a note), weather and traffic unavailability, latency, and 429 and 5xx responses.
- Alert when a fallback rate stays above a threshold.

**Acceptance criteria.**
- [ ] A thrown server error appears in the tracker with a request ID and no personal data.
- [ ] Disabling the estimator in staging raises a fallback alert within the agreed window.

### 3.17 · P06 — Let users copy, export and add plans to a calendar · —

**Depends on:** 3.3.

**Issue.** Nothing can leave the app: no copy, share, calendar file or history export.

**Approach.**
- Add "Copy plan", which produces text with origin, stops, destination, vehicle, fare range with its source, and departure time with the zone.
- Add "Add to calendar", which generates an `.ics` with the departure as a UTC instant and a reminder. Build it as a server route that returns a file, not a client-side data link.
- Add history export as CSV and JSON with explicit currency and source columns.
- Use `navigator.share` where available.

**Acceptance criteria.**
- [ ] The `.ics` for a 09:00 Dhaka trip opens at 09:00 in a Dhaka calendar and at the matching instant elsewhere.
- [ ] Exports list currency and source on every row.
- [ ] Nothing exported includes another user's data.

### 3.18 · R24, R25 — Add shared UI primitives and one feedback pattern · —

**Depends on:** 2.26.

**Issue.** `components/ui/` holds only a button and field styles. Cards, badges, empty states and alerts are rebuilt inline, and errors are shown four different ways, not all of them announced to screen readers.

**Approach.**
- Add `Card`, `Badge`, `Field`, `EmptyState`, `InlineAlert` (with `role="alert"` for errors and `role="status"` for information) and a toast.
- Move the pages over one at a time, starting with fares, best options and saved trips.

**Acceptance criteria.**
- [ ] Every error on the main journeys uses `InlineAlert` or the toast and is announced by a screen reader.
- [ ] No page defines its own card or badge styles.

---

## Tier 4 — Large fixes

Each step should take one to three weeks. Schedule them in the order the pilot needs (assessment Section 14).

### 4.1 · G02 — Replace public Nominatim for place search · P0

**Depends on:** 0.7 (provider shortlist) and 2.3 (interim protection).

**Issue.** Nominatim's usage policy forbids autocomplete on the public service and caps use at one request per second for the whole app. The app sends debounced autocomplete requests to it. Stored place labels may also need storage rights, depending on the provider.

**Approach.**
1. Build a benchmark of real pilot queries in Bengali, English and transliteration, including landmarks, campus gates and bus stops, each with the expected place.
2. Evaluate the shortlisted providers against it, along with price, autocomplete permission, storage rights for saved places and history, and attribution.
3. Add a `PlaceSearchProvider` interface with implementations for the chosen provider and for self-hosted Nominatim or Photon.
4. Choose the provider by configuration.
5. Add caching where the licence allows, request deduplication, a global budget, timeouts and cancellation.
6. Record each saved place's source and retention rights.
7. Keep reverse geocoding on the same interface.

**Acceptance criteria.**
- [ ] The chosen provider meets the agreed benchmark score.
- [ ] Autocomplete and storage rights are documented.
- [ ] Load stays within quota.
- [ ] Changing provider needs only configuration.
- [ ] An upstream outage shows a recoverable search state.
- [ ] No production request reaches `nominatim.openstreetmap.org`.

### 4.2 · G15, P05 — Build durable alert evaluation and delivery · P1

**Depends on:** 2.14 and 3.9.

**Issue.** Evaluation depends on an open tab or the interim cron job. Concurrent runs can evaluate the same trip twice. Creating an alert and saving condition state are separate writes. Alerts reach only a foreground tab.

**Approach.**
- Add an `EvaluationJob` collection with due time, lease owner and expiry, attempt count and outcome.
- Run a worker process (a Render background worker) that claims due jobs atomically with a lease, and applies retries with backoff and a per-provider budget.
- Write condition state and outbound alert events in one transaction, into an outbox.
- Deliver from the outbox to channels:
  - in-app, as today;
  - Web Push, with subscription management and consent;
  - an email digest through Resend, with an unsubscribe link.
- Add per-user notification preferences and quiet hours.
- Record `NotificationDelivery` rows (attempts, provider receipts).
- Before sending, re-check that the trip still exists, the user still has access, and the user's preferences allow it.
- Remove the interim cron job and the `after()` evaluation.

**Acceptance criteria.**
- [ ] With the browser closed, a staging condition produces a push or email within the promised delay.
- [ ] Two workers never evaluate the same job at once.
- [ ] Killing a worker mid-job leads to a retry without a duplicate alert.
- [ ] Delivery failures and job lag appear in monitoring (3.16).
- [ ] Unsubscribe and quiet hours are respected.

### 4.3 · G05, G06 — Make quotes and plans immutable · P1

**Depends on:** 3.10.

**Issue.** Confirmation recalculates the fare and duration, so the saved amount can differ from what was shown. Editing a plan can mix revisions. "Confirm" is not a booking.

**Approach.**
- Add an `EstimateSnapshot` (quote) record created when options are shown. It holds:
  - plan revision and route fingerprint;
  - product, fare range and currency;
  - source, rate and model version;
  - context snapshot ID, created time and expiry.
- The UI sends the quote ID to confirm. The server checks it is valid and unexpired and saves it by reference and by value.
- If the quote has expired or its inputs changed, show the new figure and ask the user to choose again.
- Add plan revisions with an optimistic version number, so a stale tab gets a conflict instead of overwriting.
- Keep earlier selections for audit.

**Acceptance criteria.**
- [ ] The fare and ETA saved always equal the ones displayed for an unexpired quote.
- [ ] An expired or changed quote never saves a different amount silently.
- [ ] Two tabs editing one plan produce a conflict or a new revision.
- [ ] The saved record distinguishes an estimate from a booking.

### 4.4 · G19, P09 — Share budgets, limits and caches across instances · P1

**Issue.** Rate limiters, the route cache, the weather cache and the evaluation throttle all live in process memory. Effective limits multiply with instance count, and cache hit rates fall.

**Approach.**
- Add a shared store (for example Redis or a managed key-value service).
- Move there: rate limiters (per IP, per account and global), provider budgets (daily and per minute, per provider), the weather cache, the neutral route cache from 2.1, and the context cache from 3.10.
- Add single-flight locking, so concurrent cache misses make one upstream call.
- Add circuit breakers that stop calling a failing provider for a cool-down period.
- Respect each provider's rules on caching.

**Acceptance criteria.**
- [ ] With two app instances, a burst stays within one global budget.
- [ ] 20 concurrent identical weather requests make one upstream call.
- [ ] A provider returning 5xx trips its breaker and the UI shows the degraded state.
- [ ] Cost alarms fire in staging.

### 4.5 · G08 — Get traffic-aware timing from the route itself · P1

**Depends on:** 3.10.

**Issue.** Traffic is estimated by asking TomTom to route between up to ten sampled vertices. It can choose different roads from the ORS geometry, samples are evenly spaced by vertex rather than distance, and every leg uses the same departure time.

**Approach.**
- Prefer one source for both geometry and traffic-aware ETA (for example TomTom routing with the actual stops as waypoints), or use a provider's route-matching or supporting-points feature so traffic is measured on the displayed geometry.
- Keep the real stops as waypoints, and advance each leg's departure by the preceding travel and wait time.
- Set an overall deadline and a bounded concurrency.
- When the deadline passes, return "traffic unknown" rather than partial numbers.

**Acceptance criteria.**
- [ ] On a set of reference trips, the drawn route and the timed route match.
- [ ] Later legs use later departure times.
- [ ] Provider calls per plan are capped and recorded.
- [ ] 95th-percentile planning latency is measured and within the agreed budget.

### 4.6 · G09 — Use forecasts for the trip's time and route · P1

**Depends on:** 3.3.

**Issue.** Weather comes from the current-conditions endpoint at the route midpoint, so tomorrow's trip is judged on today's weather, and long trips on one point.

**Approach.**
- Use a forecast endpoint for scheduled trips, choosing the forecast step nearest each segment's expected time.
- Sample start, middle and end (or per segment) according to a documented cost and accuracy policy.
- Store `observedAt`, `forecastFor`, `expiresAt` and location with each reading.
- When a forecast is unavailable for the window, say so.

**Acceptance criteria.**
- [ ] A trip scheduled for tomorrow shows the forecast for its departure window, with that time labelled.
- [ ] A long trip reads weather at the documented sample points.
- [ ] A missing forecast is shown as unavailable.

### 4.7 · G17 — Replace country rectangles with service areas · P1

**Depends on:** 0.7 (launch areas) and 3.3.

**Issue.**
- Countries are rectangles, so Kolkata, Agartala, Dublin, Vancouver and Tijuana pass as in-country.
- Each country has one time zone; the whole US uses New York time.
- Every product is assumed to operate everywhere in its country.
- Internal `UK` and ISO `GB` are mapped by hand.

**Approach.**
- Add a versioned `ServiceArea` record with a polygon, time zone, currency, the products offered, and a capability matrix: search, traffic, forecast, fare source and attribution.
- Validate every point, and any route crossing a border, against the polygon on the server.
- Link rate cards to service areas.
- Keep the country as a grouping in the UI only.
- Map internal and ISO country codes explicitly.
- Migrate existing trips by resolving each one's area from its coordinates, and keep the stored country for display.

**Acceptance criteria.**
- [ ] Kolkata, Dublin and Tijuana are rejected.
- [ ] A Los Angeles trip uses Pacific time.
- [ ] A product outside its area is shown as unavailable.
- [ ] Past trips still display in their original currency.

### 4.8 · G34 — Route each mode with a suitable profile · P1

**Depends on:** 4.7.

**Issue.** Every vehicle is priced and timed on the ORS `driving-car` route (TomTom `travelMode=car`), with duration multipliers standing in for mode differences. Nothing checks whether a motorbike or CNG can use those roads.

**Approach.**
- Add an explicit transport mode and routing profile for each product in the service-area matrix.
- Fetch geometry for each distinct profile the offered products need, or keep one car route and label its options "car-route estimate" (the label added in 1.27).
- Add access rules maintained per area.
- An unknown access constraint must never rank as satisfied.
- Changing vehicle invalidates quotes built on an incompatible route.

**Acceptance criteria.**
- [ ] Each offered product documents its routing basis.
- [ ] Test fixtures for mode-restricted corridors pass.
- [ ] Products with unverified access are labelled as such.

### 4.9 · G22 — Separate searches, plans and journeys · P2

**Depends on:** 3.6.

**Issue.**
- `TripHistory` records every search, including cache hits.
- `completedAt` is set to the search time.
- Upcoming lists include searches with no vehicle chosen.
- History totals add up estimates as if they were spending.

**Approach.**
- Split the data into search sessions (short retention), plans and revisions (from 4.3), and optional journey outcomes that the user confirms.
- Use request IDs so a retried search is recorded once.
- Show only saved plans in the upcoming list.
- Label totals as estimates and group them by currency.
- Add retention rules and a user control to archive or delete individual plans.
- Migrate existing rows with a backup and a dry run, then delete searches older than the retention period.

**Acceptance criteria.**
- [ ] A retried search creates one record.
- [ ] A search never appears as travel or as spending.
- [ ] The upcoming list shows only saved plans.
- [ ] Users can delete a single plan.
- [ ] The retention job runs and is logged.

### 4.10 · G29 — Put operations and privacy basics in place · P1

**Depends on:** 3.16.

**Issue.**
- There are no uptime checks, dashboards, backup or restore procedure, or incident owners.
- There are no privacy, terms or support pages, and the footer contact details are placeholders.
- Users cannot export their data or delete a single trip.

**Approach.**
- Add uptime checks for the app, the database and the worker.
- Build a dashboard of provider errors, fallback rates, job lag and cost.
- Enable Atlas backups, and run a restore drill into staging with a disposable journey. Write down the recovery-point and recovery-time targets.
- Publish privacy, terms and support pages, with real business details, reviewed for the actual data flows.
- Add account data export and per-trip deletion (with 3.17 and 4.9).
- Keep a staff-access log.

**Acceptance criteria.**
- [ ] A staging outage alerts the owner before a user reports it.
- [ ] The restore drill succeeds within the stated targets.
- [ ] Privacy and support pages are live and linked from the footer.
- [ ] A user can export their data and delete any single trip.

### 4.11 · P07 — Prepare for Bengali · —

**Depends on:** 3.18.

**Issue.** Every string is written inline, `<html lang="en">` is fixed, and numbers and dates are formatted by hand, without digit grouping or Bengali numerals.

**Approach.**
1. Adopt an i18n library that works with the App Router (for example `next-intl`).
2. Extract every string into an English catalogue.
3. Replace `formatFare`, `formatAmount` and the date formatting with `Intl`-based helpers that take a locale.
4. Set `lang` from the user's preference, separate from their country.
5. Add a Bengali catalogue and have native speakers review it.
6. Check layouts with longer strings.

**Acceptance criteria.**
- [ ] No user-facing string remains inline.
- [ ] Switching to Bengali changes all text, numbers and dates, with no clipped controls at 360 px.
- [ ] Fares keep their integer display.

---

## Tier 5 — Fixes that need external data, contracts or partners

The engineering in these steps is smaller than the dependency. Start the business work early; the code follows once the input exists.

### 5.1 · G10 — Calibrate fares against the market · P1

**Depends on:** 0.7 (estimator ownership and terms).

**Issue.**
- The rate cards are acknowledged approximations, applied country-wide.
- The Pathao-named estimator is a separately hosted service whose ownership and terms are unverified. It always sends `city=dhaka`.
- The ±10% band is a fixed spread, not a measured interval.
- Condition multipliers may double-count charges that a real quote already includes.

**Approach.**
- Classify each fare source as an official quote, a maintained rate card, or a third-party estimate, and show that class (built on 2.11).
- Version rate cards per city and product, with effective dates and evidence.
- Collect consented receipts or an approved supplier feed.
- Measure median error, tail error and band coverage per city, product and time of day.
- Replace the fixed band with measured ranges once there is enough data.
- Remove or relabel the estimator if its terms are not confirmed.

**Acceptance criteria.**
- [ ] A benchmark report exists per city and product.
- [ ] No official-partner claim is made without a written agreement.
- [ ] Unsupported city and product pairs are shown as unavailable.

### 5.2 · G07 — Find a live traffic source for Bangladesh · P1

**Depends on:** 3.5.

**Issue.** The current provider has no live-traffic coverage for Bangladesh, so step 3.5 hides traffic there.

**Approach.**
- Evaluate licensed local feeds, or consented fleet telemetry for chosen corridors.
- Measure freshness and plausibility against manually checked reference trips.
- Enable traffic per service area only when it passes, through the capability matrix (3.5 and 4.7).

**Acceptance criteria.**
- [ ] Corridor checks show fresh, plausible delays for an agreed period before traffic is shown in Bangladesh.

### 5.3 · G35 — Maintain verified entrances and pickup points · P2

**Depends on:** 3.12.

**Issue.** A building centroid or GPS pin may not be a usable pickup or arrival point, especially for campus and shuttle use.

**Approach.**
- Survey entrances and pickup points for the pilot sites, recording access hours, accessibility notes and a verification date.
- Ask the user to choose an entrance when a destination has several.
- Add walking connectors only where path data supports them.

**Acceptance criteria.**
- [ ] Every pilot destination has at least one verified access point.
- [ ] A route to a campus with several gates asks which gate.
- [ ] An unknown access point never adds zero walking time silently.

### 5.4 · G12 — Compare routes and vehicles together, with calibrated times · P1

**Depends on:** 4.3, and evidence that customers need it.

**Issue.** Best options ranks vehicles for one chosen route only, and its travel times are modeled rather than measured.

**Approach.**
- Rank a bounded set of route × vehicle combinations from the shared context, and show the trade-offs.
- Replace the hand-set duration multipliers with models calibrated on outcome data (from 4.9), with a documented baseline and hold-out evaluation.

**Acceptance criteria.**
- [ ] Rankings beat the documented baseline on held-out trips.
- [ ] The explanation shown matches the calculation.
- [ ] Missing data never produces a confident claim.

### 5.5 · G27 — Host and evaluate the landmark model properly · P2

**Depends on:** 2.16.

**Issue.** The landmark model is loaded from an external host, with no record of its training data, rights or accuracy, and it may confidently label unrelated photos.

**Approach.**
- Host a versioned copy of the model with its training provenance and licence.
- Build an independent test set, including unrelated photos, and measure accuracy and calibration.
- Add an "unknown" class or an out-of-distribution check.
- Keep inference in the browser.

**Acceptance criteria.**
- [ ] Published accuracy and false-positive rates exist for a named test set.
- [ ] Unrelated photos return "unknown" at the agreed rate.
- [ ] The model's rights are documented.

### 5.6 · G28 — Operate the camera feeds, or keep them as an external link · P2

**Depends on:** 2.17.

**Issue.** The camera page embeds a third-party app. Nobody accountable operates the feeds, and there is no consent, moderation or health check.

**Approach.** Either keep cameras as a clearly external link, or agree with the feed operator on:
- ownership and consent;
- moderation;
- heartbeat and freshness data;
- location metadata, so the app can show cameras near a route.

**Acceptance criteria.**
- [ ] Either the page is an external link, or every feed has an accountable owner and shows whether it is live, stale or offline.

---

## Not in this plan

- **Feature candidates** F01–F24, and R15 (the same as F24). These are new capabilities, not fixes.
- **Commercial work** in assessment Sections 8–18: market choice, billing, organization accounts and pilot operations. Some steps above are prerequisites for that work.
- **The original R20 recommendation** to index the legacy collections. The fourth pass found that only the legacy handlers write them, so step 2.2 retires them instead.
