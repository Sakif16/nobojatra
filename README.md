# NoboJatra

## Intro
A travel-planning web app for comparing routes, estimating fares, checking live conditions, and saving repeat journeys — all in one place.

---

## Description
NoboJatra is a full-stack travel planning application built for everyday commuters who want a simpler way to choose the best route for their trip. Users can search from one place to another, compare route options, review traffic and weather conditions, estimate fares for different transport modes, and revisit saved trips whenever needed.

The app combines route comparison, fare estimation, map visualization, and trip history into a single experience that helps users make faster and more informed travel decisions.

---

## Website-
Live at: https://nobojatra.onrender.com

---

### What you can do:
- Sign up and sign in with email and password
- Search for trips between locations with route suggestions
- Compare multiple route options based on travel time and practicality
- View route details on a map and inspect trip segments
- Estimate fares across supported transport providers and vehicle types
- Check weather-aware fare restrictions and route conditions
- Save frequently used locations and repeat journeys
- Manage scheduled trips and trip history
- View upcoming trips and travel summaries on the dashboard
- Explore live camera feeds for route monitoring
- Review ranked options that score each vehicle on time, fare, comfort and risk

---

## Tech Stack
- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **BetterAuth** (authentication & session management)
- **MongoDB** (database)
- **Mongoose** (schemas & models)
- **OpenRouteService** (routing data)
- **OpenWeatherMap** (weather-aware fare logic)
- **TomTom** (live traffic delays and traffic map overlay)
- **Nominatim / OpenStreetMap** (place search and map tiles)
- **Leaflet** (maps)
- **Resend** (password reset emails)

---

## Local Setup

### Requirements
- Node.js 24 (used for the demo and the native TypeScript rate-seeding script)
- pnpm 11.18.0 (the version pinned in `package.json`)
- A MongoDB database (for example, a free MongoDB Atlas cluster)

### 1) Install dependencies
```bash
pnpm install
```

### 2) Create your `.env`
Copy `.env.example` to `.env` and fill in the four required values. Each optional feature is commented out in the file; uncomment one to switch it on.

```bash
cp .env.example .env
```

The app checks these when it starts. If a required variable is missing it stops with one message naming every one that is missing. Each optional feature that is off is logged at server startup, with what it costs. Checks run when serving requests; build-time configuration is not proof that the deployment is configured. A value still reading `your_…` counts as unset.

| Variable | Required | What it's for, and what happens without it |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string. The app will not start without it |
| `BETTER_AUTH_SECRET` | Yes | Random string of at least 32 characters used to sign sessions (for example `openssl rand -base64 32`). The app will not start without it |
| `BETTER_AUTH_URL` | Yes | The app's URL, for example `http://localhost:3000`. The app will not start without it |
| `ORS_API_KEY` | Yes | OpenRouteService key for route search. The app will not start without it |
| `OPENWEATHER_API_KEY` | Optional | Weather on fares and rankings. Without it, fares carry no weather adjustment and the screens say weather is not set up |
| `TOMTOM_API_KEY` | Optional | Live traffic and the map's traffic overlay. Without it, times and fares use no traffic data and the screens say traffic is not set up |
| `PATHAO_FARE_API` | Optional | Live Pathao pricing. Without it, fares come from the seeded rate card and are labelled as rate-card estimates |
| `RESEND_API_KEY` | Optional | Sending password reset emails. Without it, the reset page says reset is not set up |
| `RESEND_FROM_EMAIL` | Optional | Sender address. Must be on a domain verified in Resend. Without it, emails reach only the Resend account owner |
| `NEXT_PUBLIC_TM_MODEL_URL` | Optional | Image model used by photo search. Without it, photo search is disabled and the planner explains why. Read at build time, so rebuild after changing it |
| `MONGODB_DB` | Optional | Database for app and auth data. Defaults to `nobojatra`. Changing it on an existing database hides every existing account |
| `NOMINATIM_USER_AGENT` | Optional | Identifies the app to the place-search service. Defaults to the app name and this repository's URL. Set it only to add a contact email |
| `NOMINATIM_BASE_URL` | Optional | Place-search server. Defaults to the public OpenStreetMap one |
| `OPENWEATHER_BASE_URL` | Optional | OpenWeatherMap API URL. Defaults to the standard one |
| `DEMO_BUDGET_<PROVIDER>` | Optional | Daily cap on calls to one provider, for example `DEMO_BUDGET_NOMINATIM=500`. Providers: `NOMINATIM`, `OPENROUTESERVICE`, `TOMTOM_ROUTING`, `TOMTOM_TILES`, `OPENWEATHER`, `PATHAO`. Defaults are in `lib/provider-budget.ts` |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Leave unset | Mapbox is not used. Setting it switches to Mapbox map layers that aren't configured correctly |

