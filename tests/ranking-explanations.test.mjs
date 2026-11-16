import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

const option = (overrides) => ({
  provider: "p",
  vehicleType: "go",
  displayName: "Car",
  maxPassengers: 4,
  comfortScore: 3,
  eligible: true,
  weatherRestricted: false,
  weatherBlocked: false,
  restrictionReason: null,
  fare: { low: 90, mid: 100, high: 110 },
  fareSource: "rate_card",
  fareSourceNote: null,
  fareAdjustment: null,
  ...overrides,
});

function rank(options, { congestionLevel = "low", weatherBand = "low", priority = "time" } = {}) {
  const { rankRouteOptions } = load("lib/route-scoring.ts");
  return rankRouteOptions({ options, baseDurationMin: 30, congestionLevel, weatherBand, priority });
}

const COMPARATIVE = [
  "Lowest estimated fare",
  "Highest estimated fare",
  "Shortest estimated time",
  "Most comfortable option",
];
const claims = (entry) => [...entry.pros, ...entry.cons];
const byName = (ranked) => Object.fromEntries(ranked.map((entry) => [entry.displayName, entry]));

test("a lone option is not the best, cheapest or fastest of anything", () => {
  const [only] = rank([option({ comfortScore: 5 })]);

  assert.equal(only.bestFor, null);
  assert.deepEqual(claims(only).filter((claim) => COMPARATIVE.includes(claim)), []);
  // What is true of it on its own is still said.
  assert.equal(only.pros.includes("High comfort"), true);
});

test("options that tie on a measure do not lead it", () => {
  const ranked = rank([
    option({ displayName: "A" }),
    option({ displayName: "B", comfortScore: 5 }),
  ]);
  const { A, B } = byName(ranked);

  // Same fare and same time: neither is cheaper, dearer or faster.
  for (const entry of [A, B]) {
    assert.equal(claims(entry).includes("Lowest estimated fare"), false);
    assert.equal(claims(entry).includes("Highest estimated fare"), false);
    assert.equal(claims(entry).includes("Shortest estimated time"), false);
  }
  assert.equal(B.bestFor, "Comfort");
  assert.equal(B.pros.includes("Most comfortable option"), true);
  assert.equal(A.bestFor, null);
});

test("a tag names a measure the option actually leads", () => {
  // Severe congestion: the bike's estimate is shortest, the car's longest.
  const ranked = rank(
    [
      option({ displayName: "Car", comfortScore: 4, fare: { low: 180, mid: 200, high: 220 } }),
      option({ displayName: "Bike", vehicleType: "bike", comfortScore: 2, fare: { low: 45, mid: 50, high: 55 } }),
      option({ displayName: "CNG", vehicleType: "auto", comfortScore: 3, fare: { low: 90, mid: 100, high: 110 } }),
    ],
    { congestionLevel: "severe", priority: "comfort" },
  );
  const { Car, Bike, CNG } = byName(ranked);

  // The bike leads on both time and fare; with comfort as the priority it
  // leads neither of those first, so it is tagged with the first it leads.
  assert.equal(Bike.bestFor, "Speed");
  assert.equal(Bike.pros.includes("Lowest estimated fare"), true);
  assert.equal(Bike.pros.includes("Shortest estimated time"), true);
  assert.equal(Car.bestFor, "Comfort");
  assert.equal(Car.cons.includes("Highest estimated fare"), true);
  // The middle option leads nothing. It used to be tagged with whichever of
  // its own numbers was least bad.
  assert.equal(CNG.bestFor, null);
  assert.deepEqual(claims(CNG).filter((claim) => COMPARATIVE.includes(claim)), []);

  // When an option leads the measure the user prioritised, that is its tag.
  const budget = byName(
    rank(
      [
        option({ displayName: "Car", fare: { low: 180, mid: 200, high: 220 } }),
        option({ displayName: "Bike", vehicleType: "bike", fare: { low: 45, mid: 50, high: 55 } }),
      ],
      { congestionLevel: "severe", priority: "cost" },
    ),
  );
  assert.equal(budget.Bike.bestFor, "Budget");
});

