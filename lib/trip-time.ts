/**
 * Every conversion between a wall-clock time and an instant, and every trip
 * time shown to a user, goes through this module.
 *
 * Nothing here reads the process's or the browser's own time zone: there is no
 * `getHours`, no `setHours` and no `new Date("2026-09-20T09:00")`. Each of
 * those answers in whatever zone the code happens to run in, which is how a
 * 09:00 Dhaka departure used to be stored as 15:00 by a UTC server and then
 * shown differently on two screens. The zone is always an explicit argument.
 *
 * It has no dependencies and no server-only imports, so the planner form and
 * the server validate against the same rules.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** What an `<input type="datetime-local">` produces, with optional seconds. */
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/;

/** An ISO instant that says which offset it is in. A bare local time is not one. */
const INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, 6 = Saturday. */
  weekdayIndex: number;
};

const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function getWallTimeFormatter(timeZone: string) {
  let formatter = wallTimeFormatters.get(timeZone);

  if (!formatter) {
    // The locale extensions pin the calendar and digits, so the parts below
    // are plain Gregorian numbers on every runtime.
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    wallTimeFormatters.set(timeZone, formatter);
  }

  return formatter;
}

/** The clock and calendar reading of an instant in one zone. */
function getWallTime(instant: Date, timeZone: string): WallTime {
  const parts = getWallTimeFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
    weekdayIndex: WEEKDAYS.indexOf(read("weekday")),
  };
}

/** How far a zone's clock is ahead of UTC at an instant. */
function getOffsetMs(instant: Date, timeZone: string) {
  const wall = getWallTime(instant, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );

  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export type LocalDateTimeResult =
  | {
      ok: true;
      instant: Date;
      /**
       * True when the clocks went back and this wall time happened twice. The
       * instant is the first of the two.
       */
      ambiguous: boolean;
    }
  | {
      ok: false;
      /**
       * `nonexistent` is a real-looking time the clocks skipped when they went
       * forward. `invalid` is anything that is not a wall-clock time at all.
       */
      reason: "invalid" | "nonexistent";
    };

/**
 * Turns a wall-clock time in a zone into the instant it names.
 *
 * Daylight saving makes this a partial function. A time the clocks skipped
 * names no instant and is refused rather than nudged, because the user would
 * otherwise get a departure an hour from what they typed. A time that happened
 * twice resolves to its first occurrence.
 */
export function localDateTimeToInstant(
  local: string,
  timeZone: string,
): LocalDateTimeResult {
  const match = LOCAL_DATE_TIME_PATTERN.exec(local);

  if (!match) {
    return { ok: false, reason: "invalid" };
  }

  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallAsUtc);

  // Date.UTC rolls 31 February into March instead of failing.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return { ok: false, reason: "invalid" };
  }

  // The zone's offset a day either side covers both sides of any transition.
  // An offset is right only if the zone really is at that offset at the
  // instant it produces.
  const instants = new Set<number>();

  for (const probe of [wallAsUtc - DAY_MS, wallAsUtc + DAY_MS]) {
    const candidate = wallAsUtc - getOffsetMs(new Date(probe), timeZone);

    if (getOffsetMs(new Date(candidate), timeZone) === wallAsUtc - candidate) {
      instants.add(candidate);
    }
  }

  if (instants.size === 0) {
    return { ok: false, reason: "nonexistent" };
  }

  return {
    ok: true,
    instant: new Date(Math.min(...instants)),
    ambiguous: instants.size > 1,
  };
}

/**
 * Parses an instant that carries its own offset ("…Z" or "…+06:00").
 *
 * A string without one is refused: `new Date` would read it in the server's
 * zone, which is the ambiguity this module exists to remove.
 */
export function parseInstant(value: string): Date | null {
  if (!INSTANT_PATTERN.test(value)) {
    return null;
  }

  const instant = new Date(value);

  return Number.isNaN(instant.getTime()) ? null : instant;
}

/** An instant as a `datetime-local` value ("2026-09-20T09:00") in one zone. */
export function formatLocalDateTime(value: Date | string, timeZone: string) {
  const wall = getWallTime(toDate(value), timeZone);

  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** The calendar day ("2026-09-20") an instant falls on in one zone. */
export function getLocalDateKey(value: Date | string, timeZone: string) {
  return formatLocalDateTime(value, timeZone).slice(0, 10);
}

/** The calendar month ("2026-09") an instant falls in, in one zone. */
export function getLocalMonthKey(value: Date | string, timeZone: string) {
  return formatLocalDateTime(value, timeZone).slice(0, 7);
}

/** The weekday and minute-of-day an instant falls on in one zone. */
export function getLocalClock(value: Date | string, timeZone: string) {
  const wall = getWallTime(toDate(value), timeZone);

  return {
    minuteOfDay: wall.hour * 60 + wall.minute,
    weekdayIndex: wall.weekdayIndex,
  };
}

/**
 * A trip time as the traveller will read it on a clock at the pickup point,
 * with the zone named so it cannot be mistaken for the viewer's own.
 */
export function formatTripDateTime(
  value: Date | string,
  timeZone: string,
  { weekday = true, year = true }: { weekday?: boolean; year?: boolean } = {},
) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    ...(weekday ? { weekday: "short" } : {}),
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(toDate(value));
}

/** "September 2026", for the month an instant falls in, in one zone. */
export function formatTripMonth(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(toDate(value));
}
