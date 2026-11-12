import { describe, expect, it } from "vitest";
import { billableCents, centsToDecimal, formatCents, parseMoneyToCents } from "@/lib/money";
import {
  decimalHours,
  formatDuration,
  formatTimeOfDay,
  formatTimeSpan,
  minutesBetween,
  parseDuration,
  parseTimeOfDay,
} from "@/lib/duration";
import { addDays, formatRange, isIsoDate, presetRange, todayIn, zonedParts } from "@/lib/dates";
import { reportFilename, sanitizeFilenamePart } from "@/lib/filename";
import { protectFormula, toCsv } from "@/lib/csv";
import { effectiveRate } from "@/lib/rates";
import { buildReport, type ReportEntry } from "@/lib/report";
import { formatPhone } from "@/lib/phone";

describe("duration parsing", () => {
  it.each([
    ["1:30", 90],
    ["1h 30m", 90],
    ["1h30m", 90],
    ["1h30", 90],
    ["1 h 30 m", 90],
    ["90m", 90],
    ["90 min", 90],
    ["1.5", 90],
    ["1.5h", 90],
    [".5", 30],
    ["2", 120],
    ["2h", 120],
    ["0:45", 45],
    ["45m", 45],
    ["1.25", 75],
    ["  1H 5M ", 65],
  ])("%s → %i minutes", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(["", "abc", "1:75", "0", "0m", "-1", "1h 30x", "1..5"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });

  it("formats minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(180)).toBe("3h 00m");
    expect(formatDuration(605)).toBe("10h 05m");
  });

  it("converts to decimal hours with two places", () => {
    expect(decimalHours(90)).toBe("1.50");
    expect(decimalHours(50)).toBe("0.83");
    expect(decimalHours(1)).toBe("0.02");
    expect(decimalHours(685)).toBe("11.42");
  });
});

describe("times of day", () => {
  it.each([
    ["13:30", 810],
    ["1:30p", 810],
    ["1:30 pm", 810],
    ["1:30PM", 810],
    ["1:30 p.m.", 810],
    ["9a", 540],
    ["9 am", 540],
    ["12:15a", 15],
    ["12p", 720],
    ["930a", 570],
    ["0930", 570],
    ["00:00", 0],
  ])("%s → %i", (input, expected) => {
    expect(parseTimeOfDay(input)).toBe(expected);
  });

  it.each(["", "25:00", "13:30p", "1:60", "noon"])("rejects %j", (input) => {
    expect(parseTimeOfDay(input)).toBeNull();
  });

  it("formats times in each style", () => {
    expect(formatTimeOfDay("13:30")).toBe("1:30p");
    expect(formatTimeOfDay("00:05")).toBe("12:05a");
    expect(formatTimeOfDay("12:00", "12")).toBe("12:00 PM");
    expect(formatTimeOfDay("09:15", "24")).toBe("09:15");
    expect(formatTimeSpan("13:30", "15:00")).toBe("1:30p – 3:00p");
    expect(formatTimeSpan("13:30", null)).toBe("");
  });

  it("computes spans, including past midnight", () => {
    expect(minutesBetween(810, 900)).toBe(90);
    expect(minutesBetween(23 * 60, 60)).toBe(120);
  });
});

describe("money and billing", () => {
  it("bills minutes / 60 × rate, rounded half-up to the cent", () => {
    expect(billableCents(90, 8500)).toBe(12750); // $127.50
    expect(billableCents(50, 8500)).toBe(7083); // 70.8333 → $70.83
    expect(billableCents(1, 9000)).toBe(150);
    expect(billableCents(1, 3)).toBe(0); // 0.05¢ → 0
    expect(billableCents(10, 3)).toBe(1); // 0.5¢ → rounds up
    expect(billableCents(135, 11000)).toBe(24750);
    expect(billableCents(0, 8500)).toBe(0);
  });

  it("does not drift the way floating point would", () => {
    // 7 minutes at $0.10/hr = 1.1666…¢ → 1¢; 0.1 * 7 / 60 in floats is messy.
    expect(billableCents(7, 10)).toBe(1);
    // A sum of line items is exact.
    const lines = [billableCents(50, 8500), billableCents(90, 8500)];
    expect(lines.reduce((a, b) => a + b, 0)).toBe(19833);
  });

  it("rejects fractional inputs", () => {
    expect(() => billableCents(1.5, 100)).toThrow();
    expect(() => billableCents(10, 85.5)).toThrow();
  });

  it("parses money into cents", () => {
    expect(parseMoneyToCents("85")).toBe(8500);
    expect(parseMoneyToCents("$1,234.50")).toBe(123450);
    expect(parseMoneyToCents("85.5")).toBe(8550);
    expect(parseMoneyToCents(".75")).toBe(75);
    expect(parseMoneyToCents("110.")).toBe(11000);
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });

  it("formats money", () => {
    expect(formatCents(63833)).toBe("$638.33");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents(5)).toBe("$0.05");
    expect(centsToDecimal(12750)).toBe("127.50");
    expect(centsToDecimal(5)).toBe("0.05");
  });
});

