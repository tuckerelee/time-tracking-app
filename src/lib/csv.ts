/**
 * Neutralize spreadsheet formula injection for untrusted text: a cell starting
 * with = + - @ (or tab / carriage return) is prefixed with an apostrophe so
 * Excel, Sheets and Numbers treat it as text.
 */
export function protectFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Quote a CSV field when needed (RFC 4180). */
export function quoteCsv(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export type CsvCell = string | number | null | undefined | { text: string };

/**
 * Build a CSV document. Numbers are written as plain numbers. Strings are
 * treated as untrusted text and protected against formula injection.
 */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const cell = (v: CsvCell): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    if (typeof v === "object") return quoteCsv(v.text); // trusted, preformatted (e.g. "123.45")
    return quoteCsv(protectFormula(v));
  };
  const lines = [header.map((h) => quoteCsv(h)).join(","), ...rows.map((r) => r.map(cell).join(","))];
  // BOM so Excel opens UTF-8 (en dashes, accents) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
