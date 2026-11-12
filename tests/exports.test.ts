import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { buildPdf } from "@/server/export/pdf";
import { buildXlsx } from "@/server/export/xlsx";
import { buildCsv } from "@/server/export/csv";
import { buildReport, type ReportEntry } from "@/lib/report";
import { billableCents } from "@/lib/money";
import type { Settings } from "@/db/schema";
import type { ReportData } from "@/server/reports";

const settings: Settings = {
  id: 1,
  businessName: "Sample Business",
  email: "you@example.com",
  phone: "(555) 555-0100",
  address: "123 Main Street, Springfield, IL 62701",
  website: "",
  reportFooter: "Thank you for your business.",
  filenameSuffix: "Lee",
  defaultRateCents: 7500,
  timezone: "America/Chicago",
  dateFormat: "medium",
  timeFormat: "12short",
  showTimesOnReports: true,
  updatedAt: 0,
};

function sample(n: number): ReportData {
  const rates = [8500, 11000, 6500];
  const names = ["Website Maintenance", "Brand Refresh", "Hosting"];
  const entries: ReportEntry[] = Array.from({ length: n }, (_, i) => {
    const p = i % 3;
    const minutes = 30 + (i % 5) * 15;
    return {
      id: i + 1,
      date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
      clientId: 1,
      clientName: "Acme Company",
      projectId: p + 1,
      projectName: names[p],
      description: i % 7 === 0 ? "A longer description of the work performed that wraps onto a second line, to check row spacing" : i === 1 ? "=HYPERLINK(\"http://x\")" : `Task ${i}`,
      minutes,
      rateCents: rates[p],
      amountCents: billableCents(minutes, rates[p]),
      status: i % 4 === 0 ? "invoiced" : "uninvoiced",
      invoiceRef: i % 4 === 0 ? "INV-1" : null,
      startTime: i % 4 ? "13:30" : null,
      endTime: i % 4 ? "14:15" : null,
    };
  });
  return {
    report: buildReport(entries),
    clientName: "Acme Company",
    filters: { clientId: 1, projectId: null, from: "2026-11-01", to: "2026-11-30", status: "all", showTimes: true },
    filenameBase: (ext) => `test.${ext}`,
  };
}

describe("exports", () => {
  it("renders a multi-page PDF", async () => {
    const pdf = await buildPdf(sample(80), settings);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    if (process.env.EXPORT_SAMPLE_DIR) fs.writeFileSync(`${process.env.EXPORT_SAMPLE_DIR}/sample.pdf`, pdf);
  }, 30_000);

  it("renders an empty report", async () => {
    const pdf = await buildPdf(sample(0), settings);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("builds a workbook whose totals match the line items", async () => {
    const data = sample(25);
    const buf = await buildXlsx(data, settings);
    if (process.env.EXPORT_SAMPLE_DIR) fs.writeFileSync(`${process.env.EXPORT_SAMPLE_DIR}/sample.xlsx`, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Time Entries"]);
    const ws = wb.getWorksheet("Time Entries")!;
    const amountCol = ws.getRow(1).values as string[];
    const idx = amountCol.indexOf("Amount");
    let sum = 0;
    for (let r = 2; r <= 26; r++) sum += Math.round(Number(ws.getRow(r).getCell(idx).value) * 100);
    expect(sum).toBe(data.report.totalCents);
    const dateCell = ws.getRow(2).getCell(1).value as Date;
    expect(dateCell.toISOString().slice(0, 10)).toBe(data.report.entries[0].date);
    // Text stays text: no formula objects from user descriptions.
    const descIdx = amountCol.indexOf("Description");
    for (let r = 2; r <= 26; r++) expect(typeof ws.getRow(r).getCell(descIdx).value).toBe("string");
  });

  it("builds a CSV with plain numbers and protected text", () => {
    const csv = buildCsv(sample(3));
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "Date,Client,Project,Description,Start time,End time,Duration (hours),Duration (minutes),Hourly rate,Billable amount,Billing status,Invoice reference",
    );
    expect(lines[1]).toBe('2026-11-01,Acme Company,Website Maintenance,"A longer description of the work performed that wraps onto a second line, to check row spacing",,,0.50,30,85.00,42.50,Invoiced,INV-1');
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[2]).toContain(",13:30,14:15,0.75,45,110.00,82.50,Uninvoiced,");
  });
});
