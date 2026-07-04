# Nobojatra — Development Tasklist

Transport planning & comparison tool for Dhaka commuters.
**Stack:** TypeScript · Next.js · TailwindCSS · MongoDB · Mongoose · Render · Google Maps Platform · OpenWeatherMap · Resend
**Roles:** Registered User (single role) · Web only (no mobile app)

Organized into three tracks:
- **Part A — Frontend Web** (UI, forms, state, rendering)
- **Part B — Backend / API** (endpoints, DB, business logic, validation)
- **Part C — Integrations** (external APIs, caching, third-party bridges)

Each task carries a **Priority**, **Details** (granular sub-steps), and **Acceptance Criteria**.

---

# PART A — FRONTEND WEB

## A0. Project Setup & Foundation
**Priority:** High
**Module:** Frontend > Setup

**Task:** Stand up the Next.js web app shell.

**Details:**
- Initialize Next.js (App Router) + TypeScript.
- Install & configure TailwindCSS (theme tokens, base styles).
- Set up folder structure (`/app`, `/components`, `/lib`, `/hooks`, `/types`, `/styles`).
- Build root layout (fonts, metadata, global providers).
- Create reusable UI primitives: Button, Input, Select, Modal, Toast, Spinner, Card, Badge, Stepper, Tooltip.
- Set up client state (Zustand/Context) for auth + trip-planning state.
- Configure API client wrapper (base URL, error interceptor, auth header).
- Set up route groups: public (`/login`, `/signup`) vs protected (`/app/*`).
- Add global error boundary + 404/500 pages.

**Acceptance Criteria:**
- App builds and runs locally.
- Shared UI primitives usable across pages.
- Public vs protected routing scaffolded.

---

## A1. Registration & Login UI (Common Workflow 1)
**Priority:** High
**Module:** Frontend > Auth

**Task:** Build signup, login, and password-reset screens.

**Details:**
- Signup form: name, email, password.
- Client validation: password ≥8 chars + ≥1 number, email format, required fields, inline errors.
- Handle "email already exists" as a specific message.
- Login form: email + password; store returned session/JWT.
- Distinct "invalid credentials" message (no email-existence leak).
- Forgot-password page (request reset by email).
- Reset-password page (consume token/OTP, set new password).
- Auth persistence + auto-login on refresh.
- Protected-route guard (redirect unauthenticated → login).
- Logout action (clear token, redirect).
- Loading/disabled states on all auth buttons.

**Acceptance Criteria:**
- User can sign up, log in, log out.
- Duplicate email shows a clear, specific message.
- Forgot/reset flow works end-to-end.
- Protected routes enforce auth.

---

## A2. User Profile UI (Common Workflow 2)
**Priority:** High
**Module:** Frontend > Profile

**Task:** Build the profile management page.

**Details:**
- Editable fields: display name, email, default travel priority (Time/Cost/Comfort single-select), default passenger count (1–8 stepper).
- Read-only info (account creation date).
- Email change → show re-verification notice + pending state.
- Save with loading state + success/error toasts.
- Account-deletion confirmation modal (type "DELETE").
- Post-deletion logout + redirect.

**Acceptance Criteria:**
- Profile fields editable and persisted.
- Email change surfaces re-verification.
- Deletion is confirmation-gated.

---

## A3. Destination & Trip Input (M1.1)
**Priority:** High
**Module:** Frontend > Trip Planner

**Task:** Build the trip-planning input form.

**Details:**
- Origin & destination fields with Google Places Autocomplete (debounced ~300ms), Dhaka-biased.
- "Use Current Location" button → browser geolocation; on denial, inline fallback prompt (no silent failure).
- Passenger-count stepper (1–8); disable values beyond vehicle capacity.
- Departure-time toggle: "Leave now" vs scheduled date-time picker (restricted to next ~7 days).
- Multi-stop mode: add/remove/reorder up to 6 stops (drag or up/down), each with its own Autocomplete.
- Pre-submit validation: origin ≠ destination, min distance (~500m), all stop fields populated.
- **(Stretch)** Image-recognition input: photo upload → show recognized destination → manual override if low confidence.

