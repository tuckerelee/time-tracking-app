/**
 * Durations are stored as integer minutes. Times of day are stored as "HH:MM"
 * (24-hour) strings, local to the configured timezone.
 */

/**
 * Parse a duration typed by the user into whole minutes.
 * Accepts: "1:30", "1h 30m", "1h30m", "1h30", "1h", "90m", "90 min", "1.5", "1.5h", ".5", "2".
 * A bare number is decimal hours. Returns null when the input is not recognized or is zero.
 */
export function parseDuration(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let minutes: number | null = null;
  let m: RegExpExecArray | null;

  if ((m = /^(\d+):(\d{1,2})$/.exec(s))) {
    const mm = parseInt(m[2], 10);
    if (mm > 59) return null;
    minutes = parseInt(m[1], 10) * 60 + mm;
  } else if ((m = /^(\d+) ?h ?(\d+)$/.exec(s))) {
    minutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  } else if (
    (m = /^(?:(\d+(?:\.\d+)?|\.\d+) ?(?:h|hr|hrs|hour|hours))? ?(?:(\d+) ?(?:m|min|mins|minute|minutes))?$/.exec(s)) &&
    (m[1] || m[2])
  ) {
    minutes = Math.round(parseFloat(m[1] ?? "0") * 60) + parseInt(m[2] ?? "0", 10);
  } else if (/^(\d+(\.\d+)?|\.\d+)$/.test(s)) {
    minutes = Math.round(parseFloat(s) * 60);
  }

  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

/** "1h 30m", "45m", "3h 00m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Decimal hours as a string with two places ("1.50"). Display/export only; never used for money. */
export function decimalHours(minutes: number): string {
  // Integer math: hundredths of an hour, rounded half-up.
  const hundredths = Math.floor((minutes * 100 + 30) / 60);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

export type TimeFormat = "12short" | "12" | "24";

/**
 * Parse a time of day into minutes after midnight.
 * Accepts "13:30", "1:30p", "1:30 pm", "1:30PM", "9a", "9 am", "930a", "0930".
 */
export function parseTimeOfDay(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (!s) return null;
  const m = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(s);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (h === 12) h = 0;
    if (ap.startsWith("p")) h += 12;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + min;
}

/** Minutes after midnight → "HH:MM" storage form. */
export function toHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" storage form (or anything parseTimeOfDay accepts) → display form. */
export function formatTimeOfDay(value: string | number, format: TimeFormat = "12short"): string {
  const mins = typeof value === "number" ? value : parseTimeOfDay(value);
  if (mins === null) return "";
  const h = Math.floor(mins / 60) % 24;
  const m = String(mins % 60).padStart(2, "0");
  if (format === "24") return `${String(h).padStart(2, "0")}:${m}`;
  const h12 = h % 12 || 12;
  const pm = h >= 12;
  return format === "12" ? `${h12}:${m} ${pm ? "PM" : "AM"}` : `${h12}:${m}${pm ? "p" : "a"}`;
}

/** "1:30p – 3:00p", or "" when either end is missing. */
export function formatTimeSpan(start: string | null | undefined, end: string | null | undefined, format: TimeFormat = "12short"): string {
  if (!start || !end) return "";
  return `${formatTimeOfDay(start, format)} – ${formatTimeOfDay(end, format)}`;
}

/** Minutes between two times of day; an end at or before the start is treated as the next day. */
export function minutesBetween(startMinutes: number, endMinutes: number): number {
  let d = endMinutes - startMinutes;
  if (d <= 0) d += 1440;
  return d;
}
