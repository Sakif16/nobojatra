// Run from the repository root: node docs/audits/2026-09-09/second-pass-reproduce.cjs
// Diagnostic source execution with synthetic data. No network, auth service, or database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = process.cwd();
const nativeRequire = createRequire(path.join(root, 'package.json'));
const ts = nativeRequire('typescript');
const realDate = Date;
const realFetch = global.fetch;
global.fetch = () => { throw new Error('Network access forbidden by audit harness'); };
const log = (label, data) => console.log(label, JSON.stringify(data));

function execute(source, filename, mocks = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === 'server-only') return {};
    if (id.startsWith('@/lib/')) return load(id.slice(2) + '.ts');
    if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')));
    throw new Error(`Unmocked import forbidden: ${id}`);
  }, mod, mod.exports);
  return mod.exports;
}
function load(relative, mocks = {}, extra = '') {
  const filename = path.join(root, relative);
  return execute(fs.readFileSync(filename, 'utf8') + extra, filename, mocks);
}
function extractFunctions(relative, names) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const declarations = names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, `Source function exists: ${name}`);
    return node.getText(ast);
  });
  return execute(declarations.join('\n') + `\nexport { ${names.join(', ')} };`, filename);
}

async function main() {
  const routeService = load('lib/route-service.ts', {}, '\nexport { mapOrsFeatureToRoute };');
  const feature = {
    geometry: { coordinates: [[90.41, 23.77], [90.45, 23.8]] },
    properties: { summary: { distance: 5000, duration: 900 }, segments: [{ distance: 5000, duration: 900, steps: [] }], way_points: [0, 1] },
  };
  let user = 'synthetic-user-A';
  let providerCalls = 0;
  const persisted = [];
  const handler = load('app/api/trip-input/routes/route.ts', {
    '@/lib/route-service': {
      ...routeService,
      fetchRouteSuggestions: async (origin, destination, stops) => {
        providerCalls++;
        return [routeService.mapOrsFeatureToRoute(feature, 0, [origin, ...stops, destination])];
      },
    },
    '@/lib/auth': { auth: { api: { getSession: async () => ({ user: { id: user } }) } } },
    '@/lib/user-country': { getUserCountry: async () => 'BD' },
    '@/lib/trip-history': { createTripHistoryRecord: async input => {
      persisted.push(structuredClone(input)); return `synthetic-history-${persisted.length}`;
    } },
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, ...init }) } },
  });
  const trip = {
    origin: { lat: 23.77, lng: 90.41, label: 'A private appointment label' },
    destination: { lat: 23.8, lng: 90.45, label: 'A private destination label' },
    stops: [], passengerCount: 1, departureMode: 'now',
  };
  const request = data => ({ headers: new Headers(), json: async () => data });
  const first = await handler.POST(request(trip));
  assert.equal(first.body.success, true);
  user = 'synthetic-user-B';
  const secondTrip = structuredClone(trip);
  secondTrip.origin.label = 'B public meeting point';
  secondTrip.destination.label = 'B destination';
  const second = await handler.POST(request(secondTrip));
  assert.equal(second.body.success, true);
  assert.equal(second.headers['X-Route-Cache'], 'HIT');
  assert.equal(providerCalls, 1);
  assert.equal(second.body.data.routes[0].legs[0].fromLabel, trip.origin.label);
  assert.equal(persisted[1].routes[0].legs[0].fromLabel, trip.origin.label);
  log('Cross-user route cache label reuse', {
    secondUserInput: secondTrip.origin.label,
    returnedLegLabel: second.body.data.routes[0].legs[0].fromLabel,
    persistedLegLabel: persisted[1].routes[0].legs[0].fromLabel,
    cache: second.headers['X-Route-Cache'], syntheticProviderCalls: providerCalls,
  });

  const { buildDedupeKey, visibleAlertFilter } = extractFunctions('lib/alerts.ts', ['buildDedupeKey', 'visibleAlertFilter']);
  let evaluationContext;
  let contextBuilds = 0;
  const createdAlerts = [];
  const dedupe = new Set();
  const orchestration = load('lib/alert-evaluator/index.ts', {
    '@/lib/alerts': { buildDedupeKey, createAlert: async input => {
      if (dedupe.has(input.dedupeKey)) return null;
      dedupe.add(input.dedupeKey); createdAlerts.push(input); return input;
    } },
    '@/lib/mongodb': { default: async () => {} },
    '@/models/SavedTrip': {},
    './context': { buildEvaluationContext: async () => { contextBuilds++; return { context: evaluationContext, route: {}, notes: [] }; } },
    './evaluators': load('lib/alert-evaluator/evaluators.ts'),
  });
  function setClock(iso) {
    const milliseconds = realDate.parse(iso);
    global.Date = class extends realDate {
      constructor(...args) { super(...(args.length ? args : [milliseconds])); }
      static now() { return milliseconds; }
    };
  }
  function makeTrip(type, threshold) {
    return { _id: `trip-${type}`, userId: 'synthetic-user', name: 'Synthetic commute', conditions: [{ _id: type, type, threshold, lastState: false }], save: async () => {} };
  }
  const weatherTrip = makeTrip('weather_severity', 3.5);
  const weatherRuns = [];
  for (const [time, score] of [['10:00', 4], ['10:15', 1], ['10:30', 8], ['11:00', 8]]) {
    setClock(`2026-09-09T${time}:00Z`);
    evaluationContext = { tripName: 'Synthetic commute', weather: { severityScore: score, severityBand: score >= 7 ? 'severe' : score >= 3.5 ? 'moderate' : 'low', precipitationMmPerHour: 5, windKmh: 10 } };
    const result = await orchestration.evaluateSavedTrip(weatherTrip);
    weatherRuns.push({ time, score, alertsCreated: result.alertsCreated, lastState: weatherTrip.conditions[0].lastState });
  }
  assert.deepEqual(weatherRuns.map(r => r.alertsCreated), [1, 0, 0, 0]);
  log('Weather clears then returns as severe in same hour', weatherRuns);

  const fareTrip = makeTrip('fare_change', 15);
  const fareRuns = [];
  for (const [time, mid] of [['12:00', 80], ['13:00', 120]]) {
    setClock(`2026-09-09T${time}:00Z`);
    evaluationContext = { tripName: 'Synthetic commute', country: 'BD', baseline: { fareLow: 90, fareHigh: 110 }, fare: { low: mid * .9, high: mid * 1.1, mid } };
    const result = await orchestration.evaluateSavedTrip(fareTrip);
    fareRuns.push({ time, mid, alertsCreated: result.alertsCreated, lastState: fareTrip.conditions[0].lastState });
  }
  assert.deepEqual(fareRuns.map(r => r.alertsCreated), [1, 0]);
  log('Fare changes from 20 percent below to 20 percent above baseline', fareRuns);
  log('Alert visibility has no resolution or validity cutoff', visibleAlertFilter());
  const disabledTrip = makeTrip('weather_severity', 3.5);
  disabledTrip.conditions[0].isActive = false;
  const previousBuilds = contextBuilds;
  const disabledResult = await orchestration.evaluateSavedTrip(disabledTrip);
  assert.equal(contextBuilds - previousBuilds, 1);
  assert.equal(disabledResult.conditionsEvaluated, 0);
  log('All conditions disabled still builds provider context', { contextBuilds: contextBuilds - previousBuilds, conditionsEvaluated: disabledResult.conditionsEvaluated });
  const { toDepartureOptions } = extractFunctions('lib/alert-evaluator/context.ts', ['toDepartureOptions']);
  const pastDeparture = toDepartureOptions({ departureMode: 'scheduled', scheduledAt: new Date('2026-09-08T10:00:00Z') });
  assert.equal(pastDeparture.scheduledAt, '2026-09-08T10:00:00.000Z');
  log('Expired saved departure remains a scheduled provider input', pastDeparture);
  global.Date = realDate;

  // Execute the real listing function with an in-memory query double; simulate timestamp ties.
  const sameTime = new Date('2026-09-09T10:00:00Z');
  const rows = Array.from({ length: 21 }, (_, i) => ({ _id: `synthetic-${i}`, createdAt: sameTime, title: 'Synthetic alert', message: 'Fixture', severity: 'info' }));
  const alerts = load('lib/alerts.ts', {
    '@/lib/mongodb': { default: async () => {} },
    '@/models/Alert': { default: {
      find: filter => {
        let selected = rows.filter(row => !filter.createdAt || row.createdAt < filter.createdAt.$lt);
        const query = { sort: () => query, limit: count => { selected = selected.slice(0, count); return query; }, lean: async () => selected };
        return query;
      },
      countDocuments: async () => rows.length,
    } },
    mongoose: { Types: {} },
  });
  const page1 = await alerts.listAlerts('synthetic-user');
  const page2 = await alerts.listAlerts('synthetic-user', { before: page1.nextCursor });
  assert.equal(page1.alerts.length, 20);
  assert.equal(page1.hasMore, true);
  assert.equal(page2.alerts.length, 0);
  log('Timestamp-only notification cursor drops tied row', { totalFixtures: rows.length, firstPage: page1.alerts.length, hasMore: page1.hasMore, secondPage: page2.alerts.length });
  log('Diagnostic checks', 'All expected current-source behaviors reproduced; no fixes applied.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.Date = realDate;
  global.fetch = realFetch;
});