**Acceptance Criteria:**
- Autocomplete returns Dhaka-relevant, debounced results.
- Current-location + graceful denial fallback works.
- Multi-stop add/remove/reorder (≤6) works.
- All validations enforced before submit.

---

## A4. Map Visualization (M1.2)
**Priority:** High
**Module:** Frontend > Map

**Task:** Render routes and context on an interactive map.

**Details:**
- Integrate Google Maps JS SDK.
- Each candidate route as a distinct-colored polyline.
- Custom numbered markers for origin, destination, stops.
- Togglable live-traffic layer.
- Weather badge (icon + temp + condition) near origin marker / small card.
- Selecting a route card swaps active polyline, fades/removes others.
- Multi-stop: each leg a distinct color from a fixed palette + legend.
- "Fit to view" recomputes bounds/zoom on load and after any route change.
- Loading skeleton while map/routes load.

**Acceptance Criteria:**
- Routes render as colored polylines with numbered markers.
- Traffic layer toggles; weather badge shows.
- Card selection isolates polyline; fit-to-view works.

---

## A5. Ride Options & Fare Display (M1.3)
**Priority:** High
**Module:** Frontend > Ride Options

**Task:** Display vehicles and estimated fares.

**Details:**
- Show vehicle options (Uber Go/Moto/Premier, Pathao Bike/Car, CNG) with icons.
- Fare shown as low–high range labeled "Estimated."
- Auto-hide/disable vehicles exceeding selected passenger capacity.
- Loading state while fares compute.

**Acceptance Criteria:**
- Fares shown as ±band "Estimated" range.
- Ineligible vehicles filtered by passenger count.

---

## A6. Route Comparison Display (M2.3)
**Priority:** High
**Module:** Frontend > Comparison

**Task:** Build the ranked route-card list.

**Details:**
- Top-3 ranked options as cards in a scrollable list.
- Each card: provider/vehicle icon, fare range + "Estimated", duration, comfort (1–5 stars), color-coded risk badge, one "Best for" tag, up to 3 pros / 2 cons chips.
- Selecting a card highlights it and filters map to that polyline.
- Dismissible banner above list when weather/congestion crosses threshold (e.g., flag bikes in heavy rain).
- "Refresh" button re-runs the pipeline.
- "Last updated" timestamp.

**Acceptance Criteria:**
- Top-3 cards render with all attributes.
- Card selection filters the map.
- Threshold banner + refresh + timestamp work.

---

## A7. Weather & Traffic Indicators (M2.1 / M2.2 — display)
**Priority:** Medium
**Module:** Frontend > Trip Context

**Task:** Surface weather severity and traffic congestion in the UI.

**Details:**
- Weather severity band (Low/Moderate/Severe) with detail (precip, wind, visibility) in badge/tooltip.
- Vehicle restriction indicators (e.g., bikes flagged/blocked in severe weather).
- Congestion level (LOW/MODERATE/HIGH/SEVERE) per route.
- Peak-hour flag when departure falls in Dhaka rush windows.

**Acceptance Criteria:**
- Severity band + restrictions display correctly.
- Congestion + peak-hour flags reflect backend output.

---

## A8. Notifications & Alerts UI (M3.1)
**Priority:** Medium
**Module:** Frontend > Notifications

**Task:** Build alert configuration + notification center.

**Details:**
- UI to attach alert conditions to saved trips (rain severity > X, traffic ≥ HIGH, fare shift > %).
- Bell icon with unread-count badge.
- Notification center: reverse-chronological list (trip name, condition, timestamp).
- Dismiss (mark read) action.
- Snooze 1 hour; auto-resurface after expiry.

**Acceptance Criteria:**
- Conditions attach to trips.
- Badge, dismiss, and snooze all work.

