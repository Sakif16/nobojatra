# Weather Integration Implementation

## Scope

This module adds weather-aware fare results to NoboJatra. The backend reads current weather from OpenWeatherMap for the selected route midpoint when route geometry is available. If the route midpoint cannot be derived, it falls back to Dhaka coordinates. Weather data is cached for about 10 minutes and is used to calculate a 0-10 severity score. The score then drives vehicle restriction flags in the fare response.

The feature is intentionally non-blocking: if weather lookup fails, fare estimates still return with `weatherUnavailable: true` and no weather restrictions applied.

## Files Created

### `lib/weather.ts`

This is the main server-only weather module.

Responsibilities:

- Keep the OpenWeatherMap API key on the backend only.
- Validate weather coordinates before making an external request.
- Fetch current weather from OpenWeatherMap.
- Normalize OpenWeatherMap response fields into app-specific weather data.
- Cache weather per rounded coordinate for 10 minutes.
- Calculate severity score and severity band.
- Produce vehicle restriction flags from severity.

Important implementation details:

- The file imports `server-only`, so it cannot be bundled into client-side code.
- `OPENWEATHER_API_KEY` is read from `process.env`.
- `OPENWEATHER_BASE_URL` is optional and defaults to `https://api.openweathermap.org/data/2.5`.
- Requests use `/weather` with `units=metric`.
- Fetch timeout is 5 seconds via `AbortSignal.timeout(5000)`.
- Wind speed from OpenWeatherMap is converted from meters per second to kilometers per hour.
- Rain and snow are combined into a single precipitation value in millimeters per hour.

Normalized weather shape:

```ts
type NormalizedWeather = {
  temperatureCelsius: number;
  precipitationMmPerHour: number;
  windKmh: number;
  visibilityMeters: number | null;
  severityScore: number;
  severityBand: "low" | "moderate" | "severe";
  observedAt: string;
  cachedAt: string;
};
```

## Files Changed

### `.env.example`

Added OpenWeatherMap environment variables:

```env
OPENWEATHER_API_KEY=your_openweather_api_key
OPENWEATHER_BASE_URL=https://api.openweathermap.org/data/2.5
```

`OPENWEATHER_API_KEY` is required for live weather lookup. `OPENWEATHER_BASE_URL` exists so tests, mocks, or alternate environments can point the backend at a different compatible endpoint.

### `README.md`

Updated the environment documentation with the weather variables and the backend-only security note.

Key behavior documented:

- Do not expose the key as `NEXT_PUBLIC_OPENWEATHER_API_KEY`.
- Weather is an enhancement for fare restrictions.
- Fare estimates should still render if OpenWeatherMap is unavailable or the key is missing.

### `app/api/fares/route.ts`

The fare API now owns the weather lookup and weather-based restriction application.

Main changes:

- Imports `fetchWeatherForPoint`, `getWeatherVehicleRestriction`, and weather types from `lib/weather.ts`.
- Defines a Dhaka fallback point:

```ts
const DHAKA_WEATHER_FALLBACK = { lat: 23.8103, lng: 90.4125 };
```

- Derives the selected route from authenticated trip history instead of trusting fare details from query params.
- Computes a route midpoint from the selected route coordinates.
- Calls OpenWeatherMap using the route midpoint if available.
- Falls back to Dhaka when no usable route coordinates exist.
- Adds `weather`, `weatherUnavailable`, and per-vehicle weather restriction fields to the JSON response.

Weather response behavior:

```ts
{
  weather: FareWeather | null,
  weatherUnavailable: boolean
}
```

If weather succeeds, the response includes:

```ts
{
  source: "route_midpoint" | "dhaka_fallback",
  temperatureCelsius,
  precipitationMmPerHour,
  windKmh,
  visibilityMeters,
  severityScore,
  severityBand,
  observedAt,
  cachedAt
}
```

If weather fails, the API logs a warning and returns:

```ts
{
  weather: null,
  weatherUnavailable: true
}
```

Fare result objects now include:

```ts
{
  weatherRestricted: boolean,
  weatherBlocked: boolean,
  restrictionReason: string | null
}
```

This lets the UI distinguish between a soft warning and a hard block.

### `components/FareResults.tsx`

The fares UI now displays weather conditions and applies weather availability states.

Main changes:

- Reads `weather` and `weatherUnavailable` from `/api/fares`.
- Shows a weather summary panel above fare options.
- Displays temperature, rain, wind, visibility, severity score, and weather source.
- Shows a weather-unavailable message when the backend cannot fetch weather.
- Moves weather-blocked vehicles into the unavailable section.
- Shows weather warning text on available-but-restricted vehicles.
- Handles missing temperature defensively by rendering a dash instead of `undefined`.

Weather card states:

- Low: neutral card with cloud icon.
- Moderate: caution card with rain icon.
- Severe: destructive warning card with alert icon.
- Unavailable: muted card with offline cloud icon.

