// Run from the repository root: node docs/audits/2026-09-17/fourth-pass-reproduce.mjs
//
// Fourth-pass diagnostic harness. It executes current source with synthetic
// inputs to confirm the behaviors described in Section 23 of
// PROJECT_ASSESSMENT_AND_EXPANSION_ROADMAP.md. It blocks network access, mocks
// persistence, and never touches the real auth service or database. Every
// assertion confirms a PRESENT behavior, not a fix.
//
// Written as an ES module, and the package loader is not named `require`, so
// this file adds nothing to `pnpm exec eslint` — unlike the two 2026-09-09
// `.cjs` harnesses, which add seven no-require-imports errors between them.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = process.cwd();
const self = fileURLToPath(import.meta.url);
const loadPackage = createRequire(path.join(root, "package.json"));
const ts = loadPackage("typescript");
globalThis.fetch = () => {
  throw new Error("Network access forbidden by audit harness");
};
const log = (label, data) => console.log(label, JSON.stringify(data));

function execute(source, filename, mocks = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(
    (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === "server-only") return {};
      if (id.startsWith("@/lib/")) return load(id.slice(2) + ".ts");
      if (id.startsWith("."))
        return load(path.relative(root, path.resolve(path.dirname(filename), id + ".ts")), mocks);
      throw new Error(`Unmocked import forbidden: ${id}`);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}

function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  return execute(fs.readFileSync(filename, "utf8"), filename, mocks);
}

function extractFunction(relative, name) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const node = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(node, `Source function exists: ${relative} ${name}`);
  return execute(`${node.getText(ast)}\nexport { ${name} };`, filename)[name];
}

function extractConstInitializer(relative, name) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(ast) === name && declaration.initializer) {
        return declaration.initializer.getText(ast);
      }
    }
  }
  throw new Error(`Const not found: ${relative} ${name}`);
}

// ── Child mode: run time-zone-sensitive code under a given TZ ────────────────
if (process.argv[2] === "--tz-child") {
  const mode = process.argv[3];
  if (mode === "store") {
    const trip = load("lib/trip-input.ts");
    const traffic = load("lib/traffic-service.ts");
    const result = trip.validateTripInput(
      {
        origin: { label: "A", lat: 23.77, lng: 90.41 },
        destination: { label: "B", lat: 23.81, lng: 90.41 },
        stops: [],
        passengerCount: 1,
        departureMode: "scheduled",
        // Exactly what RouteFinderForm submits: a zone-less datetime-local value.
        // 20 Sep 2026 is a Sunday, a working day with peak windows in BD.
        scheduledAt: "2026-09-20T09:00",
      },
      new Date("2026-09-17T00:00:00Z"),
      "BD",
    );
    const stored = result.data.scheduledAt;
    console.log(JSON.stringify({ stored, bdPeakHour: traffic.isPeakHour(new Date(stored), "BD") }));
  } else if (mode === "format") {
    const formatter = new Function(
      `return ${extractConstInitializer("components/ScheduledTripsList.tsx", "dateFormatter")};`,
    )();
    console.log(JSON.stringify({ shown: formatter.format(new Date(process.argv[4])) }));
  } else if (mode === "history") {
    let captured = null;
    const records = [{ _id: "r1", createdAt: new Date("2026-09-30T20:00:00Z"), origin: {}, destination: {} }];
    const chain = { sort: () => ({ lean: async () => records }) };
    const history = load("lib/trip-history.ts", {
      "@/lib/mongodb": { default: async () => {} },
      "@/models/TripHistory": {
        default: {
          find: (query) => {
            captured ??= query;
            return chain;
          },
        },
      },
      mongoose: { Types: { ObjectId: { isValid: () => true } } },
    });
    await history.getTripHistoryPage("u1", { from: "2026-09-10", to: "2026-09-10" });
    const range = captured.createdAt;
    const inRange = (iso) => new Date(iso) >= range.$gte && new Date(iso) <= range.$lte;
    const activity = await history.getTripHistoryActivityData("u1");
    console.log(
      JSON.stringify({
        from: range.$gte.toISOString(),
        to: range.$lte.toISOString(),
        dhaka_0100_on_10Sep_included: inRange("2026-09-09T19:00:00Z"),
        dhaka_0200_on_11Sep_included: inRange("2026-09-10T20:00:00Z"),
        dhaka_0200_on_1Oct_groupedUnder: activity.monthlyGroups[0]?.monthLabel,
      }),
    );
  }
  process.exit(0);
}

