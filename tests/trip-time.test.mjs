import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support/load.mjs";

// The zones the code might run in: a UTC host, a Dhaka laptop, a US laptop.
const PROCESS_ZONES = ["UTC", "Asia/Dhaka", "America/Los_Angeles"];

/**
 * Runs a test body once per process zone. Every result below must be the same
 * whichever zone the server or the browser happens to be in.
 */
function inEveryProcessZone(name, body) {
  for (const zone of PROCESS_ZONES) {
    test(`${name} [process TZ ${zone}]`, async () => {
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        // Guards the harness itself: if the switch silently did nothing, every
        // run would be in one zone and prove nothing.
        assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone, zone);
        await body();
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    });
  }
}

const DHAKA = { label: "Dhaka", lat: 23.8103, lng: 90.4125 };
const DHAKA_END = { label: "Uttara", lat: 23.8759, lng: 90.3795 };
const LONDON = { label: "London", lat: 51.5072, lng: -0.1276 };
const LONDON_END = { label: "Stratford", lat: 51.5416, lng: -0.0034 };
const NEW_YORK = { label: "New York", lat: 40.7128, lng: -74.006 };
const NEW_YORK_END = { label: "Brooklyn", lat: 40.6782, lng: -73.9442 };
const LOS_ANGELES = { label: "Los Angeles", lat: 34.0522, lng: -118.2437 };
const LOS_ANGELES_END = { label: "Santa Monica", lat: 34.0195, lng: -118.4912 };

function validate({ origin, destination, country, now, ...schedule }) {
  const { validateTripInput } = load("lib/trip-input.ts");
  const { resolveTripTimeZone } = load("lib/trip-time-zone.ts");
  return validateTripInput(
    { origin, destination, passengerCount: 1, departureMode: "scheduled", ...schedule },
    new Date(now),
    country,
    resolveTripTimeZone,
  );
}