### `app/(main)/fares/page.tsx`

The fares page now expects server-backed identifiers instead of raw fare inputs.

Required query params:

```txt
tripHistoryId
routeId
```

If either value is missing, the page redirects to `/`.

This matters because the weather integration depends on trusted stored route geometry. The frontend no longer sends raw distance, duration, passenger count, origin, or destination to calculate fares.

### `components/map/MapDashboardSection.tsx`

The route dashboard now sends the selected stored route to the fares page.

Previous behavior:

- Build `/fares` URL from raw route metrics and labels.

Current behavior:

- Wait for a saved `tripHistoryId`.
- Use the active route id.
- Navigate to:

```txt
/fares?tripHistoryId=<tripHistoryId>&routeId=<routeId>
```

This lets the backend reload the same route from `TripHistory`, calculate weather from real route coordinates, and prevent client-side fare tampering.

## Request Flow

1. User searches a route in `MapDashboardSection`.
2. Route options are saved to `TripHistory`.
3. User selects a route and clicks `View fare estimates`.
4. The app navigates to `/fares?tripHistoryId=...&routeId=...`.
5. `app/(main)/fares/page.tsx` validates that both IDs exist.
6. `FareResults` posts `{ tripHistoryId, routeId }` to `/api/fares`.
7. `/api/fares` authenticates the user.
8. `/api/fares` loads only that user's trip history record.
9. `/api/fares` finds the selected route from stored route options.
10. `/api/fares` computes the route midpoint from stored coordinates.
11. `lib/weather.ts` fetches or reuses cached weather for that point.
12. Weather is normalized into app-level fields.
13. Severity is calculated.
14. Vehicle restrictions are applied to each fare option.
15. The UI renders weather status, available options, and unavailable options.

## Weather Location Logic

The backend prefers the route midpoint because it is more relevant than a fixed city point.

Route midpoint behavior:

- If there are no route coordinates, use Dhaka fallback.
- If there is one coordinate, use that point.
- If there are multiple coordinates, calculate the halfway point by traveled distance along route segments.
- If total route distance is zero, use the middle coordinate in the array.

Fallback point:

```ts
{ lat: 23.8103, lng: 90.4125 }
```

The weather object includes `source` so the UI can show whether the reading came from the route midpoint or the Dhaka fallback.

## Cache Logic

Weather cache lives in memory inside `lib/weather.ts`.

Current behavior:

- Cache TTL is 10 minutes.
- Cache key is rounded latitude and longitude.
- Coordinates are rounded to 3 decimal places.
- Expired cache entries are cleaned before lookup.
- Cache entries include a schema version.

Why schema version exists:

During implementation, temperature was added after the first weather payload shape existed. Old in-memory cache entries could still be missing `temperatureCelsius`, causing the UI to show `undefined`. The cache now stores `schemaVersion` and validates that cached weather has all required fields before reuse.

This cache is process-local. It resets when the Next.js server restarts and is not shared across multiple deployed server instances.

## OpenWeatherMap Normalization

The app consumes a small allowlisted weather shape instead of passing the full OpenWeatherMap response through to the UI.

Mapped fields:

- `main.temp` -> `temperatureCelsius`
- `rain["1h"]` -> rain precipitation
- `snow["1h"]` -> snow precipitation
- `rain["1h"] + snow["1h"]` -> `precipitationMmPerHour`
- `wind.speed` -> converted to `windKmh`
- `visibility` -> `visibilityMeters`
- `dt` -> `observedAt`
- current server time -> `cachedAt`

Required fields:

- temperature
- wind speed

Optional fields:

- visibility
- rain
- snow

Missing precipitation is treated as `0`. Missing or invalid visibility becomes `null`.

## Severity Logic

Severity is calculated as a weighted score from 0 to 10.

Weights:

- Precipitation: 50 percent
- Wind: 30 percent
- Visibility: 20 percent

Formula:

```ts
severityScore =
  precipitationScore * 0.5 +
  windScore * 0.3 +
  visibilityScore * 0.2
```

The final score is rounded to one decimal place and clamped between 0 and 10.

### Precipitation Score

| Precipitation | Score |
| --- | ---: |
| 0 mm/h | 0 |
| Up to 2 mm/h | 2 |
| Up to 7.5 mm/h | 5 |
| Up to 15 mm/h | 8 |
| Above 15 mm/h | 10 |

### Wind Score

| Wind | Score |
| --- | ---: |
| Below 15 km/h | 0 |
| Up to 30 km/h | 3 |
| Up to 45 km/h | 6 |
| Above 45 km/h | 9 |

### Visibility Score

| Visibility | Score |
| --- | ---: |
| Missing | 0 |
| Above 5000 m | 0 |
| 2000 m to 5000 m | 3 |
| 1000 m to 1999 m | 6 |
| Below 1000 m | 9 |

