# NoboJatra Project Summary and Country-Aware Dashboard Feature Guide

## 1) Project overview

This repository is a Next.js travel planning application for route finding, fare estimates, traffic and weather-aware trip decisions, saved trips, and user profiles. The app is organized around a server-rendered Next.js app with route handlers in `app/api`, UI components in `components`, reusable business logic in `lib`, and persisted data models in `models`.

The current app already contains:

- Auth and user session management
- Route planning and route alternatives
- Traffic and weather integration
- Fare estimation and vehicle/provider logic
- Saved trips and trip history
- User profile storage in MongoDB
- Home dashboard and map-driven trip UI

---

## 2) Folder structure and what each folder does

### Root files

- [package.json](package.json) — project metadata and scripts (`dev`, `build`, `lint`, seed scripts)
- [README.md](README.md) — setup instructions and environment variables
- [next.config.ts](next.config.ts) — Next.js config
- [tsconfig.json](tsconfig.json) — TypeScript config
- [components.json](components.json) — shadcn/ui component config
- [eslint.config.mjs](eslint.config.mjs) — linting rules
- [postcss.config.mjs](postcss.config.mjs) — PostCSS config
- [pnpm-lock.yaml](pnpm-lock.yaml) — lockfile

### App routing

- [app/layout.tsx](app/layout.tsx) — global app layout
- [app/globals.css](app/globals.css) — global styles and theme variables
- [app/(auth)](app/(auth)) — authentication pages (signin, signup, forgot password, reset password)
- [app/(main)](app/(main)) — authenticated user pages such as home, dashboard, fares, trip history, saved trips, profile, live cams
- [app/api](app/api) — backend route handlers for auth, trips, fares, traffic, map tiles, profile, alerts, and best-options

### Main app pages

- [app/(main)/page.tsx](app/(main)/page.tsx) — main home page; checks session and loads either anonymous or authenticated home
- [app/(main)/dashboard/page.tsx](app/(main)/dashboard/page.tsx) — redirecting dashboard page to the main home planner
- [app/(main)/fares/page.tsx](app/(main)/fares/page.tsx) — fare comparison UI
- [app/(main)/best-options/page.tsx](app/(main)/best-options/page.tsx) — best route/option ranking UI
- [app/(main)/scheduled-trips/page.tsx](app/(main)/scheduled-trips/page.tsx) — upcoming trips
- [app/(main)/trip-history/page.tsx](app/(main)/trip-history/page.tsx) — user trip history
- [app/(main)/saved-trips/page.tsx](app/(main)/saved-trips/page.tsx) — saved trip workflow
- [app/(main)/profile/page.tsx](app/(main)/profile/page.tsx) — profile editing
- [app/(main)/live-cams/page.tsx](app/(main)/live-cams/page.tsx) — live traffic/camera view

### UI components

- [components/home](components/home) — landing/home dashboard components
  - [components/home/AnonymousHome.tsx](components/home/AnonymousHome.tsx)
  - [components/home/AuthedHome.tsx](components/home/AuthedHome.tsx)
  - [components/home/HomeContent.tsx](components/home/HomeContent.tsx)
  - [components/home/PlanAgainCards.tsx](components/home/PlanAgainCards.tsx)
  - [components/home/SuggestionTiles.tsx](components/home/SuggestionTiles.tsx)
- [components/map](components/map) — route form, autocomplete, route map, route result cards
  - [components/map/RouteFinderForm.tsx](components/map/RouteFinderForm.tsx)
  - [components/map/PlaceAutocomplete.tsx](components/map/PlaceAutocomplete.tsx)
  - [components/map/RouteMap.tsx](components/map/RouteMap.tsx)
  - [components/map/RouteResults.tsx](components/map/RouteResults.tsx)
  - [components/map/MapDashboardSection.tsx](components/map/MapDashboardSection.tsx)
