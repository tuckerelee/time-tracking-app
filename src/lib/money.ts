/**
 * Money is always handled as integer cents. Never use floating point for
 * stored or summed amounts.
 *
 * Rounding policy (the only one in the app): an entry's billable amount is
 * minutes / 60 × hourly rate, rounded half-up to the nearest cent, once, when
 * the entry is saved. Report totals are the sum of those rounded line amounts,
 * so totals always reconcile with the line items.
 */

/** Billable amount in cents for a duration at an hourly rate, rounded half-up. */
export function billableCents(minutes: number, rateCents: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error("minutes must be a non-negative integer");
  if (!Number.isInteger(rateCents) || rateCents < 0) throw new Error("rateCents must be a non-negative integer");
  // (m × r) / 60 rounded half-up == floor((m × r + 30) / 60), exact in integer math.
  return Math.floor((minutes * rateCents + 30) / 60);
}

/**
 * Parse a user-entered dollar amount ("85", "$1,234.50", "85.5") into cents.
 * Returns null for anything that is not a non-negative amount with at most two decimals.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^\$/, "").replace(/,/g, "").trim();
  const m = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(s) ?? /^()\.(\d{1,2})$/.exec(s);
  if (!m) return null;
  const dollars = m[1] ? parseInt(m[1], 10) : 0;
  const cents = m[2] ? parseInt(m[2].padEnd(2, "0"), 10) : 0;
  return dollars * 100 + cents;
}

/** "$1,234.56" */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}$${dollars}.${rest}`;
}

/** Plain decimal string for machine-readable exports: "1234.56" */
export function centsToDecimal(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Numeric dollars for spreadsheet cells. Safe: cents / 100 is exact enough at two places for display. */
export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}
