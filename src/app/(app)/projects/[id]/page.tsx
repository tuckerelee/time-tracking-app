import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, getPickerOptions } from "@/server/projects";
import { listEntries } from "@/server/entries";
import { getSettings } from "@/server/settings";
import { formatCents } from "@/lib/money";
import { formatDuration } from "@/lib/duration";
import { todayIn } from "@/lib/dates";
import { Card, PageHeader, Pill, Stat } from "@/components/ui";
import { ArchiveControls, EditProjectButton } from "@/components/record-forms";
import { EntryForm } from "@/components/entry-form";
import { EntriesList } from "@/components/entries-list";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = /^\d+$/.test(id) ? await getProject(Number(id)) : undefined;
  if (!project) notFound();
  const s = await getSettings();
  const today = todayIn(s.timezone);
  const entries = await listEntries({ projectId: project.id });
  const pickers = await getPickerOptions();
  const active = !project.archived && !project.clientArchived;

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/projects" className="hover:text-stone-900">
              Projects
            </Link>{" "}
            /{" "}
            <Link href={`/clients/${project.clientId}`} className="hover:text-stone-900">
              {project.clientName}
            </Link>{" "}
            / {project.name}
          </>
        }
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {project.name}
            {project.archived ? <Pill>Archived</Pill> : null}
          </span>
        }
        subtitle={
          <>
            {formatCents(project.effectiveRateCents)}/hr ·{" "}
            {project.rateSource === "project" ? "project rate override" : `uses ${project.clientName}'s rate`}
          </>
        }
        actions={<EditProjectButton project={project} clients={[{ id: project.clientId, name: project.clientName, rateCents: project.clientRateCents }]} />}
      />

      {project.description ? <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line text-stone-700">{project.description}</p> : null}

      <section aria-label="Totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total time" value={formatDuration(project.totalMinutes)} />
        <Stat label="Total billable" value={formatCents(project.totalCents)} />
        <Stat tone="accent" label="Uninvoiced" value={formatCents(project.uninvoicedCents)} sub={`${formatDuration(project.uninvoicedMinutes)} uninvoiced`} />
      </section>

      {active ? (
        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Add time to this project</h2>
          <EntryForm clients={pickers} today={today} timeFormat={s.timeFormat} defaultProjectId={project.id} />
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Time entry history</h2>
        <EntriesList entries={entries} clients={pickers} today={today} timeFormat={s.timeFormat} hideProject emptyText="No time logged on this project yet." />
      </div>

      <Card className="p-5">
        <ArchiveControls kind="project" id={project.id} archived={project.archived} canDelete={project.totalMinutes === 0} />
      </Card>
    </>
  );
}