- [components/FareResults.tsx](components/FareResults.tsx) — fare cards UI
- [components/BestOptionsResults.tsx](components/BestOptionsResults.tsx) — best-options comparison UI
- [components/TripSummary.tsx](components/TripSummary.tsx) — trip summary detail card
- [components/ScheduledTripsList.tsx](components/ScheduledTripsList.tsx) — upcoming trip list
- [components/TripHistoryList.tsx](components/TripHistoryList.tsx) — trip history list
- [components/notifications](components/notifications) — notifications UI
- [components/ui](components/ui) — shared design-system UI primitives

### Business logic and service layer

- [lib/auth.ts](lib/auth.ts) — Better Auth setup and auth config
- [lib/auth-client.ts](lib/auth-client.ts) — client-side auth helper
- [lib/mongodb.ts](lib/mongodb.ts) — MongoDB connection helper
- [lib/trip-input.ts](lib/trip-input.ts) — trip validation, route input rules, service area guardrails
- [lib/routing.ts](lib/routing.ts) — route fetching, traffic mapping, route metadata
- [lib/traffic-service.ts](lib/traffic-service.ts) — traffic processing and live traffic API integration
- [lib/weather.ts](lib/weather.ts) — weather normalization, severity scoring, restrictions
- [lib/fare-providers.ts](lib/fare-providers.ts) — fare estimation and provider adjustments
- [lib/route-scoring.ts](lib/route-scoring.ts) — route ranking and score calculations
- [lib/route-service.ts](lib/route-service.ts) — route service abstraction
- [lib/geocode.ts](lib/geocode.ts) — location geocoding and reverse-geocoding
- [lib/saved-trips.ts](lib/saved-trips.ts) — saved trip logic and alert evaluation integration
- [lib/trip-history.ts](lib/trip-history.ts) — trip history queries and snapshots
- [lib/alerts.ts](lib/alerts.ts) — alert generation logic
- [lib/account-cleanup.ts](lib/account-cleanup.ts) — user cleanup logic
- [lib/pending-trip.ts](lib/pending-trip.ts) — pending trip handling
- [lib/rate-limit.ts](lib/rate-limit.ts) — rate limiting
- [lib/utils.ts](lib/utils.ts) — general utilities

### Data models

- [models/UserProfile.ts](models/UserProfile.ts) — user preferences, defaults, saved places
- [models/SavedTrip.ts](models/SavedTrip.ts) — saved trip entries
- [models/TripHistory.ts](models/TripHistory.ts) — historical trip records
- [models/VehicleRate.ts](models/VehicleRate.ts) — provider/vehicle pricing seed data
- [models/Alert.ts](models/Alert.ts) — alert schema
- [models/Camera.ts](models/Camera.ts) — camera metadata
- [models/Map_route.ts](models/Map_route.ts) — map-route records
- [models/Place.ts](models/Place.ts) — saved place data
- [models/TrafficData.ts](models/TrafficData.ts) — traffic snapshot data

### API layer

- [app/api/auth](app/api/auth) — auth endpoints
- [app/api/trip-input](app/api/trip-input) — trip route planning and validation endpoints
- [app/api/traffic](app/api/traffic) — traffic data fetchers
- [app/api/fares](app/api/fares) — fare generation endpoints
- [app/api/best-options](app/api/best-options) — ranking route/service options
- [app/api/map_routes](app/api/map_routes) — map route fetching
- [app/api/camera](app/api/camera) — camera/live data endpoints
- [app/api/places](app/api/places) — place geocoding endpoints
- [app/api/saved-trips](app/api/saved-trips) — saved trip endpoints
- [app/api/profile](app/api/profile) — profile update endpoints
- [app/api/tiles](app/api/tiles) — map tile proxy endpoints
- [app/api/alerts](app/api/alerts) — active alerts and alert evaluation endpoints

### Supporting folders

- [public](public) — static files and assets
- [scripts](scripts) — utility scripts for seed data and API testing
- [patches](patches) — patch files for installed dependencies
- [.next](.next) — generated build output (not source)
- [node_modules](node_modules) — installed dependencies

