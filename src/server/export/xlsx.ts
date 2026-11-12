import ExcelJS from "exceljs";
import type { Settings } from "@/db/schema";
import { centsToNumber } from "@/lib/money";
import { formatDuration, formatTimeOfDay } from "@/lib/duration";
import { formatRange } from "@/lib/dates";
import type { ReportData } from "../reports";

const CURRENCY = '"$"#,##0.00';
const HOURS = "0.00";
const DATE = "mmm d, yyyy";
const thin = { style: "thin" as const, color: { argb: "FF1C1917" } };
const hair = { style: "thin" as const, color: { argb: "FFE7E5E4" } };

function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  // ExcelJS converts dates using UTC, so a UTC midnight keeps the calendar date exact.
  return new Date(Date.UTC(y, m - 1, d));
}

export async function buildXlsx(data: ReportData, s: Settings): Promise<Buffer> {
  const { report, filters, clientName } = data;
  const wb = new ExcelJS.Workbook();
  wb.creator = s.businessName || "Ledger";
  wb.created = new Date();
  const period = formatRange(filters.from, filters.to);
  const multiClient = report.clientCount > 1 || clientName === null;

  // ---------- Summary ----------
  const sum = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  sum.columns = [{ width: 34 }, { width: 22 }, { width: 12 }, { width: 14 }, { width: 16 }];
  sum.addRow([s.businessName || "Time Report"]).font = { bold: true, size: 14 };
  const contact = [s.address, s.phone, s.email, s.website].filter(Boolean).join("  ·  ");
  if (contact) sum.addRow([contact]).font = { color: { argb: "FF57534E" }, size: 10 };
  sum.addRow([]);
  sum.addRow(["Time Report"]).font = { bold: true, size: 16 };
  const info: [string, string | number][] = [
    ["Client", clientName ?? "All clients"],
    ["Reporting period", period],
    ["Billing status", filters.status === "all" ? "All entries" : filters.status === "uninvoiced" ? "Uninvoiced only" : "Invoiced only"],
    ["Entries", report.entries.length],
  ];
  for (const [k, v] of info) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { color: { argb: "FF57534E" } };
    r.getCell(2).alignment = { horizontal: "left" };
  }
  const th = sum.addRow(["Total hours", report.totalMinutes / 60]);
  th.getCell(2).numFmt = HOURS;
  th.getCell(2).alignment = { horizontal: "left" };
  th.getCell(1).font = { color: { argb: "FF57534E" } };
  const tb = sum.addRow(["Total billable", centsToNumber(report.totalCents)]);
  tb.getCell(2).numFmt = CURRENCY;
  tb.getCell(2).alignment = { horizontal: "left" };
  tb.font = { bold: true };
  sum.addRow([]);

  const head = sum.addRow([multiClient ? "Client · Project" : "Project", "Rate(s)", "Entries", "Hours", "Amount"]);
  head.font = { bold: true };
  head.eachCell((c) => (c.border = { bottom: thin }));
  const first = head.number + 1;
  for (const p of report.projects) {
    const r = sum.addRow([
      multiClient ? `${p.clientName} · ${p.projectName}` : p.projectName,
      p.rates.map((c) => `$${(c / 100).toFixed(2)}`).join(", "),
      p.entryCount,
      p.minutes / 60,
      centsToNumber(p.amountCents),
    ]);
    r.getCell(4).numFmt = HOURS;
    r.getCell(5).numFmt = CURRENCY;
    r.eachCell((c) => (c.border = { bottom: hair }));
  }
  const last = sum.lastRow!.number;
  if (report.projects.length) {
    const t = sum.addRow([
      "Total",
      "",
      { formula: `SUM(C${first}:C${last})`, result: report.entries.length },
      { formula: `SUM(D${first}:D${last})`, result: report.totalMinutes / 60 },
      { formula: `SUM(E${first}:E${last})`, result: centsToNumber(report.totalCents) },
    ]);
    t.font = { bold: true };
    t.getCell(4).numFmt = HOURS;
    t.getCell(5).numFmt = CURRENCY;
    t.eachCell((c) => (c.border = { top: thin }));
  }
  for (const col of [3, 4, 5]) sum.getColumn(col).alignment = { horizontal: "right" };

  // ---------- Time Entries ----------
  const ws = wb.addWorksheet("Time Entries", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols: Partial<ExcelJS.Column>[] = [
    { header: "Date", key: "date", width: 13, style: { numFmt: DATE } },
    { header: "Client", key: "client", width: 22 },
    { header: "Project", key: "project", width: 24 },
    { header: "Description", key: "description", width: 52 },
    ...(filters.showTimes
      ? [
          { header: "Start", key: "start", width: 10 },
          { header: "End", key: "end", width: 10 },
        ]
      : []),
    { header: "Duration", key: "duration", width: 11 },
    { header: "Hours", key: "hours", width: 9, style: { numFmt: HOURS } },
    { header: "Minutes", key: "minutes", width: 9 },
    { header: "Hourly rate", key: "rate", width: 12, style: { numFmt: CURRENCY } },
    { header: "Amount", key: "amount", width: 13, style: { numFmt: CURRENCY } },
    { header: "Status", key: "status", width: 12 },
    { header: "Invoice ref", key: "ref", width: 16 },
  ];
  ws.columns = cols;
  for (const e of report.entries) {
    ws.addRow({
      date: isoToExcelDate(e.date),
      client: e.clientName,
      project: e.projectName,
      description: e.description,
      start: e.startTime ? formatTimeOfDay(e.startTime, s.timeFormat) : "",
      end: e.endTime ? formatTimeOfDay(e.endTime, s.timeFormat) : "",
      duration: formatDuration(e.minutes),
      hours: e.minutes / 60,
      minutes: e.minutes,
      rate: centsToNumber(e.rateCents),
      // The stored, rounded amount — so the workbook matches the PDF to the cent.
      amount: centsToNumber(e.amountCents),
      status: e.status === "invoiced" ? "Invoiced" : "Uninvoiced",
      ref: e.invoiceRef ?? "",
    }).getCell("description").alignment = { wrapText: true, vertical: "top" };
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((c) => (c.border = { bottom: thin }));
  const n = report.entries.length;
  if (n) {
    const col = (key: string) => ws.getColumn(key).letter;
    const total = ws.addRow({
      date: null,
      description: "Total",
      hours: { formula: `SUM(${col("hours")}2:${col("hours")}${n + 1})`, result: report.totalMinutes / 60 },
      minutes: { formula: `SUM(${col("minutes")}2:${col("minutes")}${n + 1})`, result: report.totalMinutes },
      amount: { formula: `SUM(${col("amount")}2:${col("amount")}${n + 1})`, result: centsToNumber(report.totalCents) },
    });
    total.font = { bold: true };
    total.eachCell((c) => (c.border = { top: thin }));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: n + 1, column: cols.length } };
  }
  ws.eachRow((r) => (r.alignment = { ...r.alignment, vertical: "top" }));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