---

## A9. Trip Summary & History UI (M3.3)
**Priority:** Medium
**Module:** Frontend > Trips

**Task:** Build post-selection summary and trip history.

**Details:**
- Trip summary: chosen vehicle, cost range, total time, est. departure/arrival, weather/traffic snapshot at selection time (not live).
- Trip history list, reverse-chronological.
- Filters: date range and/or vehicle.
- Summary header: total cost, most-used vehicle, average cost across filtered set.

**Acceptance Criteria:**
- Summary shows a frozen snapshot.
- History filters + aggregate stats render correctly.

---

## A10. Multi-stop Itinerary View (M3.4)
**Priority:** Medium
**Module:** Frontend > Multi-stop

**Task:** Build the multi-stop itinerary display.

**Details:**
- Per-stop configurable transit/dwell time input.
- Itinerary view: recommended vehicle, cost, time per segment + itinerary-level totals.
- Visual sequencing of segments.

**Acceptance Criteria:**
- Dwell time chains segment times correctly.
- Per-segment + total recommendations render.

---

## A11. Saved Places & Frequent Routes UI (M3.5)
**Priority:** Medium
**Module:** Frontend > Saved

**Task:** Build saved locations + "Plan Again" cards.

**Details:**
- Save location with label (Home/Work/custom).
- Saved locations surface in Autocomplete suggestions.
- Home-screen "Plan Again" cards for top-3 most-repeated O–D pairs; pre-fill trip form on tap.

**Acceptance Criteria:**
- Saved places labeled and reused in Autocomplete.
- Top-3 frequent routes surface and pre-fill.

---

## A12. Live Traffic Camera Feed UI (M3.6 — Stretch)
**Priority:** Low
**Module:** Frontend > Camera

**Task:** Embed a demo live traffic-camera feed.

**Details:**
- Picture-in-picture panel near relevant route segment.
- Play HLS/WebRTC stream in-browser.
- Gracefully hide when no feed exists for the selected location.

**Acceptance Criteria:**
- Feed plays in PiP where available; hides cleanly otherwise.

---

# PART B — BACKEND / API

## B0. Backend Foundation & Data Model
**Priority:** High
**Module:** Backend > Setup

**Task:** Stand up the API layer and database schema.

**Details:**
- Set up API routes under `/app/api` (Next.js route handlers).
- MongoDB connection via Mongoose (cached connection singleton to avoid hot-reload re-connects in Next.js).
- Define Mongoose schemas + models: `User`, `SavedLocation`, `Trip`, `TripSegment`, `RouteOption`, `Alert`, `Notification`, `RateTable`, `Session` (indexes, refs via `ObjectId`, timestamps).
- Run initial migration / `db push`.
- Common response format helper (`{ success, data, error }`).
- Centralized error handler + custom error classes.
- Request validation layer (Zod schemas per endpoint).
- Health-check endpoint (`GET /api/health`).
- Request + error logging.
- Rate-limiting middleware skeleton for expensive endpoints.

**Acceptance Criteria:**
- DB connects; schema reviewed.
- Health check returns 200.
- Consistent response + error format in place.

---

## B1. Authentication API (Common Workflow 1)
**Priority:** High
**Module:** Backend > Auth

**Task:** Implement registration, login, logout, and password reset.

**Details:**
- `POST /api/auth/register` — validate, enforce email uniqueness server-side, hash password (bcrypt), create user; specific duplicate-email error.
- `POST /api/auth/login` — verify email + bcrypt compare, issue session/JWT; distinct internal handling for "not found" vs "wrong password" but identical outward message.
- `POST /api/auth/logout` — invalidate session / clear cookie.
- JWT signing + verification utility.
- Auth middleware protecting `/api/app/*`.
- `POST /api/auth/forgot-password` — generate time-limited reset token/OTP, store hashed with expiry.
- `POST /api/auth/reset-password` — validate token + expiry, update hash, invalidate token.
- Rate limit login + forgot-password (brute-force protection).