---

## 3) How the current app is structured around key features

### User profile and saved data

The user data model is centered on [models/UserProfile.ts](models/UserProfile.ts). It stores:

- `userId`
- `defaultTravelPriority`
- `defaultPassengerCount`
- `savedPlaces`

The home page in [app/(main)/page.tsx](app/(main)/page.tsx) reads the current session, fetches the profile, and passes the home data to [components/home/AuthedHome.tsx](components/home/AuthedHome.tsx).

### Route planning and map rendering

The main planning flow is:

1. User enters origin and destination in [components/map/RouteFinderForm.tsx](components/map/RouteFinderForm.tsx)
2. Input is validated in [lib/trip-input.ts](lib/trip-input.ts)
3. Route query is sent via [lib/routing.ts](lib/routing.ts)
4. Map is rendered in [components/map/RouteMap.tsx](components/map/RouteMap.tsx)
5. Route results and pricing are displayed in [components/map/RouteResults.tsx](components/map/RouteResults.tsx)

### Weather, fare, and traffic logic

- [lib/weather.ts](lib/weather.ts) computes severity and restrictions using weather inputs
- [lib/fare-providers.ts](lib/fare-providers.ts) calculates fare estimates with provider fallbacks and weather/traffic multipliers
- [lib/traffic-service.ts](lib/traffic-service.ts) provides live traffic calculations
- [app/api/fares/route.ts](app/api/fares/route.ts) and [app/api/best-options/route.ts](app/api/best-options/route.ts) are the main price/option endpoints

This is the part that can be extended for country-aware pricing and service behavior.

---

## 4) Feature requirement: user country selection + country-specific map and services

### Requirement summary

A user should choose a country from a dropdown with 3 options:

- US
- UK
- BD

Then:

- The dashboard loads the correct map provider/data for that country
- The available ride services change by country
  - BD: Uber, Pathao, CNG
  - US: Uber, Lyft
  - UK: Uber, Bolt
- Weather data also changes depending on the selected country

This should work in a way that is compatible with the current architecture and should not hardcode all logic into one page.

---

## 5) Recommended implementation design

### 5.1 Add a country field to the user profile

Add a `country` property to [models/UserProfile.ts](models/UserProfile.ts).

Suggested schema:

```ts
export const COUNTRY_OPTIONS = ["US", "UK", "BD"] as const;
export type CountryCode = (typeof COUNTRY_OPTIONS)[number];

country: {
  type: String,
  enum: COUNTRY_OPTIONS,
  default: "BD",
  required: true,
  index: true,
}
```

This makes the country a persistent user preference, so it survives reloads and can be reused across the app.

### 5.2 Create a country configuration module

Create a central config file such as:

- `lib/country-config.ts`

This file should define the mapping for each country:

```ts
export const COUNTRY_OPTIONS = ["US", "UK", "BD"] as const;
export type CountryCode = (typeof COUNTRY_OPTIONS)[number];

export type CountryConfig = {
  label: string;
  mapProvider: "mapbox" | "tomtom" | "google" | "osm";
  mapStyle: string;
  weatherSource: "openweather" | "metoffice" | "weatherapi";
  providers: Array<{ id: string; label: string; type: "ride" | "motorbike" | "auto" }>;
  serviceAreaName: string;
  defaultLocation?: { lat: number; lng: number; label: string };
};

export const COUNTRY_CONFIG: Record<CountryCode, CountryConfig> = {
  US: {
    label: "United States",
    mapProvider: "mapbox",
    mapStyle: "mapbox/streets-v12",
    weatherSource: "openweather",
    providers: [
      { id: "uber", label: "Uber" },
      { id: "lyft", label: "Lyft" },
    ],
    serviceAreaName: "United States",
  },
  UK: {
    label: "United Kingdom",
    mapProvider: "mapbox",
    mapStyle: "mapbox/streets-v12",
    weatherSource: "openweather",
    providers: [
      { id: "uber", label: "Uber" },
      { id: "bolt", label: "Bolt" },
    ],
    serviceAreaName: "United Kingdom",
  },
  BD: {
    label: "Bangladesh",
    mapProvider: "osm",
    mapStyle: "osm",
    weatherSource: "openweather",
    providers: [
      { id: "uber", label: "Uber" },
      { id: "pathao", label: "Pathao" },
      { id: "cng", label: "CNG" },
    ],
    serviceAreaName: "Dhaka Division",
    defaultLocation: { lat: 23.8103, lng: 90.4125, label: "Dhaka" },
  },
};
```