Never commit `.env` or put a real key in the code. A secret scan runs on every pull request and on every push to `main`.

### 3) Seed the fare rates
```bash
pnpm seed:rates
```
Run this once for each database. Until it has run, the fare and ranking pages have no vehicles to price. See [Seeded rates](#seeded-rates) for what it writes.

The script also migrates older rates to country-scoped indexes and backfills legacy rows to Bangladesh. Use a dedicated demo database. It loads `.env` directly; unlike Next.js, it does not load `.env.local`.

### 4) Start the app
```bash
pnpm dev
```
Then open http://localhost:3000.

### 5) Create an account
There is no built-in account. Follow [Demo account](#demo-account) to make one.

### Checks
```bash
pnpm exec tsc --noEmit   # type-check
pnpm lint
pnpm test                # no network or database needed
pnpm build
```

---

## Demo Setup
Use this configuration to reproduce the demo. These instructions describe the supported setup; they do not verify the deployed host’s environment.

- **Host:** one Node web service, built with `pnpm install --frozen-lockfile && pnpm build` and started with `pnpm start`.
- **Database:** one MongoDB Atlas cluster, database `nobojatra`, seeded once with `pnpm seed:rates`.
- **Environment:** the four required variables, with `BETTER_AUTH_URL` set to the public URL, plus `OPENWEATHER_API_KEY`, `TOMTOM_API_KEY`, `PATHAO_FARE_API`, `RESEND_API_KEY` and `NEXT_PUBLIC_TM_MODEL_URL`. Set `TZ=UTC` on the host.
- **One instance only.** Per-account rate limits are counted in the server's memory, so a second instance would give every account a second allowance.

Read the startup log after each deploy: it lists every optional feature that is off.

### Provider fallbacks
Server-side routing, place search, traffic, weather and live fare requests have a daily call budget, counted in the database so a restart does not reset it. When a budget is spent, that feature reports itself unavailable until the next day (UTC).

| Service | Used for | When it is unset, fails, or runs out of budget |
|---|---|---|
| OpenRouteService | Routes, distance and time | Required. When alternatives exceed the provider’s distance limit, routing retries for one route; other provider errors are shown. If routing fails entirely, the planner shows an error and nothing further can be planned |
| Nominatim (OpenStreetMap) | Place search and naming a dropped pin | Search shows an error. Reverse geocoding falls back to a generic label, so map pins and current-location coordinates remain usable |
| TomTom | Traffic delay and the traffic overlay | Times and fares use no traffic data, and the screens say so. Always the case in Bangladesh, where TomTom has no traffic data |
| OpenWeatherMap | Current weather for trips leaving now; a forecast for scheduled trips | Fares carry no weather adjustment and no vehicle is held back for weather. The screens say so |
| Pathao fare service | Live Pathao pricing | Pathao fares come from the rate card and are labelled "Rate-card estimate" |
| Resend | Password reset emails | The reset page says reset is not set up. Signed-in users are unaffected |
| Teachable Machine model | Photo search | Photo search is disabled with a message; place search still works |
| Live cams app | The embedded camera page | The camera page shows an empty frame. Nothing else depends on it |

### Seeded rates
`pnpm seed:rates` writes 16 vehicle rates: 7 for Bangladesh (Pathao, Uber, CNG) in BDT, 5 for the United States (Uber, Lyft) in USD and 4 for the United Kingdom (Uber, Bolt) in GBP.

- **The figures are approximations, not published tariffs.** The app shows every fare as a range and labels it an estimate.
- To change a rate, edit the `RATES` list in `scripts/seed-vehicle-rates.mts` and run the command again. It updates rows in place, so it is safe to repeat.
- A rate is only ever priced against trips in its own country. Nothing converts between currencies.

### Demo account
The app ships with no account and no sample trips, so each demo starts from a new sign-up.

1. Open `/signup` and register with any email address and a password of at least 8 characters that includes a number. The address is not verified, so it does not need to be real.
2. **Keep the password.** Reset emails reach only the Resend account owner unless a verified sender is configured, so a forgotten demo password usually cannot be recovered.
3. Open **Profile** and choose the country to demo. Bangladesh offers rate-card estimates and, if configured and reachable, live Pathao pricing. Traffic is unavailable there; UK and US traffic requires TomTom configuration and coverage.
4. Plan a trip, pick a route, open its fares and save the plan. That fills the dashboard, trip history and notifications.
5. When finished, delete the account from **Profile**. This removes its trips, saved trips, saved places and notifications.

---

## Demo operations

See [demo security and data operations](docs/demo-operations.md) for password and attempt limits, session/cookie settings, host proxy verification, protected backup/export commands, account cleanup, and request-ID failure logs.

## Contributions
Contributions are welcome!

### You can contribute by:
- Reporting bugs or issues
- Suggesting new features or improvements
- Refactoring code for better performance or readability
- Improving the UI or making it more responsive
- Enhancing documentation and onboarding

### How to contribute:

### 1) Fork the repository

### 2) Clone your fork
```bash
git clone https://github.com/YOUR_USERNAME/nobojatra.git
```

### 3) Create a new branch
```bash
git checkout -b feature-name
```

### 4) Make your changes and commit
```bash
git commit -m "Add: your feature description"
```

### 5) Push to your fork
```bash
git push origin feature-name
```

### 6) Open a Pull Request on GitHub

---

## ⚠️ Known Limitations
- **A saved plan is not a booking.** The app never requests a ride from any provider.
- **Fares are estimates.** They come from a seeded rate card of approximate figures. Only Pathao has live pricing, and only when its service is configured and reachable.
- **Every route is a car route.** Distance and time come from one driving route, whichever vehicle is chosen.
- **No live traffic in Bangladesh.** TomTom has no traffic data there, so Dhaka trips use no traffic delay and have no traffic overlay. Traffic works in the cities TomTom covers, such as London.
- **Trips can be scheduled up to 5 days ahead.** A scheduled trip shows a forecast, which informs but never changes a fare or holds a vehicle back.
- **Place search uses the public OpenStreetMap server**, whose usage policy does not allow search-as-you-type. It is acceptable for a small demo and could be blocked under real traffic. A wider launch needs its own search provider.
- **Password reset emails reach only the Resend account owner** unless `RESEND_FROM_EMAIL` is on a domain verified in Resend. For any other address the page reports success but no email arrives.
- **Email addresses are not verified.** The profile shows the status but offers no way to verify.
- **Photo search recognises a fixed set of Dhaka landmarks** and nothing outside it.
- **The camera page embeds a separate third-party app.** NoboJatra does not control its content or uptime.
- **Limits:** 6 stops and 8 passengers per trip, 20 saved trips per country, and the most recent 100 saved plans in trip history.
- **Rate limits assume one server instance.** They are counted in memory and reset when the server restarts.
- The first visit after a quiet spell can be slow if the host puts idle services to sleep.

---

## Future Development
- Better route comparison filters and smarter ranking logic
- More detailed trip analytics and monthly travel summaries
- Trip reminders and alerts for saved trips
- Expanded live traffic and camera integrations
- Additional fare providers and region coverage
- Better loading, empty, and error states across the app
- Mobile-first polish and more accessible interaction design
- Exporting trip history and fare summaries for users

### Fun fact
The app was named after Bangladesh's only naval submarine unit "BNS Nobojatra"
