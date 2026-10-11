import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

const POINT = { lat: 23.8103, lng: 90.4125 };
const NOW = Date.parse("2026-10-12T06:10:00Z");
const HOUR = 60 * 60 * 1000;

const step = (iso, overrides = {}) => ({
  dt: Date.parse(iso) / 1000,
  main: { temp: 29 },
  wind: { speed: 2 },
  visibility: 10_000,
  ...overrides,
});

// Three-hour steps from 09:00 on the 12th to 06:00 on the 17th, as the
// provider returns them: forty entries, a little under five days.
const FORECAST = Array.from({ length: 40 }, (_, index) =>
  step(new Date(Date.parse("2026-10-12T09:00:00Z") + index * 3 * HOUR).toISOString()),
);
// A wet, windy step at 09:00 on the 14th.
FORECAST[16] = step("2026-10-14T09:00:00Z", { rain: { "3h": 36 }, wind: { speed: 14 }, visibility: 900 });

/** lib/weather with the provider replaced, and a record of what was asked for. */
async function withProvider(body) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENWEATHER_API_KEY;
  const requests = [];
  process.env.OPENWEATHER_API_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const endpoint = new URL(url).pathname.split("/").pop();
    requests.push(endpoint);
    return {
      ok: true,
      json: async () =>
        endpoint === "forecast"
          ? { list: FORECAST }
          : { dt: NOW / 1000, main: { temp: 31 }, wind: { speed: 1 }, visibility: 10_000, rain: { "1h": 0.4 } },
    };
  };

  try {
    return await body(load("lib/weather.ts"), requests);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = previousKey;
  }
}

const scheduled = (iso) => ({ mode: "scheduled", scheduledAt: iso });

test("a trip leaving now gets the current reading, a later one gets the forecast", async () => {
  await withProvider(async (weather, requests) => {
    const now = await weather.fetchWeatherForDeparture(POINT, { mode: "now" }, NOW);
    assert.equal(now.kind, "current");
    assert.equal(now.forecastFor, null);
    assert.equal(now.temperatureCelsius, 31);

    // Forty minutes away: what is outside now describes it better than the
    // next three-hour step.
    const soon = await weather.fetchWeatherForDeparture(POINT, scheduled("2026-10-12T06:50:00Z"), NOW);
    assert.equal(soon.kind, "current");

    const later = await weather.fetchWeatherForDeparture(POINT, scheduled("2026-10-14T08:20:00Z"), NOW);
    assert.equal(later.kind, "forecast");
    // The step nearest the departure, not the first or the next one.
    assert.equal(later.forecastFor, "2026-10-14T09:00:00.000Z");
    // 36 mm over the three-hour step is 12 mm an hour.
    assert.equal(later.precipitationMmPerHour, 12);
    assert.equal(later.windKmh, 50.4);
    assert.equal(later.severityBand, "severe");

    assert.deepEqual(requests, ["weather", "forecast"]);
  });
});

test("one forecast download answers every departure at that point", async () => {
  await withProvider(async (weather, requests) => {
    for (const time of ["2026-10-13T03:00:00Z", "2026-10-14T09:00:00Z", "2026-10-16T21:10:00Z"]) {
      const reading = await weather.fetchWeatherForDeparture(POINT, scheduled(time), NOW);
      assert.equal(reading.kind, "forecast");
    }

    assert.deepEqual(requests, ["forecast"]);
  });
});

test("the forecast covers the whole scheduling window and nothing past it", async () => {
  const { SCHEDULE_WINDOW_DAYS } = load("lib/trip-input.ts");
  assert.equal(SCHEDULE_WINDOW_DAYS, 5);

  await withProvider(async (weather) => {
    // The last moment that can be scheduled: five days from now.
    const edge = new Date(NOW + SCHEDULE_WINDOW_DAYS * 24 * HOUR).toISOString();
    const reading = await weather.fetchWeatherForDeparture(POINT, scheduled(edge), NOW);
    assert.equal(reading.kind, "forecast");
    assert.equal(reading.forecastFor, "2026-10-17T06:00:00.000Z");

    await assert.rejects(
      weather.fetchWeatherForDeparture(POINT, scheduled("2026-10-19T09:00:00Z"), NOW),
      /No forecast is available/,
    );
  });
});

