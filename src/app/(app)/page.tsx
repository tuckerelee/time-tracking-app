import Link from "next/link";
import { Plus } from "lucide-react";
import { getSettings } from "@/server/settings";
import { listEntries, sumEntries, totalsByClient } from "@/server/entries";
import { getPickerOptions } from "@/server/projects";
import { formatCents } from "@/lib/money";
import { formatDuration, formatTimeSpan } from "@/lib/duration";
import { formatDate, formatDateShort, presetRange, todayIn } from "@/lib/dates";
import { ButtonLink, Card, CardHeader, EmptyState, Stat } from "@/components/ui";

export default function DashboardPage() {
  const s = getSettings();
  const today = todayIn(s.timezone);
  const month = presetRange("thisMonth", today);
  const todaySum = sumEntries({ from: today, to: today });
  const monthSum = sumEntries(month);
  const uninvoiced = sumEntries({ status: "uninvoiced" });
  const byClient = totalsByClient(month);
  const recent = listEntries({ limit: 8 });
  const monthName = formatDate(today).split(" ")[0];
  const hasClients = getPickerOptions().length > 0;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-stone-500">{formatDate(today, s.dateFormat)}</span>
          <h1 className="text-[26px] font-semibold tracking-tight">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/clients?new=1">New client</ButtonLink>
          <ButtonLink href="/projects?new=1">New project</ButtonLink>
          <ButtonLink href="/reports">Generate report</ButtonLink>
          <ButtonLink href="/entries" variant="primary">
            <Plus size={15} aria-hidden /> Add time
          </ButtonLink>
        </div>
      </header>

      {!hasClients ? (
        <Card className="p-5 text-sm text-stone-700">
          Welcome. Start by <Link href="/clients?new=1" className="font-medium text-accent underline-offset-2 hover:underline">adding a client</Link>, then a
          project, and you can log time. Your default rate and business details are in{" "}
          <Link href="/settings" className="font-medium text-accent underline-offset-2 hover:underline">Settings</Link>.
        </Card>
      ) : null}

      <section aria-label="Summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today" value={formatDuration(todaySum.minutes)} sub={`${formatCents(todaySum.cents)} billable`} />
        <Stat label={`Hours in ${monthName}`} value={formatDuration(monthSum.minutes)} sub={`${monthSum.count} ${monthSum.count === 1 ? "entry" : "entries"} · ${byClient.length} ${byClient.length === 1 ? "client" : "clients"}`} />
        <Stat
          label={`Billable in ${monthName}`}
          value={formatCents(monthSum.cents)}
          sub={monthSum.minutes ? `Avg. ${formatCents(Math.round((monthSum.cents * 60) / monthSum.minutes))} / hr` : "No time yet"}
        />
        <Stat
          tone="accent"
          label="Uninvoiced"
          value={formatCents(uninvoiced.cents)}
          sub={`${uninvoiced.count} ${uninvoiced.count === 1 ? "entry" : "entries"} · ${formatDuration(uninvoiced.minutes)}`}
        />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <Card aria-labelledby="recent-h" className="min-w-0 flex-[2_1_560px]">
          <CardHeader
            id="recent-h"
            title="Recent entries"
            action={
              <Link href="/entries" className="text-[13px] font-medium text-accent hover:text-accent-hover">
                View all
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title="No time logged yet." />
          ) : (
            <ul>
              {recent.map((e) => {
                const span = formatTimeSpan(e.startTime, e.endTime, s.timeFormat);
                return (
                  <li key={e.id} className="flex items-start gap-4 border-t border-stone-100 px-5 py-3 text-[13px] first:border-t-0 hover:bg-stone-50">
                    <span className="w-12 shrink-0 text-stone-600">{formatDateShort(e.date, s.dateFormat)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.description}</span>
                      <span className="mt-0.5 block truncate text-stone-500">
                        {e.clientName} · {e.projectName}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span>{formatDuration(e.minutes)}</span>
                      {span ? <span className="text-xs text-stone-500">{span}</span> : null}
                    </span>
                    <span className="w-20 shrink-0 text-right font-medium">{formatCents(e.amountCents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="month-h" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 px-5 pt-4 pb-5">
          <div className="flex items-baseline justify-between">
            <h2 id="month-h" className="text-[15px] font-semibold">
              {monthName} by client
            </h2>
            <span className="text-xs text-stone-500">{formatDuration(monthSum.minutes)}</span>
          </div>
          {byClient.length === 0 ? <p className="text-[13px] text-stone-500">Nothing tracked this month yet.</p> : null}
          {byClient.map((c) => (
            <Link key={c.clientId} href={`/clients/${c.clientId}`} className="group flex flex-col gap-1.5">
              <span className="flex justify-between text-[13px]">
                <span className="font-medium group-hover:text-accent">{c.clientName}</span>
                <span>{formatCents(c.cents)}</span>
              </span>
              <span className="h-1.5 rounded-full bg-stone-100">
                <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${monthSum.minutes ? Math.max(2, (c.minutes / monthSum.minutes) * 100) : 0}%` }} />
              </span>
              <span className="text-xs text-stone-500">
                {formatDuration(c.minutes)} · {c.projectCount} {c.projectCount === 1 ? "project" : "projects"}
              </span>
            </Link>
          ))}
          {byClient.length > 0 ? (
            <ButtonLink href="/reports?preset=thisMonth" className="mt-1">
              Create {monthName} report
            </ButtonLink>
          ) : null}
        </Card>
      </div>
    </>
  );
}
