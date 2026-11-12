import type { IsoDate } from "./dates";

export type BillingStatus = "uninvoiced" | "invoiced";

export type ReportEntry = {
  id: number;
  date: IsoDate;
  clientId: number;
  clientName: string;
  projectId: number;
  projectName: string;
  description: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
  status: BillingStatus;
  invoiceRef: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type ProjectTotal = {
  projectId: number;
  projectName: string;
  clientName: string;
  entryCount: number;
  minutes: number;
  amountCents: number;
  /** Distinct stored rates, ascending. */
  rates: number[];
};

export type Report = {
  entries: ReportEntry[];
  projects: ProjectTotal[];
  totalMinutes: number;
  totalCents: number;
  clientCount: number;
};

/**
 * Sort entries and compute totals. Every amount comes from the entry's own
 * stored amount (computed from its own stored rate), so mixed-rate reports
 * are always correct and totals reconcile exactly with the line items.
 */
export function buildReport(input: ReportEntry[]): Report {
  const entries = [...input].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") ||
      a.id - b.id,
  );
  const byProject = new Map<number, ProjectTotal>();
  let totalMinutes = 0;
  let totalCents = 0;
  const clients = new Set<number>();
  for (const e of entries) {
    totalMinutes += e.minutes;
    totalCents += e.amountCents;
    clients.add(e.clientId);
    let p = byProject.get(e.projectId);
    if (!p) {
      p = { projectId: e.projectId, projectName: e.projectName, clientName: e.clientName, entryCount: 0, minutes: 0, amountCents: 0, rates: [] };
      byProject.set(e.projectId, p);
    }
    p.entryCount++;
    p.minutes += e.minutes;
    p.amountCents += e.amountCents;
    if (!p.rates.includes(e.rateCents)) p.rates.push(e.rateCents);
  }
  const projects = [...byProject.values()]
    .map((p) => ({ ...p, rates: [...p.rates].sort((a, b) => a - b) }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.projectName.localeCompare(b.projectName));
  return { entries, projects, totalMinutes, totalCents, clientCount: clients.size };
}

/** Entries grouped by project in the same order as report.projects. */
export function groupByProject(report: Report): { project: ProjectTotal; entries: ReportEntry[] }[] {
  return report.projects.map((project) => ({
    project,
    entries: report.entries.filter((e) => e.projectId === project.projectId),
  }));
}