function inZone(tz, ...args) {
  const output = execFileSync(process.execPath, [self, "--tz-child", ...args], {
    cwd: root,
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").pop());
}

// ── C10: client IP resolution ────────────────────────────────────────────────
{
  const forwarded = "203.0.113.7, 198.51.100.20";
  const request = new Request("http://audit.invalid/", { headers: { "x-forwarded-for": forwarded } });
  const libKey = load("lib/rate-limit.ts").getClientIp(request);
  const routesKey = extractFunction("app/api/trip-input/routes/route.ts", "getClientIp")(request);
  assert.equal(libKey, "203.0.113.7");
  assert.equal(routesKey, "203.0.113.7");
  log("C10 app limiters key on the client-supplied leftmost X-Forwarded-For", {
    header: forwarded,
    libRateLimitKey: libKey,
    routesHandlerKey: routesKey,
  });

  const betterAuth = fs.realpathSync(path.join(root, "node_modules/better-auth"));
  const ipModule = createRequire(path.join(betterAuth, "package.json")).resolve("@better-auth/core/utils/ip");
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const { getIp } = await import(pathToFileURL(ipModule));
  const single = getIp(new Request("http://audit.invalid/", { headers: { "x-forwarded-for": "203.0.113.7" } }), {});
  const multi = getIp(request, {});
  const trusted = getIp(request, { advanced: { ipAddress: { trustedProxies: ["198.51.100.0/24"] } } });
  process.env.NODE_ENV = previousEnv;
  assert.equal(single, "203.0.113.7");
  assert.equal(multi, null);
  assert.equal(trusted, "203.0.113.7");
  log("C10 Better Auth (current config) resolves no IP for a multi-hop header", {
    singleHop: single,
    multiHopNoTrustedProxies: multi,
    multiHopWithTrustedProxies: trusted,
    consequence: "null => shared 'no-trusted-ip' bucket per path (better-auth/dist/api/rate-limiter/index.mjs:283-287)",
  });
}

// ── G36: time interpretation and display depend on where code runs ──────────
{
  const utc = inZone("UTC", "store");
  const dhaka = inZone("Asia/Dhaka", "store");
  const serverShows = inZone("UTC", "format", utc.stored);
  const browserShows = inZone("Asia/Dhaka", "format", utc.stored);
  const scheduledListSource = fs.readFileSync(path.join(root, "components/ScheduledTripsList.tsx"), "utf8");
  const isServerComponent = !/^\s*["']use client["']/m.test(scheduledListSource);
  const formatterHasZone = /timeZone/.test(extractConstInitializer("components/ScheduledTripsList.tsx", "dateFormatter"));
  assert.equal(utc.stored, "2026-09-20T09:00:00.000Z");
  assert.equal(dhaka.stored, "2026-09-20T03:00:00.000Z");
  assert.equal(utc.bdPeakHour, false);
  assert.equal(dhaka.bdPeakHour, true);
  assert.ok(isServerComponent && !formatterHasZone);
  assert.notEqual(serverShows.shown, browserShows.shown);
  log("G36 09:00 chosen for a Dhaka trip", {
    storedOnUtcServer: utc.stored,
    storedOnDhakaServer: dhaka.stored,
    peakPricedOnUtcServer: utc.bdPeakHour,
    peakPricedOnDhakaServer: dhaka.bdPeakHour,
    scheduledTripsPageIsServerRendered: isServerComponent,
    scheduledTripsFormatterHasTimeZone: formatterHasZone,
    scheduledTripsPageShowsOnUtcServer: serverShows.shown,
    tripSummaryShowsInDhakaBrowser: browserShows.shown,
  });

  const history = inZone("UTC", "history");
  assert.equal(history.dhaka_0100_on_10Sep_included, false);
  assert.equal(history.dhaka_0200_on_11Sep_included, true);
  assert.equal(history.dhaka_0200_on_1Oct_groupedUnder, "September 2026");
  log("G36 trip-history filter for 10 Sep on a UTC server", history);
}

// ── G37: deleting a saved trip does not stop an in-flight evaluation ─────────
{
  const store = { tripExists: true, alerts: [], stamped: 0 };
  const trip = {
    _id: "trip-1",
    userId: "user-1",
    name: "Commute",
    country: "BD",
    conditions: [{ _id: "cond-1", type: "weather_severity", threshold: 3.5, isActive: true, lastState: false }],
    async save() {
      if (!store.tripExists) {
        const error = new Error('No document found for query "{ _id: trip-1 }" on model "SavedTrip"');
        error.name = "DocumentNotFoundError";
        throw error;
      }
    },
  };
  const evaluator = load("lib/alert-evaluator/index.ts", {
    "@/lib/mongodb": { default: async () => {} },
    "@/lib/alerts": {
      buildDedupeKey: (conditionId) => `${conditionId}:bucket`,
      createAlert: async (input) => {
        store.alerts.push({ savedTripId: input.savedTripId, title: input.title });
        return { id: "alert-1" };
      },
    },
    "@/models/SavedTrip": {
      default: {
        find: () => ({ sort: () => ({ limit: () => [trip] }) }),
        updateOne: async () => {
          store.stamped += 1;
          return {};
        },
      },
    },
    "./context": {
      buildEvaluationContext: async () => {
        // The user deletes the trip while provider calls are in flight:
        // deleteSavedTrip removes the parent, then its alerts.
        store.tripExists = false;
        store.alerts = store.alerts.filter((alert) => alert.savedTripId !== "trip-1");
        return {
          context: {
            tripName: "Commute",
            country: "BD",
            distanceKm: 5,
            durationMin: 20,
            weather: { severityScore: 8, severityBand: "severe", precipitationMmPerHour: 20, windKmh: 50 },
            traffic: null,
            fare: null,
            baseline: null,
          },
          route: { routeId: "route-0", distanceKm: 5, durationMin: 20, coords: [], legs: [], resolvedAt: new Date() },
          notes: [],
        };
      },
    },
  });
  // runTrips logs the save failure with console.error; capture it instead of
  // printing a stack trace into the evidence log.
  const printError = console.error;
  let loggedFailure = null;
  console.error = (message, error) => {
    loggedFailure = `${message} ${error?.name ?? ""}`.trim();
  };
  const summary = await evaluator.evaluateForUser("user-1");
  console.error = printError;
  assert.equal(store.tripExists, false);
  assert.equal(store.alerts.length, 1);
  assert.equal(summary.failed, 1);
  log("G37 alert written for a trip deleted mid-evaluation", {
    tripExists: store.tripExists,
    alertsLeftForDeletedTrip: store.alerts,
    runSummary: { evaluated: summary.evaluated, failed: summary.failed },
    loggedFailure,
    failedAttemptStampCalls: store.stamped,
  });
}

// ── G09 addendum: rain alone can never reach "severe" ───────────────────────
{
  const weather = load("lib/weather.ts");
  const bike = { provider: "pathao", vehicleType: "bike" };
  const cng = { provider: "cng", vehicleType: "auto" };
  const rows = [
    { case: "100 mm/h rain, calm, clear", precipitationMmPerHour: 100, windKmh: 0, visibilityMeters: 10000 },
    { case: "100 mm/h rain, 40 km/h wind", precipitationMmPerHour: 100, windKmh: 40, visibilityMeters: 10000 },
    { case: "100 mm/h rain, 50 km/h wind", precipitationMmPerHour: 100, windKmh: 50, visibilityMeters: 10000 },
    { case: "100 mm/h rain, 50 km/h wind, 800 m visibility", precipitationMmPerHour: 100, windKmh: 50, visibilityMeters: 800 },
  ].map(({ case: label, ...input }) => {
    const reading = weather.calculateWeatherSeverity(input);
    return {
      case: label,
      ...reading,
      bikeBlocked: weather.getWeatherVehicleRestriction(bike, reading).weatherBlocked,
      cngBlocked: weather.getWeatherVehicleRestriction(cng, reading).weatherBlocked,
    };
  });
  assert.deepEqual(
    rows.map((row) => [row.severityBand, row.bikeBlocked, row.cngBlocked]),
    [
      ["moderate", false, false],
      ["moderate", false, false],
      ["severe", true, false],
      ["severe", true, true],
    ],
  );
  log("G09 severity ceiling", rows);
}

// ── G17 addendum: rectangles admit major foreign cities ─────────────────────
{
  const trip = load("lib/trip-input.ts");
  const cities = [
    ["Kolkata, India", "BD", 22.5726, 88.3639],
    ["Agartala, India", "BD", 23.8315, 91.2868],
    ["Dublin, Ireland", "UK", 53.3498, -6.2603],
    ["Vancouver, Canada", "US", 49.2827, -123.1207],
    ["Tijuana, Mexico", "US", 32.5149, -117.0382],
  ].map(([city, country, lat, lng]) => ({ city, country, accepted: trip.isInsideServiceArea({ lat, lng }, country) }));
  assert.ok(cities.every((row) => row.accepted));
  log("G17 foreign cities accepted as in-country", cities);
}

// ── C02 update: environment documentation at HEAD ───────────────────────────
{
  const git = (...args) => {
    try {
      return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    } catch (error) {
      return (error.stdout ?? "").toString().trim();
    }
  };
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  const variables = [
    "MONGODB_URI", "MONGODB_DB", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "RESEND_API_KEY",
    "RESEND_FROM_EMAIL", "ORS_API_KEY", "PATHAO_FARE_API", "OPENWEATHER_API_KEY", "OPENWEATHER_BASE_URL",
    "TOMTOM_API_KEY", "ALERT_EVALUATION_SECRET", "NEXT_PUBLIC_TM_MODEL_URL", "NEXT_PUBLIC_MAPBOX_TOKEN",
    "NOMINATIM_USER_AGENT", "NOMINATIM_BASE_URL",
  ];
  const tracked = git("ls-files", "--", ".env.example");
  const ignoredBy = git("check-ignore", "-v", ".env.example");
  const documentedInReadme = variables.filter((name) => readme.includes(name));
  assert.equal(tracked, "");
  assert.match(ignoredBy, /\.env\*/);
  assert.equal(documentedInReadme.length, 0);
  log("C02 environment documentation reachable from a clone", {
    envExampleTracked: tracked !== "",
    envExampleIgnoredBy: ignoredBy,
    variablesNamedInReadme: documentedInReadme.length,
    variablesReadBySourceOrAuth: variables.length,
  });
}

log("Diagnostic checks", "All expected current-source behaviors reproduced; no fixes applied.");