**Acceptance Criteria:**
- Register/login/logout function correctly.
- Email uniqueness enforced with specific error.
- Reset token is time-limited and single-use.
- Credential errors don't leak email existence.

---

## B2. User Profile API (Common Workflow 2)
**Priority:** High
**Module:** Backend > Profile

**Task:** Implement profile read/update and account deletion.

**Details:**
- `GET /api/app/profile` — editable + read-only fields.
- `PATCH /api/app/profile` — validate + update name, priority, passenger count.
- Email change flow: mark unverified, generate verification token, require confirmation before commit.
- `DELETE /api/app/profile` — confirmation-gated; **manual cascade delete** (Mongoose has no relational `onDelete` — implement via a pre-`remove`/`deleteOne` hook or an explicit service that deletes trips, segments, saved locations, alerts, notifications, history, then the user; wrap in a transaction/session for atomicity).
- Server-side validation of passenger count (1–8) + priority enum.

**Acceptance Criteria:**
- Fields update with validation.
- Email change requires re-verification.
- Deletion cascades (no orphaned records).

---

## B3. Trip Planning & Route API (M1.1 / M1.2)
**Priority:** High
**Module:** Backend > Trips

**Task:** Accept trip input and return candidate routes.

**Details:**
- `POST /api/app/trips/plan` — accept origin, destination, stops[], passenger count, departure time.
- Server-side validation mirror (origin ≠ destination, min distance, ≤6 stops, future window).
- Resolve place IDs → coordinates; reject degenerate routes.
- `GET /api/app/routes` — normalize Directions response into frontend-friendly route shape (polylines, legs, distances, durations).
- Cache route geometry per request where feasible.
- **(Stretch)** `POST /api/app/vision/recognize-place` — image → best-match place + confidence.

**Acceptance Criteria:**
- Trip input validated server-side.
- Candidate routes returned in normalized shape.

---

## B4. Fare Estimation Service (M1.3)
**Priority:** High
**Module:** Backend > Fare

**Task:** Compute vehicle fares server-side.

**Details:**
- Seed rate table: base fare, per-km, per-min, min fare per vehicle.
- Seed/admin script to populate + update rate table.
- Fare service: `fare = base + (dist_km × per_km) + (dur_min × per_min)`, apply min fare.
- Apply ±10% band → low–high range.
- Passenger-capacity filter (e.g., bike/moto capped at 1) — remove ineligible vehicles.
- No external pricing API — all internal.
- Unit tests against known distance/duration inputs.

**Acceptance Criteria:**
- Fares computed server-side as ±10% "Estimated" range.
- Ineligible vehicles filtered.
- Fare service unit-tested.

---

## B5. Weather Scoring Service (M2.1)
**Priority:** High
**Module:** Backend > Weather

**Task:** Convert weather data into severity + restrictions.

**Details:**
- Pull precipitation (mm/hr), wind (km/h), visibility (m).
- Compute 0–10 severity via weighted thresholds (heavy precip > moderate wind).
- Map score → bands (Low/Moderate/Severe).
- Derive restriction flags: bikes/motos above threshold; CNG only at extreme severity.
- Expose weather + restrictions to routing/scoring pipeline.

**Acceptance Criteria:**
- Severity score + bands computed.
- Vehicle restrictions derived from severity.

---

## B6. Traffic Scoring Service (M2.2)
**Priority:** High
**Module:** Backend > Traffic

**Task:** Compute congestion index and peak-hour flags.

**Details:**
- Request `duration_in_traffic` for departure time (now/scheduled).
- Maintain/compute free-flow baseline duration.
- Congestion index = `((in_traffic − baseline) / baseline) × 100%`.
- Bucket into LOW/MODERATE/HIGH/SEVERE at defined cutoffs.
- Peak-hour detection against Dhaka rush windows.
- Multi-stop: batch all pairs into a single Distance Matrix request.

