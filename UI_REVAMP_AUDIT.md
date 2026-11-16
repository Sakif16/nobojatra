# UI revamp audit: bugs and gaps

Audit of the `ui-revamp` branch (commit `5250e1f`) against
[UI_REVAMP_PLAN.md](UI_REVAMP_PLAN.md), done on 2026-11-16.

**How this was checked.** Every planner, map, list, profile, chrome and system
component was read against the plan. The map label problem was reproduced by
downloading real CARTO tiles for central Dhaka and applying the app's CSS
filters to them. `pnpm test` (165 tests), `pnpm lint` and `tsc --noEmit` all
pass, so none of the problems below show up in automated checks. **Nothing was
run in a browser**, so the items marked *verify* still need a look on screen.

**How to use this file.** Work top to bottom: Part A fixes what you are seeing
most. Each item says what you see, why it happens, what to change, and how to
tell it is fixed. Tick the box when it is done. Part C has the one decision
that is yours to make before that part can be built.

---

## Part A: The map (flashes, black labels, zoom)

**Status (2026-11-16): A1–A8 and A10 fixed; A9 needs a check in the app.**

- **Checks run:** `pnpm test` (168 tests, including five new map checks),
  `pnpm lint`, `tsc --noEmit` and `git diff --check` pass. A production build
  was not run, to avoid overwriting a running dev server's `.next` folder.
- **Rendered in headless Chromium** (a stand-alone Leaflet page with the same
  tile layers, filters and controls, not the app itself): labels are light
  and readable over Dhanmondi, zooming out stops at zoom 6 around Bangladesh
  with no repeated world, and the Fit route and Traffic buttons stack under
  the zoom buttons.
- **Still to check in the app:** no grey flash while searching, editing and
  zooming; the route clear of the card on desktop; Fit route; and the Traffic
  toggle in the UK/US.
- **Not done:** keeping the previous route dimmed while a new search loads
  (the optional part of A2).

**What changed:**
- [components/map/RouteMap.tsx](components/map/RouteMap.tsx):
  - One map instance (the rebuild key is gone).
  - The map stays inside the country's padded `bounds`, with a minimum zoom
    that fits the country.
  - `noWrap` on all tile layers.
  - `dark_only_labels` instead of the inverted Voyager labels, and the
    label-failure fallback removed.
  - `detectRetina` removed.
  - No tint filter on the OSM fallback.
  - A new `overlayReserve` prop keeps a fitted route clear of the floating
    card.
  - Fit route and Traffic are Leaflet controls under the zoom buttons.
  - The traffic legend sits top-right.
- [app/globals.css](app/globals.css): dark `--map-background` for the empty
  map, softer base brightening (1.35 → 1.2), brightened dark labels, and map
  control styles.