test("a departure can be scheduled up to five days ahead and no further", () => {
  const { validateTripInput } = load("lib/trip-input.ts");
  const validate = (scheduledAt) =>
    validateTripInput(
      {
        origin: { label: "A", lat: 23.7461, lng: 90.3742 },
        destination: { label: "B", lat: 23.8759, lng: 90.3795 },
        passengerCount: 1,
        departureMode: "scheduled",
        scheduledAt,
      },
      new Date(NOW),
      "BD",
      () => "Asia/Dhaka",
    );

  assert.equal(validate(new Date(NOW + 5 * 24 * HOUR).toISOString()).success, true);
  assert.equal(
    validate(new Date(NOW + 5 * 24 * HOUR + 60_000).toISOString()).errors.scheduledAt,
    "Scheduled departure time must be within the next 5 days.",
  );
});

test("a forecast adds a caution but never removes a vehicle", () => {
  const { getWeatherVehicleRestriction } = load("lib/weather.ts");
  const bike = { provider: "pathao", vehicleType: "bike" };
  const cng = { provider: "cng", vehicleType: "auto" };
  const car = { provider: "uber", vehicleType: "go" };
  const reading = (kind, severityScore, severityBand) => ({ kind, severityScore, severityBand });

  // Now: severe weather takes the bike off the list.
  assert.equal(getWeatherVehicleRestriction(bike, reading("current", 8, "severe")).weatherBlocked, true);
  assert.equal(getWeatherVehicleRestriction(cng, reading("current", 9.5, "severe")).weatherBlocked, true);

  // Forecast: the same figures only warn, and say it is a forecast.
  for (const vehicle of [bike, cng, car]) {
    const forecast = getWeatherVehicleRestriction(vehicle, reading("forecast", 9.5, "severe"));
    assert.equal(forecast.weatherBlocked, false);
    assert.equal(forecast.weatherRestricted, true);
    assert.match(forecast.restrictionReason, /forecast/);
  }
  assert.match(
    getWeatherVehicleRestriction(bike, reading("forecast", 4, "moderate")).restrictionReason,
    /is forecast for this departure/,
  );
  assert.deepEqual(getWeatherVehicleRestriction(bike, reading("forecast", 1, "low")), {
    weatherRestricted: false,
    weatherBlocked: false,
    restrictionReason: null,
  });
  // A reading with no kind is an older, current one and behaves as before.
  assert.equal(getWeatherVehicleRestriction(bike, { severityScore: 8, severityBand: "severe" }).weatherBlocked, true);
});

test("a forecast does not change a fare", () => {
  const context = load("lib/fare-trip-context.ts", {
    "@/lib/mongodb": async () => {},
    "@/models/TripHistory": {},
    "@/lib/weather": { fetchWeatherForDeparture: async () => null },
    "@/lib/traffic-service": {
      TrafficServiceError: class TrafficServiceError extends Error {},
      getTrafficForTrip: async () => null,
      isDeparturePeakHour: () => false,
    },
  });
  const { getFareAdjustment } = load("lib/fare-providers.ts");
  const storm = { severityScore: 9, severityBand: "severe" };
  const adjust = (weather) =>
    getFareAdjustment(
      { provider: "uber", vehicleType: "go" },
      context.getFareAdjustmentContext({ isPeakHour: false }, weather, null),
    );

  // The same storm: priced in when it is happening, shown only when it is forecast.
  assert.ok(adjust({ ...storm, kind: "current" }).weatherMultiplier > 1);
  assert.equal(adjust({ ...storm, kind: "forecast" }), null);
});

test("the severity rule's limit is real, and the screens say so", () => {
  const { calculateWeatherSeverity } = load("lib/weather.ts");
  const { WEATHER_SEVERITY_LIMITS, getWeatherReadingLabel } = load("lib/weather-reading.ts");

  // Torrential rain with calm wind and clear visibility: only "moderate".
  assert.deepEqual(
    calculateWeatherSeverity({ precipitationMmPerHour: 30, windKmh: 5, visibilityMeters: 10_000 }),
    { severityScore: 5, severityBand: "moderate" },
  );
  assert.match(WEATHER_SEVERITY_LIMITS, /heavy rain on its own rates as moderate/);
  assert.match(WEATHER_SEVERITY_LIMITS, /not a safety assessment/);

  assert.equal(getWeatherReadingLabel({ kind: "current" }, "Asia/Dhaka"), "Current conditions");
  assert.equal(getWeatherReadingLabel({}, "Asia/Dhaka"), "Current conditions");
  assert.match(
    getWeatherReadingLabel({ kind: "forecast", forecastFor: "2026-10-14T09:00:00.000Z" }, "Asia/Dhaka"),
    /^Forecast for Wed, Oct 14, 3:00\sPM GMT\+6$/,
  );
});
