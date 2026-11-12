import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isIsoDate, presetRange, todayIn, type IsoDate, type RangePreset } from "@/lib/dates";
import { buildReport, type BillingStatus, type Report } from "@/lib/report";
import { reportFilename } from "@/lib/filename";
import { listEntries } from "./entries";
import { getSettings } from "./settings";

export type ReportFilters = {
  clientId: number | null;
  projectId: number | null;
  from: IsoDate;
  to: IsoDate;
  status: BillingStatus | "all";
  showTimes: boolean;
};

/** Parse report filters from URL search params, falling back to "this month, all entries". */
export function parseReportFilters(params: Record<string, string | string[] | undefined> | URLSearchParams): ReportFilters & { preset: RangePreset } {
  const get = (k: string) => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    return Array.isArray(v) ? v[0] : v ?? undefined;
  };
  const s = getSettings();
  const today = todayIn(s.timezone);
  const presetRaw = get("preset") as RangePreset | undefined;
  const preset: RangePreset = presetRaw && ["thisMonth", "lastMonth", "thisWeek", "lastWeek", "thisYear", "custom"].includes(presetRaw) ? presetRaw : "thisMonth";
  let from: IsoDate;
  let to: IsoDate;
  if (preset === "custom") {
    const f = get("from");
    const t = get("to");
    const def = presetRange("thisMonth", today);
    from = isIsoDate(f) ? f : def.from;
    to = isIsoDate(t) ? t : def.to;
    if (from > to) [from, to] = [to, from];
  } else {
    ({ from, to } = presetRange(preset, today));
  }
  const num = (k: string) => {
    const n = Number(get(k));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const status = get("status");
  const times = get("times");
  return {
    preset,
    clientId: num("client"),
    projectId: num("project"),
    from,
    to,
    status: status === "uninvoiced" || status === "invoiced" ? status : "all",
    showTimes: times === undefined ? s.showTimesOnReports : times === "1",
  };
}

export type ReportData = {
  filters: ReportFilters;
  clientName: string | null;
  report: Report;
  filenameBase: (ext: "pdf" | "xlsx" | "csv") => string;
};

export function getReportData(filters: ReportFilters): ReportData {
  const s = getSettings();
  const client = filters.clientId ? getDb().select({ name: clients.name }).from(clients).where(eq(clients.id, filters.clientId)).get() : null;
  const entries = listEntries({
    clientId: filters.clientId,
    projectId: filters.projectId,
    from: filters.from,
    to: filters.to,
    status: filters.status,
  });
  const clientName = client?.name ?? null;
  return {
    filters,
    clientName,
    report: buildReport(entries),
    filenameBase: (ext) => reportFilename({ clientName, from: filters.from, to: filters.to, suffix: s.filenameSuffix, ext }),
  };
}