- [components/layout/MapShell.tsx](components/layout/MapShell.tsx): exports
  `MAP_OVERLAY_RESERVE` (the card's footprint).
- Planner, fares and ranked pages: pass `overlayReserve`, the Fit route
  buttons are gone from their cards, and the "Loading map…" placeholders use
  the map background.
- [tests/route-map.test.mjs](tests/route-map.test.mjs) updated, and
  [.env.example](.env.example) notes that the fallback map is light.

### A1. The light-grey flash ("flashbang") — [x]

- **What you see:** a light-grey screen flashes whenever the map appears,
  re-centres, zooms, or loads new tiles.
- **Why:** Leaflet's own stylesheet gives the map container
  `background: #ddd` (`node_modules/leaflet/dist/leaflet.css:261`). The app
  never overrides it, so every area without a loaded tile is light grey. Your
  infinite-zoom screenshot shows it above and below the world map.
- **Fix:** in [app/globals.css](app/globals.css), next to the other
  `.planner-map` rules (line 351), add
  `.planner-map .leaflet-container { background: <dark colour>; }`. Use a dark
  neutral close to CARTO's land colour, so a missing tile is invisible rather
  than a hole. Also make the "Loading map…" placeholders the same colour and
  square on desktop. They use `rounded-3xl bg-muted` in
  [MapDashboardSection.tsx:112](components/map/MapDashboardSection.tsx#L112),
  [FareResults.tsx:44](components/FareResults.tsx#L44) and
  [BestOptionsResults.tsx:38](components/BestOptionsResults.tsx#L38).
- **Done when:** zooming fast in and out on any map shows only dark gaps,
  never light grey.

### A2. The map is rebuilt from scratch far too often — [x]

- **What you see:** many flashes per search. While a search is loading, the
  map jumps away from your route to the centre of Dhaka and then jumps back.
- **Why:** the map is keyed on whether a trip exists
  ([RouteMap.tsx:261](components/map/RouteMap.tsx#L261)). A new key destroys
  the whole Leaflet map and builds a new one. Every search first clears the
  results ([MapDashboardSection.tsx:306](components/map/MapDashboardSection.tsx#L306)
  → `clearResults`, line 232), so each search does this twice: trip → empty
  (city view) → trip. Every edit to the form after results also clears them and
  rebuilds the map. Each rebuild reloads every tile over the grey from A1.
- **Fix:** remove the `key` from `MapContainer` so one map instance lives for
  the whole page. With no trip, keep the current view instead of recentring:
  only recentre on the country default on first load and on a country change.
  When a new trip arrives, `FitBounds` moves to it as it does now.
  Optionally, keep the previous route on screen, dimmed, while the new search
  loads.
- **Done when:** searching twice in a row and editing the form after results
  cause no flash and no jump to the city centre.

### A3. You can zoom out to the whole world — [x]

- **What you see:** the world map repeating sideways, with grey above and
  below (your screenshot).
- **Why:** the map has no `minZoom`, no `maxBounds`, and the tile layers wrap.
- **Fix:** each country already has `bounds` in
  [lib/country-config.ts](lib/country-config.ts) (lines 154, 184, 205), which
  the service-area check uses. Pass them to `MapContainer` as `maxBounds` (with
  some padding and `maxBoundsViscosity`). Set a `minZoom` that still shows the
  whole service area. For the US bounds, check that the minimum zoom still lets
  a coast-to-coast trip fit. Add `noWrap` to the tile layers.
- **Done when:** zooming out stops at the country, and you cannot drag to a
  repeated copy of the world.

### A4. Black text on the black map — [x]

- **What you see:** street names look like black blotches, most of all on
  roads.
- **Why:** the last commit took CARTO's *light* label layer (Voyager) and
  inverted it with a CSS filter
  ([globals.css:347](app/globals.css#L347)). Those labels are dark text with a
  thick white halo, so inverting them gives light text with a **black halo**.
  The base tiles are also brightened by 1.35×
  ([globals.css:342](app/globals.css#L342)), which makes roads light grey-blue.
  The result is black halos on light roads. On a normal (1x) screen the halo is
  wider than the thin text, so the labels read as black.
- **Fix:** use CARTO's label layer built for dark maps,
  `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=…`,
  over `dark_nolabels`. It has light text with a dark halo, so it needs no
  inversion. To make labels brighter, apply only `brightness(1.4–1.6)` to that
  layer. Lower the base brightness to about 1.1–1.15 so roads don't compete
  with labels. A side-by-side test on a Dhaka tile showed this reads clearly.
- **Tests to update:** [tests/route-map.test.mjs:54](tests/route-map.test.mjs#L54)
  and line 63 pin the Voyager URL and the fallback string.
- **Done when:** street and area names are light and readable at zoom 13–17,
  on a 1x screen and a retina screen.

### A5. Retina screens load the wrong tiles — [x]

- **Why:** the base layer has both `detectRetina` and `{r}` in its URL
  ([RouteMap.tsx:276](components/map/RouteMap.tsx#L276)). Each one already
  handles retina screens; together they make a retina screen load tiles one
  zoom level deeper *and* at double resolution. Base detail then no longer
  matches the label layer (which only has `{r}`), roads look thinner, and four
  times as many tiles are downloaded.
- **Fix:** keep `{r}` and remove `detectRetina`.
- **Done when:** on a retina screen, road widths and label sizes match the
  same view on a normal screen.

### A6. One failed label tile switches the whole map style — [x]

- **Why:** any single `tileerror` on the label layer flips `labelLayerFailed`
  for good ([RouteMap.tsx:290](components/map/RouteMap.tsx#L290)). That swaps
  the base URL, so every base tile reloads (another flash), and labels never
  come back.
- **Fix:** count errors and only fall back after several, or drop the fallback
  once A4 uses CARTO's own dark labels, which are as reliable as the base.

### A7. The no-key fallback is a bright, washed-out map — [x]

- **Why:** without `NEXT_PUBLIC_CARTO_API_KEY` the map uses standard
  OpenStreetMap tiles, which are light. The 1.35× brightness filter still
  applies to them ([globals.css:341](app/globals.css#L341)), so the fallback
  is a glaring white map inside a dark app.
- **Fix:** don't apply the brightness and tint filter to the OSM fallback.
  Also write down in `.env.example` that the dark map needs the CARTO key.

### A8. The route can end up hidden under the route card — [x]

- **Why:** `FitBounds` pads the route by 48px on every side
  ([RouteMap.tsx:166](components/map/RouteMap.tsx#L166)), but on desktop the
  320px route card covers the map's bottom-right corner. A route that ends in
  that corner sits under the card.
- **Fix:** let `RouteMap` take extra padding (`paddingBottomRight`) for the
  overlay, and pass the card size from the planner, fares and ranked pages
  when a card is showing.

### A9. Zoom +/− buttons are missing in your screenshot — [ ] *verify*

The code turns zoom controls on
([RouteMap.tsx:264](components/map/RouteMap.tsx#L264)), and the attribution in
the same corner system does render, yet your screenshot shows no +/− buttons.
Check in DevTools whether `.leaflet-control-zoom` exists and what hides it.

**Update:** the zoom buttons render in the headless check. Before commit
`5250e1f` the map showed zoom controls only when a trip was on screen
(`zoomControl={hasTrip}`), which matches your screenshot of an empty map. So
the screenshot was probably taken on an older build. Restart the dev server
and check again.

### A10. "Fit route" — what it does, and where it should live — [x]

It zooms the map back out to show the whole route after you've panned or
zoomed away. The map already does this on its own after every search, so the
button only matters once you've moved around. A full-width button on the route
card ([RouteDetailCard.tsx:46](components/map/RouteDetailCard.tsx#L46)) is too
prominent for that.

- **Fix:** make it one small round icon button on the map (lucide `Maximize2`
  with a "Fit route" tooltip and `aria-label`), shown only when a trip is on
  the map. Remove it from the planner, fares and ranked cards.
- **Tests:** [tests/route-map.test.mjs:43](tests/route-map.test.mjs#L43) only
  needs the text "Fit route" in `RouteMap`, which the `aria-label` keeps.

---

## Part B: Planner behaviour

**Status (2026-11-16): B1–B4 fixed; not yet checked in the app.**

- **Checks run:** `pnpm test` (172 tests, including four new Part B checks
  in [tests/route-form.test.mjs](tests/route-form.test.mjs)), `pnpm lint`,
  `tsc --noEmit` and `git diff --check` pass.
- **B1**, [PlaceAutocomplete.tsx](components/map/PlaceAutocomplete.tsx): the
  field remembers the text the user last typed into it. It searches only when
  the field is focused and still holds that text, and picking a place clears
  it. This applies on the planner, profile, saved-trip form and photo modal.
- **B2**, [MapDashboardSection.tsx](components/map/MapDashboardSection.tsx):
  Plan Again scrolls an anchor above the map into view, below the sticky
  navbar, instantly under reduced motion.
- **B3**, [RouteFinderForm.tsx](components/map/RouteFinderForm.tsx): an "Edit
  trip / Done" row while the form was opened with Edit and nothing has
  changed. Focus moves between Edit and Done.
- **B4**, [RouteDetailCard.tsx](components/map/RouteDetailCard.tsx): shows
  "No live traffic" where traffic can't be requested, and "Traffic
  unavailable" only for a failed lookup.
- **Left as is:**
  - The sidebar keeps its longer explanation of why there's no traffic. It
    explains the chip rather than repeating it.
  - A trip restored from fares in the UK/US shows "Traffic unavailable"
    because its traffic isn't refreshed. The sidebar says so.
- **To check in the app:**
  - Profile loads without any dropdowns or autocomplete requests.
  - Picking a suggestion closes the list for good.
  - Plan Again scrolls up.
  - Edit → Done collapses the form, and editing a field still clears the
    results.
  - The card shows "No live traffic" in Bangladesh.

### B1. Place search fires on its own and pops open dropdowns — [x]

This is the "Unable to load suggestions" error the plan left uninvestigated.

- **What you see:**
  - After you pick a suggestion or a saved place, the dropdown opens again
    with new results, or with "Unable to load suggestions."
  - On **Profile**, every saved place (Home, Work, custom) opens a suggestion
    dropdown by itself a moment after the page loads.
  - The same happens on the saved-trip edit form, in the planner for a
    restored or Plan Again trip (visible once you press Edit), and in the
    photo modal after a photo is recognised.
- **Why:** [PlaceAutocomplete.tsx:55-102](components/map/PlaceAutocomplete.tsx#L55-L102)
  searches whenever the field holds two or more characters. It doesn't check
  whether the user typed them or whether the field is focused, and line 83
  opens the dropdown regardless. Picking a place writes the full address into
  the field, which counts as a new query. Every prefilled field searches on
  load. Each of these is also a wasted geocoding request; see the OSM
  usage-policy note in memory.
- **Fix:** only search after the user has typed in the field (track a "typed
  since last select" flag, or compare against the last selected label). Never
  open the dropdown unless the field is focused.
- **Done when:** loading Profile makes no `/api/trip-input/autocomplete`
  requests, and picking a suggestion closes the dropdown for good.

### B2. Plan Again runs a search you can't see — [x]

- **Why:** Plan Again sits below the full-height map
  ([MapDashboardSection.tsx:511](components/map/MapDashboardSection.tsx#L511)).
  Clicking a trip fills the form and searches up in the sidebar, but the page
  stays scrolled down, so it looks like nothing happened.
- **Fix:** in `handlePlanAgain` (line 393), scroll the map layout back into
  view (`scrollIntoView` on its top, honouring reduced motion).

### B3. "Edit" can't be cancelled — [x]

- **Why:** pressing Edit on the collapsed trip summary expands the form
  ([RouteFinderForm.tsx:417-425](components/map/RouteFinderForm.tsx#L417-L425)),
  but nothing collapses it again except a new search.
- **Fix:** add a "Done" / "Cancel" button while editing that collapses the form
  when nothing changed.

### B4. The route card says "Traffic unavailable" in Bangladesh — [x]

- **Why:** in a country without traffic, the planner sets an error message
  instead of leaving traffic empty, so the card
  ([RouteDetailCard.tsx:26](components/map/RouteDetailCard.tsx#L26)) never
  shows the planned "No live traffic". "Unavailable" reads as a failure.
- **Fix:** when `canRequestTraffic` is false, show "No live traffic" and keep
  "Traffic unavailable" for real failures. The same message is repeated in the
  sidebar's traffic note, so one place is enough.

---

## Part C: Fares and ranked options

**Status (2026-11-16): C1–C4 fixed, with C1 as option (a), the merge; not yet
checked in the app.**

- **C1, ranking merged into fares:**
  - [app/api/fares/route.ts](app/api/fares/route.ts) now ranks the usable
    options with the existing `rankRouteOptions`, using the profile's travel
    priority. Each result carries a `ranking`, and the response carries
    `scoringPriority` and `scoringWeights`. Fares and ranking come from one
    request and one set of estimates.
  - [FareResults.tsx](components/FareResults.tsx): the sort select became
    chips (Lowest fare, Most comfortable, Most seats, Best overall). "Default
    order" was dropped because the API already lists options by lowest fare.
  - "Best overall" shows `#1`, a risk badge, the score, "Best for", pros and
    cons, and "est. N min" on rows, plus the ranking rule and "#N overall ·
    Score" on the card.
  - Where every option has the same time (today, everywhere; see the Speed
    finding), the rule says that speed does not change the order.
  - A "Back to route" link replaces the progress strip.
  - Removed: `components/BestOptionsResults.tsx`, `app/api/best-options/`
    and `components/map/TripProgress.tsx`.
  - `/ranked-options` now checks the session and redirects to
    `/fares?…&sort=best`, so old links still work.
  - The Profile priority now explains that it sets the "Best overall" order.
- **C2:** "Pathao estimate" as the label, and "Pathao's estimate was
  unavailable…" as the fallback note. The setup message and README match.
  Plans saved earlier keep the note text they were saved with.
- **C3:** the feature tile is now "Best overall ranking: Ranks ride options
  on cost, comfort and conditions".
- **C4:** the ranked page is gone, and the badges on the fares page use
  `-400` shades.
- **To check in the app:**
  - Fares sort chips, including Best overall with tags, the rule and the card
    score.
  - An old `/ranked-options?…` link lands on fares sorted by Best overall.
  - Back to route restores the trip.
- **Still open:** making "Speed" real needs per-vehicle travel times (see the
  finding below).

### C1. The Route → Fares → Ranked strip describes a flow that doesn't exist — [x]

- **What you noticed is right.** The fares page lists every vehicle and has
  its own "Save plan" button, which goes straight to the trip summary. The
  ranked page lists **the same vehicles** with a rule-based score (weights for
  time, cost and comfort, minus a risk deduction), "Best for" tags and
  pros/cons, plus its own identical "Save plan". So "Ranked" is an optional
  second view, not a third step.
- It is also hidden: step 14 removed the "Rank these options" button, so the
  only way in is the grey "Ranked" pill in
  [TripProgress.tsx](components/map/TripProgress.tsx), which looks like a
  status label. On the planner, "Fares" never becomes a link even after
  results appear
  ([MapDashboardSection.tsx:429](components/map/MapDashboardSection.tsx#L429)).
- **What each page does today.** Both start from the same saved trip (the
  trip history record and the chosen route), and both end in the same "Save
  plan", which stores the vehicle on the trip and opens the trip summary.
  Nothing is booked.
  - **Fares** (`/fares`, [app/api/fares/route.ts](app/api/fares/route.ts)):
    1. Loads the trip and gets weather (current, or a forecast for a
       scheduled trip) and live traffic where the country has it.
    2. Prices every active vehicle for the trip's country. Bangladesh has
       Pathao bike and car, Uber moto, Go, Premier and XL, and CNG. The UK has
       Uber and Bolt (Go, XL). The US has Uber and Lyft (Go, XL, Premier).
       Prices come from the rate card or Pathao's estimate, adjusted for
       weather, traffic and peak hours.
    3. Moves vehicles that are too small for the passengers, or blocked by
       severe weather, to an "Unavailable" list with the reason.
    4. Lets you sort (default order, lowest fare, most comfortable, most
       seats), pick one, and save.
  - **Ranked** (`/ranked-options`,
    [app/api/best-options/route.ts](app/api/best-options/route.ts) and
    [lib/route-scoring.ts](lib/route-scoring.ts)):
    1. Repeats fares steps 1–3 with the same vehicles and prices.
    2. Scores each usable vehicle 0–1 on fare (cheaper is better), travel
       time (shorter is better) and comfort (a fixed 1–5 stars per vehicle).
    3. Combines the three by a priority: Speed (the default, unless the
       profile sets another) is 70% time and 15% each for the others; Budget
       is 70% fare; Comfort is 70% comfort. It then subtracts a small
       weather/traffic risk penalty, larger for two-wheelers in bad weather.
    4. Adds a rank, a score out of 100, a "Best for" tag, a risk badge, and
       pros and cons, plus a Refresh button that re-fetches the conditions.
- **Finding: the "Speed" ranking can't tell vehicles apart with today's
  data.** Travel time only differs between vehicles when live traffic exists:
  each vehicle class then gets its own traffic factor (bikes faster in jams,
  cars slower; `DURATION_MULTIPLIERS` in
  [lib/route-scoring.ts](lib/route-scoring.ts)). Bangladesh has no live
  traffic, so every vehicle gets the same time. The UK and US have traffic,
  but every vehicle there is a car, so they all get the same factor. The time
  score is therefore a tie in every country:
  - The default Speed ranking is really ordered by fare, comfort and the
    weather penalty, while the screen says "70% on speed".
  - "Shortest estimated time" can never appear as a pro.
  - Only Budget and Comfort change the order meaningfully.

  Making Speed real would need per-vehicle travel times, for example bikes
  faster than cars in Dhaka even without live traffic. That is new behaviour
  and out of the revamp's scope; decide it separately.
- **What ranking really adds over fares:** a blended "best overall" order, the
  risk badge, and pros and cons. "Cheapest first" and "most comfortable first"
  already exist as fares sorts.
- **Options:**
  - **(a) Recommended:** merge ranking into the fares page. The existing
    "Sort" select becomes chips: *Default / Cheapest / Most comfortable / Best
    overall*, where "Best overall" uses the ranking score and shows the score,
    tags and pros/cons on the rows. Leave out a "Fastest" sort until the Speed
    finding above is resolved, since it would change nothing. Remove the strip, and
    redirect `/ranked-options` to `/fares`. One page, one Save.
  - **(b)** Keep both pages. Change the strip to Route → Fares, and add a
    clear secondary "Compare and rank" button on the fares page.
  - **(c)** Remove the strip and keep the ranked page reachable only by a
    button on fares.

### C2. "Live Pathao pricing" → "Pathao estimate" — [x]

- [lib/fare-source.ts:17](lib/fare-source.ts#L17): `"Live Pathao pricing"` →
  `"Pathao estimate"`.
- [lib/fare-providers.ts:388](lib/fare-providers.ts#L388): `"Live Pathao
  pricing was unavailable; showing a rate-card estimate."` → `"Pathao's
  estimate was unavailable; showing a rate-card estimate."`
- [lib/env.ts:73](lib/env.ts#L73): the setup message says "live Pathao
  pricing is off". Reword it to match.
- **Tests:** [tests/fare-source.test.mjs:14](tests/fare-source.test.mjs#L14)
  and line 43 assert the old strings.
- **Note:** plans that were already saved show this label too (it is computed
  from the stored source), so they change with it, which is what you want.

### C3. "AI route ranking" overclaims — [x]

[SuggestionTiles.tsx:31](components/home/SuggestionTiles.tsx#L31). The ranking
is a fixed weighted formula, not AI. Rename it, for example "Smart ranking:
scores options on time, cost and comfort". If you pick C1 (a), describe it as
part of fare comparison.

### C4. Unreadable tag colours on the ranked page — [x]

Light-theme shades on the dark card:
[BestOptionsResults.tsx:199](components/BestOptionsResults.tsx#L199) (low risk,
`text-emerald-600`), lines 216–218 ("Best for" tags, `text-blue-600`,
`text-emerald-600`, `text-purple-600`), and line 555 (pros pills). Use the
`-400` shades, like the traffic badges in `RouteResults`.

---

## Part D: Layout and alignment

**Status (2026-11-16): D1–D8 fixed; not yet checked in the app.**

- **D1, D2:** the navbar and footer are full width with the sidebar's 16/24px
  padding. The header itself is `h-(--app-header-height)`, border included.
- **D3:** extra margins removed from the planner header. The progress strip
  is gone (C1).
- **D4:** `app/(main)/loading.tsx` is now map-shaped
  ([PageSkeletons.tsx](components/layout/PageSkeletons.tsx)) for the planner
  and fares. Each list page has its own list-shaped `loading.tsx`.
- **D5:** a new [PageContainer](components/ui/page-container.tsx), `narrow`
  (2xl, the trip summary) or `wide` (5xl: history, scheduled, saved trips,
  profile, live cams). All of them use `py-10`.
- **D6:** a `TimelineStop` helper with a centred connector.
- **D7:** fares and history rows are borderless. History and saved trips are
  one panel of rows each.
- **D8:** the feature tiles use `rounded-2xl`.
- **Tests:** [tests/layout-alignment.test.mjs](tests/layout-alignment.test.mjs).
- **To check in the app:**
  - The logo lines up over the sidebar.
  - The planner has no 1px page scroll.
  - The loading screens.
  - Each page's width.
  - The summary timeline.

### D1. The navbar doesn't line up with the map layout — [x]

- **What you see:** on a wide screen, the logo starts about 345px in while the
  sidebar starts at the left edge. Nav links and icons float in the middle,
  unrelated to the sidebar and map below.
- **Why:** the navbar centres its content in 1280px
  ([navbar.tsx:44](components/navbar.tsx#L44), `max-w-7xl mx-auto`), but the
  map layout is full-width.
- **Fix:** on map pages, make the navbar full-width with the same side padding
  as the sidebar (24px), so the logo sits above the sidebar's content edge.
  The simplest version uses a full-width navbar on every page. Decide whether
  list pages keep a centred navbar; full-width everywhere is simpler.

### D2. The map layout is 1px taller than the window — [x]

The header is 72px plus a 1px bottom border
([navbar.tsx:43](components/navbar.tsx#L43)), but the layout subtracts only
72px ([MapShell.tsx:13](components/layout/MapShell.tsx#L13)). Put the border
inside the 72px (use an inset shadow or `box-border` on the header), or set the
variable to 73px.

### D3. Uneven spacing at the top of the planner sidebar — [x]

The progress strip has `mb-5`, the header block has `mb-6`, and the sidebar
already spaces children with `gap-4`
([AuthedHome.tsx:47](components/home/AuthedHome.tsx#L47),
[TripProgress.tsx:28](components/map/TripProgress.tsx#L28)). That gives gaps of
36–40px that don't match the rest of the sidebar. Rely on the sidebar's gap
only. If C1 removes the strip, the title becomes the first thing, as in the
reference.

### D4. The page-loading skeleton is shaped like a list page — [x]

[app/(main)/loading.tsx](<app/(main)/loading.tsx>) always shows a narrow
centred list. Going to the planner, fares or ranked options shows that, then
snaps to the full-height map layout. Add a map-shaped skeleton (sidebar plus a
dark map block) for the map routes, using a `loading.tsx` in those route
folders.

### D5. Pages use different widths and spacing — [x]

Trip summary `max-w-2xl`, history `max-w-4xl` with `py-10`, scheduled
`max-w-5xl` with `py-8`, live cams `max-w-7xl`. Pick two widths (a narrow one
for reading pages, a wide one for lists) and one vertical padding, and put them
in a shared page wrapper next to `PageHeader`.

### D6. The trip summary timeline line doesn't meet its dots — [x]

[TripSummary.tsx:243](components/TripSummary.tsx#L243) (and 248 and the leg
rows): the connecting line is the *left border* of a 24px column whose dot is
centred, so the line runs 12px to the left of the dots. Draw the line as a
centred element (a 2px `absolute left-1/2` bar) instead.

### D7. Rows look different on different pages — [x]

The design rule says rows have no border and show a hover background only. The
planner follows it. Fares, ranked and history rows add `border-border bg-card`
([FareResults.tsx:425](components/FareResults.tsx#L425),
[BestOptionsResults.tsx](components/BestOptionsResults.tsx) ranked rows,
[TripHistoryList.tsx](components/TripHistoryList.tsx) plan rows), and saved
trips wrap every row in its own panel. Pick one look. Following the plan,
remove the borders and keep the selected orange outline.

### D8. Feature tiles have a different corner radius — [x]

[SuggestionTiles.tsx:85](components/home/SuggestionTiles.tsx#L85) uses
`rounded-lg`; every other panel is `rounded-2xl`. Use `Panel`.

---

## Part E: Leftovers from the shared-parts rollout

**Status (2026-11-16): all done except the scheduled-trips item; not yet
checked in the app.**

- **Saved trips:** `EmptyState`, `SkeletonRows`, and `fieldClassName()` for
  search and sort. The form scrolls into view when it opens.
- **History:** Chip buttons replace the fake tabs, there is one period
  control, and loading and errors use `SkeletonRows` and `StatusMessage`.
- **Profile:** a `Panel` for the account details and `StatusMessage` for
  save results.
- **Planner form:** `StatusMessage` for errors and `fieldClassName()` for the
  time field.
- **Trip summary:** the payload now includes `routeId`, and "No vehicle
  chosen yet" links to the fare estimates.
- **Naming:** the nav and footer say "Live cams".
- **Hover glow:** the global rule and every `data-no-glow` are gone. Only the
  primary button variant glows, and the fares "Save plan" and scheduled-trips
  actions now use the shared button styles.
- **Stale comment:** rewritten in Part A.
- **Not done, the scheduled-trips item:** a scheduled trip with no route has
  nothing the planner can restore, and filling the planner from its places
  would need a new planner link format, which is new behaviour. It only
  affects records saved without route options.

None of these is broken, but each looks unlike the rest of the app. Each is a
small change.

- [x] **Saved trips:** the empty state and "no match" message are hand-built
  dashed boxes
  ([SavedTripsManager.tsx:169](components/saved-trips/SavedTripsManager.tsx#L169),
  182). Use `EmptyState`. Loading is a text line (162); use `SkeletonRows`.
  The search field (122) and sort select don't use `fieldClassName()`.
  Pressing edit on a trip far down the list opens the form at the top
  without scrolling to it.
- [x] **History:** loading is a text box
  ([TripHistoryList.tsx:390](components/TripHistoryList.tsx#L390)); use
  `SkeletonRows`. The error is a hand-built box; use `StatusMessage`. The
  Saved plans / Route searches tabs (219) use a solid orange selected state
  that no other control uses; use `Chip`. "Last 7 days" appears as a chip
  *and* as the first item of the period select next to it (253); keep one.
  The tabs lack `aria-controls` and tab panels.
- [x] **Profile:** the "Account created / Current email" box is hand-built
  ([profile-form.tsx:397](<app/(main)/profile/profile-form.tsx#L397>)); use
  `Panel`. Save success and error messages (411) are plain text; use
  `StatusMessage`.
- [x] **Planner form:** the form error
  ([RouteFinderForm.tsx:671](components/map/RouteFinderForm.tsx#L671)) is
  hand-built; use `StatusMessage`. The scheduled-time field (579) uses a
  different fill (`bg-secondary/60`) from the fields above it.
- [x] **Trip summary:** "No vehicle chosen yet: go back to the fare results"
  ([TripSummary.tsx:270](components/TripSummary.tsx#L270)) has no link back
  to fares.
- [ ] **Scheduled trips:** for a trip with no route, "Plan again"
  ([ScheduledTripsList.tsx:66](components/ScheduledTripsList.tsx#L66)) opens
  an empty planner, losing the trip. Link to the planner with the trip filled
  in.
- [x] **Naming:** the nav and footer say "Live traffic" but the page is titled
  "Live cams" ([lib/navigation.ts:10](lib/navigation.ts#L10)). Use one name.
- [x] **Hover glow:** a global rule gives every `<button>` an orange glow on
  hover ([globals.css:228-237](app/globals.css#L228-L237)) unless it opts out
  with `data-no-glow`. Some opt out (rows, Plan Again, Swap) and some don't
  (chips, Edit, the map's Traffic and Fit buttons, card buttons), so hover
  looks different control to control. Decide where the glow belongs (primary
  buttons only is the usual choice) and apply it there instead of globally.
- [x] **Stale comment:** [globals.css:340](app/globals.css#L340) says the
  tile filter is "scoped until the redesigned map opts in". It isn't scoped,
  and the map already opted in. Update the comment.

---

## Part F: Browser verification

**Status (2026-11-16): done in headless Chromium against `pnpm dev` (port
3000). A few items need a real device or were not reachable; see the end of
this part.**

How it ran:
- Headless Chromium (Playwright's build) was driven over the DevTools
  protocol, at 1440×900 and 400×860.
- A throwaway account (`ui-audit-…@example.test`) was signed up on the Atlas
  database and deleted at the end with Profile → Delete Account. Signing in
  with it afterwards fails with "Invalid email or password."
- Provider calls: about 25 place searches and 7 route searches, with TomTom
  traffic for one UK and one US trip.

Results:
- [x] **Both widths, every page.** Sign-in, sign-up, forgot and reset
  password, 404, planner, fares, trip summary, history, scheduled, saved
  trips, profile and live cams were all checked:
  - No horizontal scroll at either width.
  - The header is exactly 72px.
  - The logo lines up with the sidebar and footer edge (24px desktop, 16px
    phone).
  - List pages share one 1024px column; the trip summary uses the 672px
    narrow column.
  - The planner layout ends exactly at the bottom of the window.
- [x] **Map (Part A).**
  - The empty map is `#121110` (no light grey).
  - The zoom buttons show, and zooming out stops at level 7 in Bangladesh.
  - The dark label layer loads, and there are no double-resolution tiles on a
    1x screen.
  - The same map element survives a search and a route change (not rebuilt).
  - The route sits left of the floating card.
  - Fit route and Traffic stack under the zoom buttons.
- [x] **Alternative route.** Selecting Route 2 redraws the line and updates
  the card ("Route 2").
- [x] **Multi-stop + scheduled** (at 400px): one stop and a scheduled
  departure. The departure line, the A → 1 → B leg list, and the card below
  the map are all correct.
- [x] **Round trip (A = B):** rejected by validation, "Origin and destination
  cannot be the same." This is existing behaviour; a round trip needs a stop.
  Not retried with a stop, to limit provider calls.
- [x] **Country switch BD → UK → US.** The map recentres on Dhaka, London and
  New York, and earlier results clear.
- [x] **Traffic control.** Absent in Bangladesh. Shown in the UK and US;
  turning it on loads TomTom tiles, shows the legend top-right and adds the
  TomTom credit. The card shows "low traffic"; in Bangladesh it shows "No
  live traffic".
- [x] **Reduced motion.** No element animates, and the route line is solid
  (dash 1 of path length 1, offset 0).
- [x] **Autocomplete (B1).** One request while typing, none after picking, and
  the dropdown stays closed. Profile with a saved Home place makes no
  autocomplete requests on load.
- [x] **Edit → Done (B3).** Done appears and takes focus; Done collapses the
  form, returns focus to Edit and keeps the results.
- [x] **Fares (C).**
  - The sort chips work, and "Best overall" shows #1, a risk badge, the
    score, "Best for", pros and cons, and est. time.
  - The card shows "#1 overall · Score 90 / 100".
  - Labels read "Pathao estimate" and "Rate-card estimate".
  - Save plan opens the trip summary, whose timeline line runs through its
    dots.
  - An old `/ranked-options` link lands on fares sorted by Best overall.
- [x] **Keyboard.** Escape closes the account menu and the notifications, and
  focus returns to their buttons. The photo modal opens above the map and
  Escape closes it. The current nav link has `aria-current`.
- [x] **Console.** No CSP errors and no Leaflet errors on any page. The only
  errors seen were expected: the 404 page's status, a 400 from the round-trip
  validation, a 503 when OpenRouteService timed out on a 70 km "Kings Cross"
  (the app showed "Routing service is temporarily unavailable."), and a 503
  from the third-party live-cams stream host.
- [x] **Default `pnpm build` (Turbopack)** passes now; the port-binding
  failure noted in the plan did not recur. `tsc --noEmit` is clean once the
  build has regenerated `.next` types.

Bugs found by this pass, all fixed:
- **Best overall ranked only 3 vehicles.** `rankRouteOptions` capped its
  result at three (the old ranked page only ever showed three), so 4 of 7
  Bangladesh vehicles had no rank. Every usable option is ranked now
  ([lib/route-scoring.ts](lib/route-scoring.ts)), with a test. The "same
  travel time" sentence was also missing, because unranked rows counted as a
  different time.
- **Fares header** printed both full search addresses (five lines). It now
  shows place names, with the full addresses in the tooltip.
- **Multi-stop legs** used full addresses; they now use place names, with
  the full ones in the tooltip.
- **Scheduled trips** showed "Ride not selected" and "No vehicle chosen" side
  by side. The fare chip now only appears when a vehicle is chosen.
- **Priority wording:** Profile says Time / Cost / Comfort, while the fares
  rule said "speed, budget". The rule and hint now say time, cost and
  comfort.

Not verified:
- [ ] **Phone scroll trap:** whether one-finger drag on the 55vh map traps
  page scrolling needs a real touch device.
- [ ] **A forced error page** (`app/(main)/error.tsx`): there is no safe way
  to make a page fail on demand.
- [ ] **Loading skeletons:** too brief on a local server to capture.
- [ ] **Round trip with a stop** (see above).

Noticed and left as is (outside the revamp, or design calls for you):
- On phone, the nav links scroll sideways under the bell with no hint that
  they continue.
- With live traffic, the card's duration (route estimate) can differ from
  the sidebar's "N min with live traffic" (20 vs 16 min in London).
- History rows still show long, truncated search addresses.
- The sign-in artwork's route and pins run behind the feature list text.
- "Best for Speed/Budget" tags come from the server's own names, while the
  rule now says time/cost.

---

## Suggested order

1. **A1–A3** (flash, rebuilds, zoom limits): the most visible problems.
2. **A4–A7** (labels, retina, fallbacks).
3. **B1** (autocomplete). It affects four screens and the geocoding quota.
4. **C2** (Pathao wording) and **C4** (colours): quick.
5. **C1** once you've chosen an option, then **A10**, **D3** and **C3**,
   which depend on it.
6. **D1, D2, D4** (layout alignment), then **A8, B2–B4**.
7. **D5–D8** and Part E.
8. Part F in the browser.
