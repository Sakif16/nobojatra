import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load, root } from "./support/load.mjs";

class ObjectId {
  constructor(value) {
    this.value = String(value);
  }
  toString() {
    return this.value;
  }
  static isValid(value) {
    return /^[a-f0-9]{24}$/.test(String(value));
  }
}
const id = (number) => number.toString(16).padStart(24, "0");
const SAME_MOMENT = new Date("2026-10-11T09:00:00.000Z");

/** Evaluates the handful of query shapes lib/alerts builds. */
function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and") return expected.every((clause) => matches(record, clause));
    if (key === "$or") return expected.some((clause) => matches(record, clause));

    const actual = key === "_id" ? String(record._id) : record[key];

    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === "object" && "$lt" in expected) {
      return key === "_id" ? actual < String(expected.$lt) : actual < expected.$lt;
    }
    if (expected && typeof expected === "object" && "$lte" in expected) return actual !== null && actual <= expected.$lte;
    return actual === expected;
  });
}

function alertsWith(records) {
  const run = (filter) => {
    const state = { limit: Infinity };
    const sorted = records
      .filter((record) => matches(record, filter))
      .sort((a, b) => b.createdAt - a.createdAt || (String(a._id) < String(b._id) ? 1 : -1));
    const chain = {
      sort: () => chain,
      select: () => chain,
      limit: (count) => {
        state.limit = count;
        return chain;
      },
      lean: async () => sorted.slice(0, state.limit),
    };
    return { chain, sorted };
  };
  return load("lib/alerts.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: { Types: { ObjectId } },
    "@/models/Alert": {
      __esModule: true,
      default: {
        find: (filter) => run(filter).chain,
        findOne: (filter) => {
          const { sorted } = run(filter);
          const one = { sort: () => one, select: () => one, lean: async () => sorted[0] ?? null };
          return one;
        },
        countDocuments: async (filter) => records.filter((record) => matches(record, filter)).length,
      },
    },
  });
}

const notification = (number, overrides = {}) => ({
  _id: id(number),
  userId: "user",
  title: `Notification ${number}`,
  message: "Saved.",
  severity: "info",
  readAt: null,
  snoozedUntil: null,
  createdAt: SAME_MOMENT,
  ...overrides,
});

async function everyPage(alerts, userId = "user") {
  const pages = [];
  let before = null;

  for (let guard = 0; guard < 20; guard += 1) {
    const page = await alerts.listAlerts(userId, { before });
    pages.push(page);
    if (!page.hasMore) break;
    before = page.nextCursor;
  }

  return pages;
}

test("notifications written at the same moment are all reachable, once each", async () => {
  // Twenty-one with one timestamp. Paging on the time alone returned twenty,
  // then an empty page: nothing is strictly older than their shared moment.
  const alerts = alertsWith(Array.from({ length: 21 }, (_, index) => notification(index + 1)));

  const pages = await everyPage(alerts);
  const titles = pages.flatMap((page) => page.alerts.map((alert) => alert.title));

  assert.deepEqual(pages.map((page) => page.alerts.length), [20, 1]);
  assert.equal(new Set(titles).size, 21);
  assert.equal(pages[0].hasMore, true);
  assert.equal(pages[1].hasMore, false);
  assert.equal(pages[1].nextCursor, null);
  // The cursor is the last row's time and id together.
  assert.equal(pages[0].nextCursor, `${SAME_MOMENT.toISOString()}_${id(2)}`);
});

test("a long list pages through in order with no gaps or repeats", async () => {
  const records = Array.from({ length: 65 }, (_, index) =>
    // Three to a timestamp, so every page boundary can fall inside a tie.
    notification(index + 1, { createdAt: new Date(SAME_MOMENT.getTime() + Math.floor(index / 3) * 1000) }),
  );
  const alerts = alertsWith([
    ...records,
    notification(900, { userId: "someone-else" }),
    notification(901, { readAt: new Date() }),
  ]);

  const pages = await everyPage(alerts);
  const titles = pages.flatMap((page) => page.alerts.map((alert) => alert.title));

  assert.deepEqual(pages.map((page) => page.alerts.length), [20, 20, 20, 5]);
  assert.deepEqual(titles, records.map((record) => record.title).reverse());
  // Another account's notifications and dismissed ones never appear.
  assert.equal(titles.includes("Notification 900"), false);
  assert.equal(titles.includes("Notification 901"), false);
  assert.equal(pages[0].unreadCount, 65);
});

test("a cursor that is only a timestamp still works, and a bad one is ignored", async () => {
  const alerts = alertsWith([
    notification(1, { createdAt: new Date("2026-10-11T08:00:00Z") }),
    notification(2, { createdAt: new Date("2026-10-11T10:00:00Z") }),
  ]);

  const older = await alerts.listAlerts("user", { before: "2026-10-11T09:00:00.000Z" });
  assert.deepEqual(older.alerts.map((alert) => alert.title), ["Notification 1"]);

  const ignored = await alerts.listAlerts("user", { before: "not-a-cursor" });
  assert.equal(ignored.alerts.length, 2);
});

test("the poll reports the newest notification as well as the count", async () => {
  const records = [
    notification(1, { createdAt: new Date("2026-10-11T08:00:00Z") }),
    notification(2, { createdAt: new Date("2026-10-11T10:00:00Z") }),
  ];
  assert.deepEqual(await alertsWith(records).getAlertDigest("user"), { unreadCount: 2, latestId: id(2) });

  // One arrives while another is dismissed elsewhere: the count is unchanged,
  // and only the newest id shows that the list is different.
  const after = [
    { ...records[0], readAt: new Date() },
    records[1],
    notification(3, { createdAt: new Date("2026-10-11T11:00:00Z") }),
  ];
  assert.deepEqual(await alertsWith(after).getAlertDigest("user"), { unreadCount: 2, latestId: id(3) });

  assert.deepEqual(await alertsWith([]).getAlertDigest("user"), { unreadCount: 0, latestId: null });
});

test("the bell reloads on any change and can load older notifications", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const bell = read("components/notifications/NotificationBell.tsx");
  const center = read("components/notifications/NotificationCenter.tsx");

  // Reload is driven by the newest id or any change in the count, not only by
  // the count going up.
  assert.match(bell, /latestId !== previousLatestId/);
  assert.match(bell, /payload\.unreadCount !== previousCount/);
  assert.doesNotMatch(bell, /payload\.unreadCount > previousCount/);
  // Older pages are fetched from where the loaded list ends.
  assert.match(bell, /\/api\/alerts\?before=\$\{encodeURIComponent\(nextCursor\)\}/);
  assert.match(center, /Load older notifications/);
});
