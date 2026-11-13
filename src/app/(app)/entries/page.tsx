import { Suspense } from "react";
import { getSettings } from "@/server/settings";
import { listEntries, sumEntries, type EntryFilters } from "@/server/entries";
import { getPickerOptions } from "@/server/projects";
import { listClients } from "@/server/clients";
import { isIsoDate, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { Card, PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/entry-form";
import { EntriesList } from "@/components/entries-list";
import { EntryFilterBar } from "@/components/filter-bar";

export const metadata = { title: "Time entries" };

const LIMIT = 500;

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const today = todayIn(s.timezone);
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const filters: EntryFilters = {
    clientId: num(sp.client),
    projectId: num(sp.project),
    from: isIsoDate(sp.from) ? sp.from : null,
    to: isIsoDate(sp.to) ? sp.to : null,
    status: sp.status === "uninvoiced" || sp.status === "invoiced" ? sp.status : "all",
    search: sp.q ?? null,
  };
  const entries = await listEntries({ ...filters, limit: LIMIT });
  const total = await sumEntries(filters);
  const pickers = await getPickerOptions();
  // Filters include archived clients so their history stays reachable.
  const allClients = (await listClients({ includeArchived: true })).map((c) => ({
    id: c.id,
    name: c.archived ? `${c.name} (archived)` : c.name,
    projects: pickers.find((p) => p.id === c.id)?.projects ?? [],
  }));

  return (
    <>
      <PageHeader
        title="Time entries"
        subtitle={`${total.count} ${total.count === 1 ? "entry" : "entries"} · ${formatDuration(total.minutes)} · ${formatCents(total.cents)}`}
      />
      <Card className="p-5 shadow-[0_1px_2px_rgb(28_25_23/0.04)]">
        <EntryForm
          clients={pickers}
          today={today}
          timeFormat={s.timeFormat}
          defaultClientId={filters.clientId}
          defaultProjectId={filters.projectId}
        />
      </Card>
      <Suspense>
        <EntryFilterBar clients={allClients} />
      </Suspense>
      <EntriesList entries={entries} clients={pickers} today={today} timeFormat={s.timeFormat} />
      {total.count > LIMIT ? (
        <p className="text-[13px] text-stone-500">Showing the newest {LIMIT} of {total.count} entries. Narrow the dates to see older ones.</p>
      ) : null}
    </>
  );
}
