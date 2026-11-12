import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getClient } from "@/server/clients";
import { listProjects, getPickerOptions } from "@/server/projects";
import { listEntries } from "@/server/entries";
import { getSettings } from "@/server/settings";
import { formatCents } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { formatDate, todayIn } from "@/lib/dates";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Pill, Stat, TableWrap, td, th } from "@/components/ui";
import { ArchiveControls, EditClientButton, NewProjectButton } from "@/components/record-forms";
import { EntriesList } from "@/components/entries-list";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = /^\d+$/.test(id) ? getClient(Number(id)) : undefined;
  if (!client) notFound();
  const s = getSettings();
  const projects = listProjects({ clientId: client.id, includeArchived: true });
  const recent = listEntries({ clientId: client.id, limit: 10 });
  const pickers = getPickerOptions();

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/clients" className="hover:text-stone-900">
              Clients
            </Link>{" "}
            / {client.name}
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {client.name}
            {client.archived ? <Pill>Archived</Pill> : null}
          </span>
        }
        subtitle={`Client since ${formatDate(todayIn(s.timezone, client.createdAt), s.dateFormat)} · ${client.activeProjects} active ${client.activeProjects === 1 ? "project" : "projects"}`}
        actions={
          <>
            <NewProjectButton clients={[{ id: client.id, name: client.name, rateCents: client.rateCents }]} defaultClientId={client.id} variant="secondary" navigate={false} />
            <ButtonLink href={`/reports?client=${client.id}`}>Generate report</ButtonLink>
            <ButtonLink href={`/entries?client=${client.id}`} variant="primary">
              <Plus size={15} aria-hidden /> Add time
            </ButtonLink>
          </>
        }
      />

      <section aria-label="Totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total tracked" value={formatDuration(client.totalMinutes)} />
        <Stat label="Total billable" value={formatCents(client.totalCents)} />
        <Stat
          tone="accent"
          label="Uninvoiced"
          value={formatCents(client.uninvoicedCents)}
          sub={`${client.uninvoicedCount} ${client.uninvoicedCount === 1 ? "entry" : "entries"} · ${formatDuration(client.uninvoicedMinutes)}`}
        />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5">
          <Card aria-labelledby="proj-h">
            <CardHeader id="proj-h" title="Projects" />
            {projects.length === 0 ? (
              <EmptyState title="No projects yet.">Add a project to start logging time for this client.</EmptyState>
            ) : (
              <TableWrap minWidth={600}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-stone-100">
                      <th className={th}>Project</th>
                      <th className={th}>Effective rate</th>
                      <th className={`${th} text-right`}>Tracked</th>
                      <th className={`${th} text-right`}>Billable</th>
                      <th className={`${th} text-right`}>Uninvoiced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id} className={`border-t border-stone-100 hover:bg-stone-50 ${p.archived ? "text-stone-500" : ""}`}>
                        <td className={td}>
                          <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">
                            {p.name}
                          </Link>
                          {p.archived ? (
                            <span className="ml-2">
                              <Pill>Archived</Pill>
                            </span>
                          ) : null}
                        </td>
                        <td className={td}>
                          <span className="font-medium">{formatCents(p.effectiveRateCents)}</span>{" "}
                          {p.rateSource === "project" ? <Pill tone="accent">Override</Pill> : <span className="text-stone-500">· from client</span>}
                        </td>
                        <td className={`${td} text-right`}>{formatDuration(p.totalMinutes)}</td>
                        <td className={`${td} text-right`}>{formatCents(p.totalCents)}</td>
                        <td className={`${td} text-right font-semibold`}>{formatCents(p.uninvoicedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Recent time</h2>
              <Link href={`/entries?client=${client.id}`} className="text-[13px] font-medium text-accent hover:text-accent-hover">
                All {client.name} entries
              </Link>
            </div>
            <EntriesList entries={recent} clients={pickers} today={todayIn(s.timezone)} timeFormat={s.timeFormat} selectable={false} emptyText="No time logged for this client yet." />
          </div>
        </div>

        <Card aria-labelledby="info-h" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 px-5 pt-4 pb-5">
          <h2 id="info-h" className="text-[15px] font-semibold">
            Client details
          </h2>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-stone-500">Hourly rate</dt>
            <dd className="font-semibold">{formatCents(client.rateCents)}/hr</dd>
            <dt className="text-stone-500">Company</dt>
            <dd>{client.company || "—"}</dd>
            <dt className="text-stone-500">Email</dt>
            <dd className="break-all">{client.email ? <a href={`mailto:${client.email}`} className="hover:text-accent">{client.email}</a> : "—"}</dd>
            <dt className="text-stone-500">Phone</dt>
            <dd>{client.phone || "—"}</dd>
            <dt className="text-stone-500">Notes</dt>
            <dd className="leading-relaxed whitespace-pre-line text-stone-700">{client.notes || "—"}</dd>
          </dl>
          <p className="text-xs leading-relaxed text-stone-500">Rate changes apply to new entries only. Saved entries keep the rate they were logged at.</p>
          <div className="flex flex-col gap-3 border-t border-stone-100 pt-4">
            <EditClientButton client={client} />
            <ArchiveControls kind="client" id={client.id} archived={client.archived} canDelete={client.totalMinutes === 0} />
          </div>
        </Card>
      </div>
    </>
  );
}