### Severity Bands

| Score | Band |
| --- | --- |
| Below 3.5 | Low |
| 3.5 to below 7 | Moderate |
| 7 and above | Severe |

Example:

```txt
0 mm/h precipitation, 11.5 km/h wind, 10000 m visibility
precipitation score = 0
wind score = 0
visibility score = 0
severity score = 0/10
band = low
```

This is why clear Dhaka conditions can correctly render as `Low weather impact`.

## Vehicle Restriction Logic

Vehicle restrictions are calculated in `getWeatherVehicleRestriction`.

### Bike and Moto

Low severity:

- No restriction.

Moderate severity:

- `weatherRestricted: true`
- `weatherBlocked: false`
- Warning reason: rain, wind, or low visibility may affect two-wheelers.

Severe severity:

- `weatherRestricted: true`
- `weatherBlocked: true`
- Blocking reason: bike services are blocked due to severe weather.

### CNG

CNG is intentionally less aggressive than bikes/motos.

Current rule:

- CNG is blocked only when `severityScore >= 9`.
- CNG is not warned or blocked for ordinary severe-band weather below 9.

This was adjusted after the CNG issue was found. The original implementation warned CNG during severe weather, but the requirement says CNG should only be affected at extreme severity.

### Cars and Other Providers

Low or moderate severity:

- No restriction.

Severe severity:

- `weatherRestricted: true`
- `weatherBlocked: false`
- Warning reason: severe weather may affect travel time and availability.

## UI Behavior

The weather card appears above fare options when either weather data exists or weather is unavailable.

When weather data is available, it shows:

- Weather impact title.
- Severity score out of 10.
- Temperature in Celsius.
- Precipitation in mm/h.
- Wind in km/h.
- Visibility in meters or kilometers.
- Source label: route midpoint or Dhaka fallback.

When weather is unavailable, it shows:

```txt
Weather data unavailable
Showing normal fare estimates without weather restrictions.
```

Available fare options exclude weather-blocked vehicles. Weather-restricted but not blocked vehicles remain available with a warning message.

Unavailable fare options include:

- Vehicles blocked by passenger capacity.
- Vehicles blocked by weather.

## Fallback Behavior

Weather failure does not fail fare calculation.

Handled weather failure cases include:

- Missing `OPENWEATHER_API_KEY`.
- Invalid weather coordinates.
- OpenWeatherMap request timeout.
- OpenWeatherMap non-2xx response.
- Invalid JSON response.
- Missing required temperature.
- Missing required wind speed.

In these cases:

- The backend returns `weather: null`.
- The backend returns `weatherUnavailable: true`.
- No weather restrictions are applied.
- Normal fare estimates continue to render.

## Security and Data Integrity

The weather module is connected to a broader fare security improvement.

Important choices:

- The OpenWeatherMap key is server-only.
- The fares page uses `tripHistoryId` and `routeId`, not client-supplied distance or duration.
- `/api/fares` authenticates the user before returning fares.
- Trip history lookup is owner-scoped by `userId`.
- Distance, duration, passengers, and route geometry come from stored server data.

This prevents a user from changing query params to manipulate fare calculations.

## Verification Completed

The following checks were run during implementation:

```bash
./node_modules/.bin/eslint lib/weather.ts app/api/fares/route.ts components/FareResults.tsx 'app/(main)/fares/page.tsx' components/map/MapDashboardSection.tsx
./node_modules/.bin/next build
git diff --check
```

Observed verification results:

- Focused lint passed.
- Next.js production build passed.
- Whitespace check passed.
- Unauthenticated `POST /api/fares` returned `401`.
- `/fares` without required IDs redirected to `/`.
- `/fares?tripHistoryId=...&routeId=...` rendered the fares page shell.

Manual UI observation:

- A low-impact weather card rendered with precipitation, wind, visibility, severity score, and route midpoint source.
- Temperature display was added after the first UI version.
- The old cached-weather `undefined` temperature issue was fixed with cache schema validation and a defensive UI formatter.

## Remaining Gaps

Authenticated end-to-end verification with a real signed-in browser session was not completed because no connected browser session was available.

Recommended next checks:

- Sign in locally and run one real route through dashboard -> fare page.
- Confirm Network response from `/api/fares` includes `weather.temperatureCelsius`.
- Confirm moderate weather marks bikes/motos as restricted but still available.
- Confirm severe weather blocks bikes/motos.
- Confirm CNG is blocked only when `severityScore >= 9`.
- Add unit tests for `calculateWeatherSeverity`.
- Add unit tests for `getWeatherVehicleRestriction`.
- Add an API test with a mocked OpenWeatherMap response.

Known non-weather caveat:

- Weather lookup failures are caught and do not block fares.
- Pathao fare provider errors are still not isolated per provider, so a Pathao failure can still fail the full fare response. That is outside the weather module but worth fixing separately.