**Acceptance Criteria:**
- Congestion index computed + bucketed.
- Peak-hour flag works.
- Multi-stop uses one batched request.

---

## B7. Route Comparison Assembly (M2.3)
**Priority:** High
**Module:** Backend > Comparison

**Task:** Assemble ranked route cards + refresh pipeline.

**Details:**
- Merge fare + duration + comfort + risk + pros/cons + best-for into RouteOption cards.
- Threshold logic to trigger warning banner.
- Refresh endpoint re-runs the full pipeline; returns fresh data + timestamp.

**Acceptance Criteria:**
- Cards assembled with all attributes.
- Banner threshold + refresh + timestamp function.

---

## B8. AI Route Scoring Engine (M3.2)
**Priority:** High
**Module:** Backend > Scoring

**Task:** Rank candidates using weighted normalized metrics.

**Details:**
- Normalize fare, duration, comfort, risk to 0–1.
- Apply user priority weights (defaults vary by selected priority — Time weights duration highest).
- Filter blocked options (weather-restricted, over capacity) **before** scoring.
- `Final score = weighted sum − risk penalty`.
- Select top-3 → RouteOption objects.
- Rule-generated pros/cons ("cheapest," "fastest").
- "Best for" tag (Speed/Budget/Comfort) from highest metric.
- Unit tests with known inputs.

**Acceptance Criteria:**
- Blocked options filtered pre-scoring.
- Weighted scoring returns correct top-3 + tags + pros/cons.

---

## B9. Notifications & Alerts API (M3.1)
**Priority:** Medium
**Module:** Backend > Notifications

**Task:** Manage alert conditions and trigger notifications.

**Details:**
- `POST/PATCH /api/app/alerts` — CRUD conditions attached to trips.
- Evaluation job: check saved trips vs live weather/traffic/fare; generate notifications on trigger.
- `GET /api/app/notifications` — reverse-chronological + unread count.
- Mark-read + snooze (store snooze-until + re-surface logic).
- Scheduled trigger (cron/interval on Render).

**Acceptance Criteria:**
- Conditions persist and evaluate.
- Notifications generate; dismiss + snooze work.

---

## B10. Trip Summary & History API (M3.3)
**Priority:** Medium
**Module:** Backend > Trips

**Task:** Persist selected trips and serve history.

**Details:**
- On selection, persist trip with frozen snapshot (weather/traffic/fare at that moment).
- `GET /api/app/trips/history` — reverse-chron, date-range + vehicle filters.
- Compute aggregate stats (total cost, most-used vehicle, avg cost) over filtered set.

**Acceptance Criteria:**
- Snapshot frozen at selection.
- History filters + aggregate stats accurate.

---

## B11. Multi-stop Planner Logic (M3.4)
**Priority:** Medium
**Module:** Backend > Multi-stop

**Task:** Score segments and chain timing.

**Details:**
- Score each segment independently via the shared engine.
- Chain timing: `segment N+1 departure = segment N arrival + dwell time`.
- Aggregate itinerary totals (cost, time).

**Acceptance Criteria:**
- Dwell chaining correct.
- Per-segment + total recommendations produced.

---

## B12. Saved Places & Frequent Routes API (M3.5)
**Priority:** Medium
**Module:** Backend > Saved

**Task:** Manage saved locations + compute frequent routes.

**Details:**
- `CRUD /api/app/saved-locations` — label + coordinates.
- Track trip frequency over rolling 30-day window.
- Compute top-3 most-repeated origin–destination pairs.
- Return them for "Plan Again" cards.

**Acceptance Criteria:**
- Saved places CRUD works.
- Top-3 frequent routes computed correctly.

---

## B13. Camera Feed Mapping API (M3.6 — Stretch)
**Priority:** Low
**Module:** Backend > Camera

**Task:** Map route segments to available camera streams.

**Details:**
- Endpoint mapping segment/location → available camera stream URL.
- Serve/proxy the bridged stream URL to the client.