This keeps the logic centralized and avoids scattering `if (country === "BD")` checks everywhere.

### 5.3 Add country selection to user profile or onboarding flow

The most practical place is the profile or home page, before they plan routes.

Recommended behavior:

- Add a country dropdown in [components/home/AuthedHome.tsx](components/home/AuthedHome.tsx) or in a profile settings section
- Save it to MongoDB by calling an API route under [app/api/profile](app/api/profile)
- On next load, read it from the profile and use it as the default country

Minimal profile update route example:

```ts
// app/api/profile/country/route.ts
export async function POST(req: Request) {
  const { country } = await req.json();
  // validate country against COUNTRY_OPTIONS
  // update UserProfile where userId === session.user.id
}
```

### 5.4 Replace hardcoded Dhaka-only assumptions

The current app has Dhaka-specific assumptions in several places, including:

- [lib/trip-input.ts](lib/trip-input.ts) contains `SERVICE_AREA_NAME` and `SERVICE_AREA_BOUNDS`
- [app/api/fares/route.ts](app/api/fares/route.ts) sets a Dhaka weather fallback
- [components/map/RouteMap.tsx](components/map/RouteMap.tsx) currently assumes the map context is a generic route map with traffic overlays

These should become country-aware in a layered way:

- `country` selects the active config
- `serviceArea` and `default location` are resolved from config
- weather fallback coordinates are country-specific
- provider list is filtered from `COUNTRY_CONFIG[country].providers`

### 5.5 Country-specific service switching

The fare and provider logic should not be a hardcoded `uber/pathao/cng` list only for BD.

Current fare provider logic is already centralized in [lib/fare-providers.ts](lib/fare-providers.ts), which is the correct place to handle vehicle/provider logic.

Recommended approach:

```ts
export function getProviderOptionsForCountry(country: CountryCode) {
  return COUNTRY_CONFIG[country].providers.map((p) => p.id);
}
```

Then when fetching fares or best options:

```ts
const allowedProviders = getProviderOptionsForCountry(country);
const filteredRates = allVehicleRates.filter((rate) =>
  allowedProviders.includes(rate.provider)
);
```

This is better than having multiple `if (country === "BD")` scattered in components.

### 5.6 Country-specific map selection

The route map uses a generic TileLayer config in [components/map/RouteMap.tsx](components/map/RouteMap.tsx). It currently chooses:

- Mapbox token if available
- otherwise OpenStreetMap tiles

For a country-aware version, make the tile source depend on the selected country config.

Example:

```ts
const mapTileUrl =
  country === "US" || country === "UK"
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
```

If you need a truly region-specific map provider, you can add a country-specific style field to the config and decide between:

- Mapbox US/UK styles
- OpenStreetMap for BD
- TomTom / custom provider if the project later adds it

### 5.7 Country-specific weather data and fallback behavior

Weather is fetched in [lib/weather.ts](lib/weather.ts). Right now the app assumes a Dhaka location as a fallback in [app/api/fares/route.ts](app/api/fares/route.ts) and [app/api/best-options/route.ts](app/api/best-options/route.ts).

The fix is to make the fallback point country-aware:

