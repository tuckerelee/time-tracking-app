import Link from "next/link";
import { Suspense } from "react";
import { listClients } from "@/server/clients";
import { getSettings } from "@/server/settings";
import { formatCents } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { Card, EmptyState, PageHeader, Pill, TableWrap, td, th } from "@/components/ui";
import { NewClientButton } from "@/components/record-forms";
import { ListControls } from "@/components/search-box";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = getSettings();
  const rows = listClients({ includeArchived: sp.archived === "1", search: sp.q });
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.filter((c) => !c.archived).length} active`}
        actions={<NewClientButton defaultRateCents={s.defaultRateCents} defaultOpen={sp.new === "1"} />}
      />
      <Suspense>
        <ListControls placeholder="Search clients" />
      </Suspense>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={sp.q ? "No clients match that search." : "No clients yet."}>{sp.q ? null : "Add your first client to start tracking time."}</EmptyState>
        ) : (
          <TableWrap minWidth={760}>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={th}>Client</th>
                  <th className={`${th} text-right`}>Rate</th>
                  <th className={`${th} text-right`}>Active projects</th>
                  <th className={`${th} text-right`}>Tracked</th>
                  <th className={`${th} text-right`}>Billable</th>
                  <th className={`${th} text-right`}>Uninvoiced</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className={td}>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-accent">
                        {c.name}
                      </Link>
                      {c.archived ? (
                        <span className="ml-2">
                          <Pill>Archived</Pill>
                        </span>
                      ) : null}
                      {c.company && c.company !== c.name ? <div className="mt-0.5 text-stone-500">{c.company}</div> : null}
                    </td>
                    <td className={`${td} text-right`}>{formatCents(c.rateCents)}/hr</td>
                    <td className={`${td} text-right`}>{c.activeProjects}</td>
                    <td className={`${td} text-right`}>{formatDuration(c.totalMinutes)}</td>
                    <td className={`${td} text-right`}>{formatCents(c.totalCents)}</td>
                    <td className={`${td} text-right font-semibold`}>{formatCents(c.uninvoicedCents)}</td>
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