**Acceptance Criteria:**
- Returns stream URL where available; empty otherwise.

---

# PART C — INTEGRATIONS

## C0. External API Provisioning & Config
**Priority:** High
**Module:** Integrations > Setup

**Task:** Provision and secure all external services.

**Details:**
- Create Google Cloud project; enable Maps JS, Places, Geocoding, Directions, Distance Matrix.
- Generate + restrict Google keys (separate browser key + server key; referrer/IP restrictions).
- Create OpenWeatherMap account + key (free tier).
- Create Resend account + verify sending domain + key.
- Store secrets in env vars (`.env.local` + Render dashboard).
- Config module that validates required env vars on boot.
- Set up Render deployment (build/start commands, env vars, MongoDB Atlas connection string).

**Acceptance Criteria:**
- All keys provisioned and loadable.
- Keys restricted; no server secrets exposed client-side.
- Render deploy works with env vars.

---

## C1. Resend Email (Auth + Profile)
**Priority:** High
**Module:** Integrations > Resend

**Task:** Send password-reset + email-verification messages.

**Details:**
- Password-reset email template with time-limited link/OTP.
- Email re-verification message on email change.
- (Optional) account-deletion confirmation email.
- Configure reset-link base URL per environment.
- Test deliverability (inbox not spam); handle Resend failures gracefully.

**Acceptance Criteria:**
- Reset + verification emails deliver reliably.
- Failures degrade gracefully.

---

## C2. Google Places & Geocoding (M1.1)
**Priority:** High
**Module:** Integrations > Google Places

**Task:** Power Autocomplete and address resolution.

**Details:**
- Places Autocomplete with session tokens, Dhaka location bias, field masking (cost control).
- Geocoding to resolve addresses ↔ coordinates.
- Browser Geolocation integration (permission handling).
- Caching/throttling on Autocomplete for quota.
- Feed saved locations into Autocomplete suggestions.

**Acceptance Criteria:**
- Dhaka-biased predictions returned, debounced.
- Geocoding resolves correctly; quota controlled.

---

## C3. Google Directions & Maps JS (M1.2)
**Priority:** High
**Module:** Integrations > Google Directions

**Task:** Fetch route geometry and render map layers.

**Details:**
- Directions API for route geometry / polylines (incl. multi-stop waypoints).
- Maps JS traffic layer.
- Decode/encode polylines; handle waypoint ordering.
- Limit Directions calls + cache results (cost control).

**Acceptance Criteria:**
- Routes fetched and rendered.
- Multi-leg geometry handled; calls cost-controlled.

---

## C4. Google Distance Matrix (M2.2)
**Priority:** High
**Module:** Integrations > Distance Matrix

**Task:** Provide traffic-aware durations.

**Details:**
- Distance Matrix with `departure_time` + `duration_in_traffic`.
- Batched matrix requests for multi-stop (elements matrix) to conserve quota.
- Cache/throttle to control cost.

**Acceptance Criteria:**
- Traffic durations returned.
- Multi-stop uses a single batched call.

---

## C5. OpenWeatherMap (M2.1)
**Priority:** High
**Module:** Integrations > OpenWeatherMap

**Task:** Fetch weather data for scoring.

**Details:**
- Call for Dhaka (or route midpoint).
- Cache ~10 min to stay within free-tier limits.
- Handle API failure/timeout gracefully (fallback to last cached / neutral).

**Acceptance Criteria:**
- Weather fetched + cached (~10 min).
- Failures degrade gracefully.

---

## C6. Combined Refresh Orchestration (M2.3 / M3.1)
**Priority:** Medium
**Module:** Integrations > Orchestration

**Task:** Coordinate multi-source pulls on refresh/evaluation.

**Details:**
- On refresh, orchestrate Directions + Distance Matrix + OpenWeatherMap (respect caches).
- Reuse the same sources in the alert-evaluation job (respect quota).
- (Optional) trigger Resend email on significant alert changes.

