import Link from "next/link";
import { Download } from "lucide-react";
import { getReportData, parseReportFilters } from "@/server/reports";
import { listClients } from "@/server/clients";
import { listProjects } from "@/server/projects";
import { getSettings } from "@/server/settings";
import { formatCents } from "@/lib/money";
import { formatDuration, formatTimeSpan } from "@/lib/duration";
import { formatDateShort, formatRange } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ReportFiltersForm } from "./report-filters";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = getSettings();
  const filters = parseReportFilters(sp);
  const { report, clientName, filenameBase } = getReportData(filters);
  const clients = listClients({ includeArchived: true });
  const projects = listProjects({ includeArchived: true });

  const qs = new URLSearchParams({
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    status: filters.status,
    times: filters.showTimes ? "1" : "0",
    ...(filters.clientId ? { client: String(filters.clientId) } : {}),
    ...(filters.projectId ? { project: String(filters.projectId) } : {}),
  }).toString();
  const entriesLink = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    status: "uninvoiced",
    ...(filters.clientId ? { client: String(filters.clientId) } : {}),
    ...(filters.projectId ? { project: String(filters.projectId) } : {}),
  }).toString();
  const multiClient = clientName === null && report.clientCount > 1;
  const statusLabel = filters.status === "all" ? "All entries" : filters.status === "uninvoiced" ? "Uninvoiced only" : "Invoiced only";

  const downloads = [
    { ext: "pdf" as const, label: "PDF", hint: filters.showTimes ? "Ready to email · with start/end times" : "Ready to email" },
    { ext: "xlsx" as const, label: "Excel", hint: "Summary and Time Entries sheets" },
    { ext: "csv" as const, label: "CSV", hint: filters.showTimes ? "One row per entry · with Start and End columns" : "One row per entry, plain numbers" },
  ];

  return (
    <>
      <PageHeader title="Reports" subtitle="Preview a time report, then download it as PDF, Excel or CSV." />
      <div className="flex flex-wrap items-start gap-5">
        <ReportFiltersForm
          filters={filters}
          clients={clients.map((c) => ({ id: c.id, name: c.archived ? `${c.name} (archived)` : c.name }))}
          projects={projects.map((p) => ({ id: p.id, clientId: p.clientId, name: p.archived ? `${p.name} (archived)` : p.name }))}
        />

        <section aria-label="Report preview" className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
          <Card className="overflow-hidden">
            <div className="h-1 bg-accent" />
            <div className="flex flex-wrap justify-between gap-4 border-b border-stone-100 px-6 py-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold tracking-wider text-accent uppercase">Time Report</span>
                <span className="text-[22px] font-semibold tracking-tight">{clientName ?? "All clients"}</span>
                <span className="text-[13px] text-stone-600">
                  {formatRange(filters.from, filters.to, s.dateFormat)} · {statusLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-7">
                <Metric label="Entries" value={String(report.entries.length)} />
                <Metric label="Total hours" value={formatDuration(report.totalMinutes)} />
                <Metric label="Total billable" value={formatCents(report.totalCents)} accent />
              </div>
            </div>
            {report.entries.length === 0 ? (
              <EmptyState title="No time recorded for these filters.">Try another date range.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[600px] pt-2 pb-3 text-[13px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_140px_100px] gap-3 px-6 py-2 text-xs font-medium text-stone-500">
                    <span>Project breakdown</span>
                    <span className="text-right">Entries</span>
                    <span className="text-right">Hours</span>
                    <span className="text-right">Rate(s)</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {report.projects.map((p) => (
                    <div key={p.projectId} className="grid grid-cols-[minmax(0,1fr)_70px_90px_140px_100px] gap-3 border-t border-stone-100 px-6 py-2.5">
                      <span>
                        <span className="font-medium">{p.projectName}</span>
                        {multiClient ? <span className="text-stone-500"> · {p.clientName}</span> : null}
                      </span>
                      <span className="text-right">{p.entryCount}</span>
                      <span className="text-right">{formatDuration(p.minutes)}</span>
                      <span className="text-right text-stone-600">{p.rates.map(formatCents).join(", ")}</span>
                      <span className="text-right font-semibold">{formatCents(p.amountCents)}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_140px_100px] gap-3 border-t border-stone-200 px-6 pt-3 pb-1 font-semibold">
                    <span>Total</span>
                    <span className="text-right">{report.entries.length}</span>
                    <span className="text-right">{formatDuration(report.totalMinutes)}</span>
                    <span />
                    <span className="text-right">{formatCents(report.totalCents)}</span>
                  </div>

                  <div className="mt-3 border-t border-stone-100 px-6 pt-3.5 pb-2 text-xs font-medium text-stone-500">Entries</div>
                  {report.entries.map((e) => (
                    <div
                      key={e.id}
                      className={
                        filters.showTimes
                          ? "grid grid-cols-[56px_minmax(0,1fr)_120px_64px_80px] gap-3 border-t border-stone-100 px-6 py-2"
                          : "grid grid-cols-[56px_minmax(0,1fr)_64px_80px] gap-3 border-t border-stone-100 px-6 py-2"
                      }
                    >
                      <span className="text-stone-600">{formatDateShort(e.date, s.dateFormat)}</span>
                      <span className="min-w-0">
                        <span className="font-medium">{e.description}</span>
                        <span className="text-stone-500">
                          {" "}
                          · {multiClient ? `${e.clientName} · ` : ""}
                          {e.projectName}
                        </span>
                      </span>
                      {filters.showTimes ? <span className="whitespace-nowrap text-stone-600">{formatTimeSpan(e.startTime, e.endTime, s.timeFormat) || "—"}</span> : null}
                      <span className="text-right">{formatDuration(e.minutes)}</span>
                      <span className="text-right font-semibold">{formatCents(e.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {downloads.map((d) => {
              const file = filenameBase(d.ext);
              return (
                <a
                  key={d.ext}
                  href={`/api/reports/${d.ext}?${qs}`}
                  download={file}
                  className="group flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-4 hover:border-accent"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{d.label}</span>
                    <Download size={16} className="text-accent" aria-hidden />
                  </span>
                  <span className="text-xs text-stone-500">{d.hint}</span>
                  <code className="font-mono text-[11px] leading-relaxed break-all text-stone-700">{file}</code>
                </a>
              );
            })}
          </div>
          <p className="text-[13px] text-stone-600">
            Downloading a report never marks entries as invoiced.{" "}
            <Link href={`/entries?${entriesLink}`} className="font-medium text-accent hover:text-accent-hover">
              Mark this period&apos;s entries as invoiced
            </Link>{" "}
            when you send the bill.
          </p>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-stone-500">{label}</span>
      <span className={accent ? "text-xl font-bold text-accent" : "text-xl font-semibold"}>{value}</span>
    </div>
  );
}