```ts
const COUNTRY_FALLBACK_COORDINATES = {
  US: { lat: 40.7128, lng: -74.006 },
  UK: { lat: 51.5072, lng: -0.1276 },
  BD: { lat: 23.8103, lng: 90.4125 },
};
```

Then:

- `country` selects the fallback coordinates
- `weatherSource` can be chosen per country
- if the route midpoint is unavailable, use the default coordinates for that country

### 5.8 How the app flow should look end to end

1. User logs in
2. Profile is loaded from MongoDB
3. `country` is read and stored in app state
4. Home/dashboard render uses the selected `country`
5. Map UI and service provider list are switched to that country's config
6. Route planning respects the region-specific service area and default map center
7. Fare API filters providers by country
8. Weather API gets location data based on the country
9. Best options and trip results show the correct ride set and weather restrictions

---

## 6) Suggested implementation steps in order

### Step 1 — Database profile change

- Update [models/UserProfile.ts](models/UserProfile.ts)
- Add `country` with `enum: ["US", "UK", "BD"]`
- Set default to `BD` for backward compatibility

### Step 2 — Shared country config

- Create `lib/country-config.ts`
- Centralize country options, map settings, provider lists, fallback weather point, names

### Step 3 — Profile save API

- Add or update profile API under [app/api/profile](app/api/profile)
- Function: save the selected country to the current user profile

### Step 4 — Home/dashboard country selector

- Update [app/(main)/page.tsx](app/(main)/page.tsx) and [components/home/AuthedHome.tsx](components/home/AuthedHome.tsx)
- Add dropdown with `US`, `UK`, `BD`
- Use the selected value to load country-specific UI config

### Step 5 — Route map adjustment

- Update [components/map/RouteMap.tsx](components/map/RouteMap.tsx)
- Use the country config to switch tile provider and fallback/default location

### Step 6 — Provider filtering

- Update [lib/fare-providers.ts](lib/fare-providers.ts)
- Filter vehicle/provider options based on selected country
- Keep `uber` available across all countries if required

### Step 7 — Weather fallback and weather rules

- Update [app/api/fares/route.ts](app/api/fares/route.ts)
- Update [app/api/best-options/route.ts](app/api/best-options/route.ts)
- Replace Dhaka-only fallback with `COUNTRY_CONFIG[country].fallbackWeatherPoint`

### Step 8 — Validation and country service area

- Update [lib/trip-input.ts](lib/trip-input.ts)
- Replace `SERVICE_AREA_BOUNDS` and `SERVICE_AREA_NAME` with country-aware service validation

### Step 9 — Final UX pass

- Messages should say things like: “Showing routes for the UK”, “Available services: Uber, Bolt”
- Add country labels to route results and alerts so the user understands the data source

---

## 7) Recommended code structure for the feature

A clean structure would look like this:

```txt
lib/
  country-config.ts
  country-service.ts
  location-context.ts
  provider-registry.ts
```

and then the main app uses a simple pattern:

```ts
const country = profile?.country ?? "BD";
const countryConfig = COUNTRY_CONFIG[country];
```

This avoids repeated branching and makes future countries easier to add.

---

## 8) Good practice guidance

- Keep map, weather, and provider logic separate from page UI
- Prefer config-driven design over scattered `if` statements
- Use centralized constants and a single source of truth
- Ensure fallback values are valid for each country
- Save the country in the user profile so it stays persistent across sessions
- Keep the data transformer between API responses and UI consistent

---

## 9) Summary

This project is already structured well for this feature because:

- The app has centralized business logic under `lib/`
- User settings are stored in `models/UserProfile.ts`
- Route, weather, and fare logic are separated and can be configured by country
- Map and provider behavior are already abstracted enough to support a country-based switch

The best implementation is not to bolt country logic directly into one page, but to introduce a shared country config and pull provider, map, weather, and route validation from that config everywhere the app needs it.

If implemented well, this feature will make the app feel like a true multi-region travel planner without breaking the existing Dhaka-first architecture.
