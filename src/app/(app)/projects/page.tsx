import Link from "next/link";
import { Suspense } from "react";
import { listProjects } from "@/server/projects";
import { listClients } from "@/server/clients";
import { formatCents } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { Card, EmptyState, PageHeader, Pill, TableWrap, td, th } from "@/components/ui";
import { NewProjectButton } from "@/components/record-forms";
import { ClientFilter, ListControls } from "@/components/search-box";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const clientId = sp.client && /^\d+$/.test(sp.client) ? Number(sp.client) : undefined;
  const rows = listProjects({ clientId, includeArchived: sp.archived === "1", search: sp.q });
  const activeClients = listClients().map((c) => ({ id: c.id, name: c.name, rateCents: c.rateCents }));
  const allClients = listClients({ includeArchived: true });
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${rows.filter((p) => !p.archived).length} active`}
        actions={<NewProjectButton clients={activeClients} defaultClientId={clientId} defaultOpen={sp.new === "1"} />}
      />
      <Suspense>
        <ListControls placeholder="Search projects">
          <ClientFilter clients={allClients} />
        </ListControls>
      </Suspense>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={sp.q || clientId ? "No projects match these filters." : "No projects yet."} />
        ) : (
          <TableWrap minWidth={820}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={th}>Project</th>
                  <th className={th}>Client</th>
                  <th className={th}>Effective rate</th>
                  <th className={`${th} text-right`}>Tracked</th>
                  <th className={`${th} text-right`}>Billable</th>
                  <th className={`${th} text-right`}>Uninvoiced</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className={td}>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">
                        {p.name}
                      </Link>
                    </td>
                    <td className={td}>
                      <Link href={`/clients/${p.clientId}`} className="text-stone-600 hover:text-accent">
                        {p.clientName}
                      </Link>
                    </td>
                    <td className={td}>
                      {formatCents(p.effectiveRateCents)} {p.rateSource === "project" ? <Pill tone="accent">Override</Pill> : null}
                    </td>
                    <td className={`${td} text-right`}>{formatDuration(p.totalMinutes)}</td>
                    <td className={`${td} text-right`}>{formatCents(p.totalCents)}</td>
                    <td className={`${td} text-right font-semibold`}>{formatCents(p.uninvoicedCents)}</td>
                    <td className={td}>{p.archived || p.clientArchived ? <Pill>Archived</Pill> : <span className="text-stone-600">Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