**Acceptance Criteria:**
- Refresh + evaluation reuse caches; stay within quota.

---

## C7. Google Cloud Vision (M1.1 — Stretch)
**Priority:** Low
**Module:** Integrations > Vision

**Task:** Recognize destination from an uploaded photo.

**Details:**
- Enable Cloud Vision (landmark/place recognition).
- Image → best-match place + confidence.
- Feed result into destination field with manual override on low confidence.

**Acceptance Criteria:**
- Confident matches auto-fill destination; low confidence allows override.

---

## C8. RTSP-to-HLS/WebRTC Bridge (M3.6 — Stretch)
**Priority:** Low
**Module:** Integrations > Camera Bridge

**Task:** Bridge a demo IP traffic camera into the browser.

**Details:**
- Set up RTSP-to-HLS/WebRTC bridge (browsers don't support RTSP natively).
- Connect demo IP camera RTSP source through the bridge.
- Handle stream unavailability/failure gracefully.

**Acceptance Criteria:**
- Demo feed streams to the browser where available; hides cleanly otherwise.

---

# QA & TESTING

## Q1. Frontend Web QA
**Priority:** High
**Test Areas:** Auth flows (signup/login/logout/reset) · protected routes · single + multi-stop planning · map polylines/markers/traffic layer/fit-to-view · route cards + selection→map filter + banner + refresh + timestamp · notifications · trip history · saved places · plan-again · responsive layout · loading/error/empty states.
**Acceptance Criteria:** All flows work; UI stable across common resolutions; no layout overflow.

## Q2. Backend / API QA
**Priority:** High
**Test Areas:** All endpoints (Postman/Thunder Client) · auth middleware + single-role access · client/server validation parity · common error format · Mongoose schemas/refs + manual cascade delete · fare + scoring unit tests · caching + rate limiting.
**Acceptance Criteria:** Endpoints tested; validation consistent; cascade delete verified; unit tests pass.

## Q3. Integrations QA
**Priority:** High
**Test Areas:** Places/Geocoding/Directions/Distance Matrix correctness + cost control · OpenWeatherMap cache ~10min + graceful failure · Resend deliverability · batched Distance Matrix for multi-stop · (stretch) Vision + RTSP bridge graceful hide · key restrictions · Render stability.
**Acceptance Criteria:** All integrations return correctly, stay within quota, and fail gracefully; no secrets exposed.

---

# SUGGESTED IMPLEMENTATION ORDER

**Phase 1 — Foundation**
1. Project setup (A0), backend foundation + data model (B0), API provisioning (C0).
2. Auth: UI (A1) + API (B1) + Resend email (C1).
3. Profile: UI (A2) + API (B2).

**Phase 2 — Core Trip Planning**
1. Destination input (A3) + trip/route API (B3) + Places/Geocoding (C2).
2. Map visualization (A4) + Directions/Maps JS (C3).
3. Fare service (B4) + ride options UI (A5).

**Phase 3 — Context & Comparison**
1. Weather service (B5) + OpenWeatherMap (C5).
2. Traffic service (B6) + Distance Matrix (C4).
3. Scoring engine (B8).
4. Comparison assembly (B7) + comparison UI (A6) + indicators (A7) + refresh orchestration (C6).

**Phase 4 — Trips, Saved, Multi-stop**
1. Trip summary + history (A9 / B10).
2. Saved places + frequent routes (A11 / B12).
3. Multi-stop planner (A10 / B11).

**Phase 5 — Notifications**
1. Alerts + notification center (A8 / B9), reusing orchestration (C6).

**Phase 6 — Stretch Features**
1. Image-recognition destination (A3 stretch / B3 stretch / C7 Vision).
2. Live traffic camera feed (A12 / B13 / C8 RTSP bridge).

**Phase 7 — QA**
1. Frontend QA (Q1), Backend QA (Q2), Integrations QA (Q3).
