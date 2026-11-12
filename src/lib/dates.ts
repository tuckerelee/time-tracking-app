/**
 * Work dates are calendar dates stored as "YYYY-MM-DD" strings. They are never
 * converted through UTC, so an entry can't shift a day. "Today" and timer
 * timestamps are resolved in the configured timezone.
 */

export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is IsoDate {
  if (typeof s !== "string") return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parts(iso: IsoDate): [number, number, number] {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid date: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromParts(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Calendar arithmetic done on a UTC-noon anchor so DST never matters. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + days);
  return fromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: IsoDate): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Calendar date and minutes-after-midnight of an instant, in a timezone. */
export function zonedParts(epochMs: number, timeZone: string): { date: IsoDate; minutes: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(epochMs)).map((x) => [x.type, x.value]));
  return {
    date: fromParts(Number(p.year), Number(p.month), Number(p.day)),
    minutes: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

export function todayIn(timeZone: string, now: number = Date.now()): IsoDate {
  return zonedParts(now, timeZone).date;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type RangePreset = "thisMonth" | "lastMonth" | "thisWeek" | "lastWeek" | "thisYear" | "custom";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisWeek", label: "This week" },
  { id: "lastWeek", label: "Last week" },
  { id: "thisYear", label: "This year" },
  { id: "custom", label: "Custom" },
];

/** Inclusive date range for a preset, relative to `today`. Weeks start on Monday. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: IsoDate): { from: IsoDate; to: IsoDate } {
  const [y, m] = parts(today);
  switch (preset) {
    case "thisMonth":
      return { from: fromParts(y, m, 1), to: fromParts(y, m, daysInMonth(y, m)) };
    case "lastMonth": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: fromParts(py, pm, 1), to: fromParts(py, pm, daysInMonth(py, pm)) };
    }
    case "thisWeek": {
      const monday = addDays(today, -((weekday(today) + 6) % 7));
      return { from: monday, to: addDays(monday, 6) };
    }
    case "lastWeek": {
      const monday = addDays(today, -((weekday(today) + 6) % 7) - 7);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "thisYear":
      return { from: fromParts(y, 1, 1), to: fromParts(y, 12, 31) };
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DateFormat = "medium" | "us";

/** "Nov 9, 2026" (medium) or "11/09/2026" (us) */
export function formatDate(iso: IsoDate, format: DateFormat = "medium"): string {
  const [y, m, d] = parts(iso);
  if (format === "us") return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Nov 9" — for table rows where the year is obvious from the period. */
export function formatDateShort(iso: IsoDate, format: DateFormat = "medium"): string {
  const [, m, d] = parts(iso);
  if (format === "us") return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Mon, Nov 9" */
export function formatDayHeading(iso: IsoDate): string {
  const [, m, d] = parts(iso);
  return `${DAYS[weekday(iso)]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Nov 1 – Nov 30, 2026" or "Dec 15, 2026 – Jan 14, 2027" */
export function formatRange(from: IsoDate, to: IsoDate, format: DateFormat = "medium"): string {
  if (format === "us") return `${formatDate(from, "us")} – ${formatDate(to, "us")}`;
  const [fy] = parts(from);
  const [ty] = parts(to);
  if (fy === ty) return `${formatDateShort(from)} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** "MM.DD.YY" — used in export filenames. */
export function formatFilenameDate(iso: IsoDate): string {
  const [y, m, d] = parts(iso);
  return `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}.${String(y % 100).padStart(2, "0")}`;
}
