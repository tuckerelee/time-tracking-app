import { toCsv, type CsvCell } from "@/lib/csv";
import { centsToDecimal } from "@/lib/money";
import { decimalHours } from "@/lib/duration";
import type { ReportData } from "../reports";

/**
 * One row per entry. Money and hours are plain numbers (no "$") so
 * spreadsheet and accounting software can calculate with them. Dates are
 * ISO (YYYY-MM-DD) and times 24-hour, which every importer understands.
 */
export function buildCsv({ report, filters }: ReportData): string {
  const header = [
    "Date",
    "Client",
    "Project",
    "Description",
    ...(filters.showTimes ? ["Start time", "End time"] : []),
    "Duration (hours)",
    "Duration (minutes)",
    "Hourly rate",
    "Billable amount",
    "Billing status",
    "Invoice reference",
  ];
  const rows: CsvCell[][] = report.entries.map((e) => [
    { text: e.date },
    e.clientName,
    e.projectName,
    e.description,
    ...(filters.showTimes ? [{ text: e.startTime ?? "" }, { text: e.endTime ?? "" }] : []),
    { text: decimalHours(e.minutes) },
    e.minutes,
    { text: centsToDecimal(e.rateCents) },
    { text: centsToDecimal(e.amountCents) },
    { text: e.status === "invoiced" ? "Invoiced" : "Uninvoiced" },
    e.invoiceRef ?? "",
  ]);
  return toCsv(header, rows);
}