test("nothing is said about weather or traffic that was not read", () => {
  const options = [
    option({ displayName: "Car" }),
    option({ displayName: "Bike", vehicleType: "bike", fare: { low: 45, mid: 50, high: 55 } }),
  ];
  const mentions = (ranked, pattern) => ranked.flatMap(claims).filter((claim) => pattern.test(claim));

  const noWeather = rank(options, { weatherBand: null, congestionLevel: "low" });
  assert.deepEqual(new Set(noWeather.map((entry) => entry.riskBasis)), new Set(["traffic"]));
  // "No weather caution" used to appear here: no reading meant no restriction.
  assert.deepEqual(mentions(noWeather, /weather/i), []);

  const neither = rank(options, { weatherBand: null, congestionLevel: null });
  assert.deepEqual(new Set(neither.map((entry) => entry.riskBasis)), new Set(["none"]));
  assert.deepEqual(mentions(neither, /weather|traffic|risk/i), []);

  const both = rank(options, { weatherBand: "low", congestionLevel: "low" });
  assert.equal(mentions(both, /No weather caution/).length, 2);
});

test("the stated ranking rule is the one the score uses", () => {
  const { getPriorityWeights } = load("lib/route-scoring.ts");

  for (const [priority, lead] of [["time", "time"], ["cost", "cost"], ["comfort", "comfort"], [null, "time"]]) {
    const weights = getPriorityWeights(priority);
    assert.equal(weights[lead], 0.7);
    assert.ok(Math.abs(weights.time + weights.cost + weights.comfort - 1) < 1e-9);
  }

  // Two options that differ only on fare: under a cost priority the cheaper
  // one must come first, as the stated 70% weight says it will.
  const [first] = rank(
    [
      option({ displayName: "Dear", fare: { low: 180, mid: 200, high: 220 } }),
      option({ displayName: "Cheap", fare: { low: 45, mid: 50, high: 55 } }),
    ],
    { priority: "cost" },
  );
  assert.equal(first.displayName, "Cheap");
});

test("a vehicle's time is shown as an estimate, and a lone option gets no score", () => {
  // The ranking is the "Best overall" sort on the fares page.
  const screen = fs.readFileSync(path.join(root, "components/FareResults.tsx"), "utf8");

  assert.match(screen, /est\. \$\{v\.ranking\.adjustedDurationMin\} min/);
  assert.match(screen, /const showRanking = sort === 'best' && available\.length > 1/);
  assert.match(screen, /showRanking && v\.ranking && <span[^>]*>\s*<Pill[^>]*>\{riskBadgeLabel/);
  assert.match(screen, /nothing to rank it against/);
});

test("the ranking is served with the fares, and the old page sends its links there", () => {
  const api = fs.readFileSync(path.join(root, "app/api/fares/route.ts"), "utf8");
  assert.match(api, /rankRouteOptions\(\{/);
  assert.match(api, /ranking: rankingByKey\.get\(/);
  assert.equal(fs.existsSync(path.join(root, "app/api/best-options/route.ts")), false);
  assert.equal(fs.existsSync(path.join(root, "components/map/TripProgress.tsx")), false);

  const ranked = fs.readFileSync(path.join(root, "app/(main)/ranked-options/page.tsx"), "utf8");
  assert.match(ranked, /redirect\(`\/fares\?\$\{new URLSearchParams\(\{[^}]*sort: "best"/);
});

test("every usable option is ranked, not just the top three", () => {
  // "Best overall" sorts the whole fare list; the old page showed three.
  const ranked = rank(["A", "B", "C", "D", "E"].map((displayName, index) =>
    option({ displayName, vehicleType: `type-${index}`, fare: { low: 40 + index * 10, mid: 50 + index * 10, high: 60 + index * 10 } })));
  assert.equal(ranked.length, 5);
});
