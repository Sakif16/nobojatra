import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { load, root } from "./support/load.mjs";

const env = load("lib/env.ts");
const valid = {
  MONGODB_URI: "mongodb://localhost:27017",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  ORS_API_KEY: "test-routing-key",
};
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// No credentials, database or provider calls are needed for these checks.
test("required settings are reported together, without leaking their values", () => {
  assert.equal(env.checkEnvironment({}).problems.length, 4);
  assert.deepEqual(env.checkEnvironment(valid).problems, []);
  const report = env.checkEnvironment({
    ...valid,
    MONGODB_URI: "bad-private-connection",
    BETTER_AUTH_SECRET: "short-private-secret",
    BETTER_AUTH_URL: "file:///private-location",
    ORS_API_KEY: "your_openrouteservice_api_key",
  });
  assert.equal(report.problems.length, 4);
  const message = env.formatEnvironmentReport(report);
  for (const name of Object.keys(valid)) assert.ok(message.includes(name));
  assert.doesNotMatch(message, /bad-private-connection|short-private-secret|private-location/);
});

test("copied placeholders and whitespace never enable optional features", () => {
  for (const value of [undefined, "", "  ", "your_test_key"]) {
    assert.equal(env.isConfigured(value), false);
    assert.deepEqual(env.getServerFeatures({
      TOMTOM_API_KEY: value, OPENWEATHER_API_KEY: value, RESEND_API_KEY: value,
    }), { liveTraffic: false, weather: false, passwordResetEmail: false });
  }
  assert.equal(env.checkEnvironment(valid).unavailable.length, 5);
  assert.deepEqual(env.getServerFeatures({
    TOMTOM_API_KEY: "traffic-key", OPENWEATHER_API_KEY: "weather-key", RESEND_API_KEY: "email-key",
  }), env.ALL_FEATURES_ON);
});

test("startup rejects missing requirements but skips Edge and build registration", () => {
  const previous = {};
  const names = [...Object.keys(valid), "NEXT_RUNTIME", "NEXT_PHASE", "NODE_ENV"];
  for (const name of names) previous[name] = process.env[name];
  try {
    for (const name of Object.keys(valid)) delete process.env[name];
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    const { register } = load("instrumentation.ts");
    assert.throws(register, /MONGODB_URI.*not set/s);
    process.env.NEXT_PHASE = "phase-production-build";
    assert.doesNotThrow(register);
    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "edge";
    assert.doesNotThrow(register);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("unset optional providers fail before making an outbound request", async () => {
  const previousFetch = globalThis.fetch;
  const names = ["TOMTOM_API_KEY", "OPENWEATHER_API_KEY", "PATHAO_FARE_API"];
  const previous = names.map((name) => process.env[name]);
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("Unexpected provider request"); };
  try {
    for (const value of ["", "your_test_key"]) {
      for (const name of names) process.env[name] = value;
      await assert.rejects(load("lib/traffic-service.ts").getTrafficForTrip([
        { lat: 51.5072, lng: -0.1276 }, { lat: 51.5416, lng: -0.0034 },
      ], { mode: "now" }, "UK"));
      await assert.rejects(load("lib/weather.ts").fetchWeatherForPoint({ lat: 51.5072, lng: -0.1276 }));
      await assert.rejects(load("lib/fare-providers.ts").fetchPathaoFare({}));
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});

test("the setup covers every required and optional variable", () => {
  for (const variable of [...env.REQUIRED_VARIABLES, ...env.OPTIONAL_VARIABLES]) {
    assert.ok(read("README.md").includes(variable.name), variable.name);
    assert.ok(read(".env.example").includes(`${variable.name}=`), variable.name);
  }
});

test("profile rendering uses the shared read, and unavailable photo search explains its disabled controls", () => {
  const profile = read("app/(main)/profile/page.tsx");
  assert.match(profile, /await getRequestProfile\(session.user.id\)/);
  assert.doesNotMatch(profile, /UserProfile\.|dbConnect/);
  const context = read("lib/request-context.ts");
  assert.match(context, /getRequestSession = cache\(/);
  assert.match(context, /getRequestProfile = cache\(/);
  const form = read("components/map/RouteFinderForm.tsx");
  assert.equal(form.match(/disabled=\{!photoSearchAvailable\}/g).length, 2);
  assert.match(form, /Photo search is not set up/);
  assert.match(read("app/(auth)/forgot-password/layout.tsx"), /!getServerFeatures\(process.env\).passwordResetEmail/);
});