describe("rate inheritance", () => {
  it("uses the project override first, then the client rate", () => {
    expect(effectiveRate(8500, 11000)).toEqual({ rateCents: 11000, source: "project" });
    expect(effectiveRate(8500, null)).toEqual({ rateCents: 8500, source: "client" });
    expect(effectiveRate(8500, undefined)).toEqual({ rateCents: 8500, source: "client" });
    expect(effectiveRate(8500, 0)).toEqual({ rateCents: 0, source: "project" });
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("11/09/2026")).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST change
  });

  it("computes presets (weeks start Monday)", () => {
    const today = "2026-11-12"; // Thursday
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("lastMonth", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("thisWeek", today)).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(presetRange("lastWeek", today)).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("lastMonth", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("thisWeek", "2026-11-15")).toEqual({ from: "2026-11-09", to: "2026-11-15" }); // Sunday
    expect(presetRange("thisMonth", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("resolves 'today' in the configured timezone, not UTC", () => {
    // 2026-11-10 03:30 UTC is still Nov 9 at 9:30pm in Chicago.
    const instant = Date.UTC(2026, 10, 10, 3, 30);
    expect(todayIn("America/Chicago", instant)).toBe("2026-11-09");
    expect(todayIn("UTC", instant)).toBe("2026-11-10");
    expect(zonedParts(instant, "America/Chicago")).toEqual({ date: "2026-11-09", minutes: 21 * 60 + 30 });
  });

  it("formats ranges", () => {
    expect(formatRange("2026-11-01", "2026-11-30")).toBe("Nov 1 – Nov 30, 2026");
    expect(formatRange("2026-12-15", "2027-01-14")).toBe("Dec 15, 2026 – Jan 14, 2027");
    expect(formatRange("2026-11-01", "2026-11-30", "us")).toBe("11/01/2026 – 11/30/2026");
  });
});

describe("report filenames", () => {
  it("follows Client Name_Time_Report_MM.DD.YY_MM.DD.YY_Lee", () => {
    expect(reportFilename({ clientName: "Acme Company", from: "2026-01-01", to: "2026-01-31", suffix: "Lee", ext: "pdf" })).toBe(
      "Acme Company_Time_Report_01.01.26_01.31.26_Lee.pdf",
    );
  });

  it("uses the same convention for xlsx and csv", () => {
    const base = { clientName: "Acme Company", from: "2026-11-01", to: "2026-11-30", suffix: "Lee" } as const;
    expect(reportFilename({ ...base, ext: "xlsx" })).toBe("Acme Company_Time_Report_11.01.26_11.30.26_Lee.xlsx");
    expect(reportFilename({ ...base, ext: "csv" })).toBe("Acme Company_Time_Report_11.01.26_11.30.26_Lee.csv");
  });

  it("uses All_Clients for an all-clients report", () => {
    expect(reportFilename({ clientName: null, from: "2026-11-01", to: "2026-11-30", suffix: "Lee", ext: "csv" })).toBe(
      "All_Clients_Time_Report_11.01.26_11.30.26_Lee.csv",
    );
  });

  it("uses the configured suffix and the selected range, across years", () => {
    expect(reportFilename({ clientName: "Acme", from: "2026-12-15", to: "2027-01-14", suffix: "TEL", ext: "pdf" })).toBe(
      "Acme_Time_Report_12.15.26_01.14.27_TEL.pdf",
    );
    expect(reportFilename({ clientName: "Acme", from: "2026-12-15", to: "2027-01-14", suffix: "", ext: "pdf" })).toBe(
      "Acme_Time_Report_12.15.26_01.14.27.pdf",
    );
  });

  it("sanitizes invalid characters but keeps names readable", () => {
    expect(sanitizeFilenamePart('Smith/Jones: "Legal" <LLC>?')).toBe("SmithJones Legal LLC");
    expect(sanitizeFilenamePart("Harbor & Pine Law")).toBe("Harbor & Pine Law");
    expect(sanitizeFilenamePart("Café Ünïcode")).toBe("Café Ünïcode");
    expect(sanitizeFilenamePart("Trailing dots...")).toBe("Trailing dots");
    expect(reportFilename({ clientName: "???", from: "2026-11-01", to: "2026-11-30", suffix: "Lee", ext: "pdf" })).toBe(
      "Client_Time_Report_11.01.26_11.30.26_Lee.pdf",
    );
  });
});

describe("CSV", () => {
  it("quotes and escapes", () => {
    const csv = toCsv(["A", "B"], [['He said "hi", then left', "line1\nline2"], [{ text: "127.50" }, 3]]);
    expect(csv).toBe('﻿A,B\r\n"He said ""hi"", then left","line1\nline2"\r\n127.50,3\r\n');
  });

  it("neutralizes formula injection in text fields", () => {
    expect(protectFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(protectFormula("+1")).toBe("'+1");
    expect(protectFormula("-cmd")).toBe("'-cmd");
    expect(protectFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(protectFormula("Normal text")).toBe("Normal text");
    expect(toCsv(["X"], [["=1+1"]])).toContain("'=1+1");
  });
});

describe("report totals", () => {
  const e = (id: number, projectId: number, minutes: number, rateCents: number, date = "2026-11-02", startTime: string | null = null): ReportEntry => ({
    id,
    date,
    clientId: 1,
    clientName: "Acme Company",
    projectId,
    projectName: projectId === 1 ? "Website Maintenance" : "Brand Refresh",
    description: "Work",
    minutes,
    rateCents,
    amountCents: billableCents(minutes, rateCents),
    status: "uninvoiced",
    invoiceRef: null,
    startTime,
    endTime: null,
  });

  it("uses each entry's own rate and reconciles with line items", () => {
    const r = buildReport([e(1, 1, 50, 8500), e(2, 1, 90, 8500), e(3, 2, 105, 11000), e(4, 2, 135, 11000)]);
    expect(r.totalMinutes).toBe(380);
    expect(r.totalCents).toBe(63833);
    expect(r.totalCents).toBe(r.entries.reduce((s, x) => s + x.amountCents, 0));
    expect(r.projects.map((p) => [p.projectName, p.minutes, p.amountCents])).toEqual([
      ["Brand Refresh", 240, 44000],
      ["Website Maintenance", 140, 19833],
    ]);
    // One blended rate would be wrong: 380 min at $85 = $538.33.
    expect(r.totalCents).not.toBe(billableCents(380, 8500));
  });

  it("lists every distinct rate within a project", () => {
    const r = buildReport([e(1, 1, 60, 8500), e(2, 1, 60, 9500)]);
    expect(r.projects[0].rates).toEqual([8500, 9500]);
    expect(r.totalCents).toBe(18000);
  });

  it("sorts by date, then start time", () => {
    const r = buildReport([e(1, 1, 60, 8500, "2026-11-09", "13:30"), e(2, 1, 60, 8500, "2026-11-09", "08:00"), e(3, 1, 60, 8500, "2026-11-01")]);
    expect(r.entries.map((x) => x.id)).toEqual([3, 2, 1]);
  });
});

describe("phone formatting", () => {
  it("formats US numbers", () => {
    expect(formatPhone("2174409461")).toBe("(217) 440-9461");
    expect(formatPhone("217-440-9461")).toBe("(217) 440-9461");
    expect(formatPhone("+1 217 440 9461")).toBe("(217) 440-9461");
    expect(formatPhone("+44 20 7946 0000")).toBe("+44 20 7946 0000");
  });
});