inEveryProcessZone("a Dhaka 09:00 is 03:00Z, in Dhaka's zone, and peak", () => {
  const { isPeakHour } = load("lib/traffic-service.ts");
  const result = validate({
    origin: DHAKA,
    destination: DHAKA_END,
    country: "BD",
    now: "2026-09-18T00:00:00Z",
    scheduledLocal: "2026-09-20T09:00",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.scheduledAt, "2026-09-20T03:00:00.000Z");
  assert.equal(result.data.timeZone, "Asia/Dhaka");
  // Sunday 09:00 is a working-day rush hour in Bangladesh.
  assert.equal(isPeakHour(new Date(result.data.scheduledAt), "BD", "Asia/Dhaka"), true);
  // The same clock time on Friday is not, and neither is 15:00 — which is what
  // a UTC server used to make of this 09:00.
  assert.equal(isPeakHour(new Date("2026-09-25T03:00:00Z"), "BD", "Asia/Dhaka"), false);
  assert.equal(isPeakHour(new Date("2026-09-20T09:00:00Z"), "BD", "Asia/Dhaka"), false);
});

inEveryProcessZone("London follows the clocks either side of a daylight-saving change", () => {
  const { isPeakHour } = load("lib/traffic-service.ts");
  const schedule = (scheduledLocal, now) =>
    validate({ origin: LONDON, destination: LONDON_END, country: "UK", now, scheduledLocal });

  // Friday before the clocks go back: British Summer Time, UTC+1.
  const summer = schedule("2026-10-23T08:00", "2026-10-22T00:00:00Z");
  assert.equal(summer.data.scheduledAt, "2026-10-23T07:00:00.000Z");
  assert.equal(summer.data.timeZone, "Europe/London");
  assert.equal(isPeakHour(new Date(summer.data.scheduledAt), "UK", "Europe/London"), true);

  // Monday after: Greenwich Mean Time, UTC+0. Same clock time, different instant.
  const winter = schedule("2026-10-26T08:00", "2026-10-22T00:00:00Z");
  assert.equal(winter.data.scheduledAt, "2026-10-26T08:00:00.000Z");
  assert.equal(isPeakHour(new Date(winter.data.scheduledAt), "UK", "Europe/London"), true);

  // 01:30 on 25 October happens twice; the first one (still BST) is used.
  const repeated = schedule("2026-10-25T01:30", "2026-10-22T00:00:00Z");
  assert.equal(repeated.data.scheduledAt, "2026-10-25T00:30:00.000Z");

  // 01:30 on 28 March 2027 never happens: the clocks jump from 01:00 to 02:00.
  const skipped = schedule("2027-03-28T01:30", "2027-03-25T00:00:00Z");
  assert.equal(skipped.success, false);
  assert.match(skipped.errors.scheduledAt, /does not exist/);

  // Either side of the gap is fine.
  assert.equal(
    schedule("2027-03-28T00:59", "2027-03-25T00:00:00Z").data.scheduledAt,
    "2027-03-28T00:59:00.000Z",
  );
  assert.equal(
    schedule("2027-03-28T02:00", "2027-03-25T00:00:00Z").data.scheduledAt,
    "2027-03-28T01:00:00.000Z",
  );
});

inEveryProcessZone("New York and Los Angeles each use their own clock", () => {
  const { isPeakHour } = load("lib/traffic-service.ts");
  const now = "2026-10-12T00:00:00Z";

  const newYork = validate({
    origin: NEW_YORK,
    destination: NEW_YORK_END,
    country: "US",
    now,
    scheduledLocal: "2026-10-14T08:00",
  });
  const losAngeles = validate({
    origin: LOS_ANGELES,
    destination: LOS_ANGELES_END,
    country: "US",
    now,
    scheduledLocal: "2026-10-14T08:00",
  });

  assert.equal(newYork.data.timeZone, "America/New_York");
  assert.equal(newYork.data.scheduledAt, "2026-10-14T12:00:00.000Z");
  assert.equal(losAngeles.data.timeZone, "America/Los_Angeles");
  assert.equal(losAngeles.data.scheduledAt, "2026-10-14T15:00:00.000Z");

  // Both are 08:00 on a Wednesday where the trip starts, so both are peak.
  assert.equal(isPeakHour(new Date(newYork.data.scheduledAt), "US", newYork.data.timeZone), true);
  assert.equal(
    isPeakHour(new Date(losAngeles.data.scheduledAt), "US", losAngeles.data.timeZone),
    true,
  );
  // The old behaviour, one zone per country, read the Los Angeles trip as
  // 11:00 Eastern and missed the rush hour.
  assert.equal(isPeakHour(new Date(losAngeles.data.scheduledAt), "US", "America/New_York"), false);

  // The US clocks go back on 1 November 2026; 01:30 happens twice there too.
  const repeated = validate({
    origin: LOS_ANGELES,
    destination: LOS_ANGELES_END,
    country: "US",
    now: "2026-10-28T00:00:00Z",
    scheduledLocal: "2026-11-01T01:30",
  });
  assert.equal(repeated.data.scheduledAt, "2026-11-01T08:30:00.000Z");
});

inEveryProcessZone("a time with no zone is never guessed at", () => {
  const base = { origin: DHAKA, destination: DHAKA_END, country: "BD", now: "2026-09-18T00:00:00Z" };

  // An instant must carry its offset. This is the string the form used to send.
  const bare = validate({ ...base, scheduledAt: "2026-09-20T09:00" });
  assert.equal(bare.success, false);
  assert.equal(bare.errors.scheduledAt, "Scheduled departure time is invalid.");

  // With one, it is taken as given, whichever offset it is written in.
  assert.equal(
    validate({ ...base, scheduledAt: "2026-09-20T03:00:00.000Z" }).data.scheduledAt,
    "2026-09-20T03:00:00.000Z",
  );
  assert.equal(
    validate({ ...base, scheduledAt: "2026-09-20T09:00:00+06:00" }).data.scheduledAt,
    "2026-09-20T03:00:00.000Z",
  );

  assert.equal(validate({ ...base, scheduledLocal: "2026-02-31T09:00" }).success, false);
  assert.equal(validate({ ...base, scheduledLocal: "tomorrow" }).success, false);
  assert.equal(validate(base).errors.scheduledAt, "Scheduled departure time is required.");

  // "In the future" is judged on the instant: 08:59 Dhaka time has passed at
  // 03:00Z even though the digits read later than a UTC clock.
  const past = validate({ ...base, now: "2026-09-20T03:00:00Z", scheduledLocal: "2026-09-20T08:59" });
  assert.equal(past.errors.scheduledAt, "Scheduled departure time must be in the future.");
});

inEveryProcessZone("trip times are shown and read back in the trip's zone", () => {
  const time = load("lib/trip-time.ts");
  const { getTripTimeZone } = load("lib/country-config.ts");
  const dhakaNine = "2026-09-20T03:00:00.000Z";

  assert.match(time.formatTripDateTime(dhakaNine, "Asia/Dhaka"), /^Sun, Sep 20, 2026, 9:00\sAM GMT\+6$/);
  assert.match(
    time.formatTripDateTime("2026-10-14T15:00:00Z", "America/Los_Angeles", { year: false }),
    /^Wed, Oct 14, 8:00\sAM PDT$/,
  );
  assert.equal(time.formatLocalDateTime(dhakaNine, "Asia/Dhaka"), "2026-09-20T09:00");
  assert.equal(time.formatLocalDateTime(dhakaNine, "Europe/London"), "2026-09-20T04:00");

  // A record written before trips stored a zone reads in its country's zone,
  // and a stored zone from another country is not trusted.
  assert.equal(getTripTimeZone(undefined, "BD"), "Asia/Dhaka");
  assert.equal(getTripTimeZone(null, undefined), "Asia/Dhaka");
  assert.equal(getTripTimeZone("America/Los_Angeles", "US"), "America/Los_Angeles");
  assert.equal(getTripTimeZone("America/Los_Angeles", "UK"), "Europe/London");
});

inEveryProcessZone("the zone comes from the origin, within the country's own zones", () => {
  const { resolveTripTimeZone } = load("lib/trip-time-zone.ts");

  assert.equal(resolveTripTimeZone({ lat: 33.4484, lng: -112.074 }, "US"), "America/Phoenix");
  assert.equal(resolveTripTimeZone({ lat: 21.3069, lng: -157.8583 }, "US"), "Pacific/Honolulu");
  assert.equal(resolveTripTimeZone({ lat: 41.8781, lng: -87.6298 }, "US"), "America/Chicago");

  // tz-lookup's grid puts these real in-country towns across the border. They
  // must still get their own country's clock, and for the US the nearest zone
  // rather than the Eastern default.
  assert.equal(resolveTripTimeZone({ lat: 48.9937, lng: -122.7471 }, "US"), "America/Los_Angeles");
  assert.equal(resolveTripTimeZone({ lat: 23.1193, lng: 91.9847 }, "BD"), "Asia/Dhaka");
  assert.equal(resolveTripTimeZone({ lat: 54.3438, lng: -7.6315 }, "UK"), "Europe/London");
});

function loadTripHistory(records) {
  const queries = [];
  const matches = (record, query) => {
    const range = query.createdAt;
    if (!range) return true;
    const createdAt = new Date(record.createdAt).getTime();
    if (range.$gte && createdAt < range.$gte.getTime()) return false;
    if (range.$lt && createdAt >= range.$lt.getTime()) return false;
    return true;
  };
  const history = load("lib/trip-history.ts", {
    "@/lib/mongodb": async () => {},
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    "@/models/TripHistory": {
      find: (query) => {
        queries.push(query);
        const found = records
          .filter((record) => matches(record, query))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        let limit = found.length;
        const chain = {
          select: () => chain,
          sort: () => chain,
          limit: (count) => {
            limit = count;
            return chain;
          },
          lean: async () => found.slice(0, limit),
        };
        return chain;
      },
    },
  });
  return { history, queries };
}

const vehicle = { provider: "p", vehicleType: "car", displayName: "Car", estimatedFareLow: 100, estimatedFareHigh: 120 };

inEveryProcessZone("history date filters use each trip's own calendar day", async () => {
  const { history } = loadTripHistory([
    // 01:00 on 10 September in Dhaka. A UTC server filed this under the 9th.
    { _id: "dhaka-early", country: "BD", timeZone: "Asia/Dhaka", createdAt: "2026-09-09T19:00:00Z", selectedVehicle: vehicle },
    // 02:00 on 11 September in Dhaka. A UTC server filed this under the 10th.
    { _id: "dhaka-next-day", country: "BD", timeZone: "Asia/Dhaka", createdAt: "2026-09-10T20:00:00Z", selectedVehicle: vehicle },
    // 23:30 on 10 September in Los Angeles, which is already the 11th in UTC.
    { _id: "la-late", country: "US", timeZone: "America/Los_Angeles", createdAt: "2026-09-11T06:30:00Z", selectedVehicle: vehicle },
    // No stored zone: a record from before the field existed, read as Dhaka.
    { _id: "legacy", createdAt: "2026-09-09T18:30:00Z", selectedVehicle: vehicle },
  ]);

  const tenth = await history.getTripHistoryPage("user", { from: "2026-09-10", to: "2026-09-10" });
  assert.deepEqual(tenth.trips.map((trip) => trip.id).sort(), ["dhaka-early", "la-late", "legacy"]);
  assert.equal(tenth.trips.find((trip) => trip.id === "legacy").timeZone, "Asia/Dhaka");

  const fromEleventh = await history.getTripHistoryPage("user", { from: "2026-09-11" });
  assert.deepEqual(fromEleventh.trips.map((trip) => trip.id), ["dhaka-next-day"]);

  const everything = await history.getTripHistoryPage("user", { from: "not-a-date" });
  assert.equal(everything.trips.length, 4);
});

inEveryProcessZone("history months are the trip's own month", async () => {
  const { history } = loadTripHistory([
    // 02:00 on 1 October in Dhaka. A UTC server filed this under September.
    { _id: "dhaka-october", country: "BD", timeZone: "Asia/Dhaka", createdAt: "2026-09-30T20:00:00Z" },
    // 20:00 on 30 September in New York, which is already October in UTC.
    { _id: "ny-september", country: "US", timeZone: "America/New_York", createdAt: "2026-10-01T00:00:00Z" },
  ]);

  const activity = await history.getTripHistoryActivityData("user", new Date("2026-10-11T00:00:00Z"));
  const groups = Object.fromEntries(
    activity.monthlyGroups.map((group) => [group.monthLabel, group.trips.map((trip) => trip.id)]),
  );

  assert.deepEqual(groups, {
    "October 2026": ["dhaka-october"],
    "September 2026": ["ny-september"],
  });
});
