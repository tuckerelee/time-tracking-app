import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, projects, timeEntries, type Project } from "@/db/schema";
import { effectiveRate, type RateSource } from "@/lib/rates";

export type ProjectWithStats = Project & {
  clientName: string;
  clientRateCents: number;
  clientArchived: boolean;
  effectiveRateCents: number;
  rateSource: RateSource;
  totalMinutes: number;
  totalCents: number;
  uninvoicedCents: number;
  uninvoicedMinutes: number;
};

const fields = {
  id: projects.id,
  clientId: projects.clientId,
  name: projects.name,
  description: projects.description,
  rateCents: projects.rateCents,
  archived: projects.archived,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  clientName: clients.name,
  clientRateCents: clients.rateCents,
  clientArchived: clients.archived,
  totalMinutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
  totalCents: sql<number>`coalesce(sum(${timeEntries.amountCents}), 0)`,
  uninvoicedCents: sql<number>`coalesce(sum(CASE WHEN ${timeEntries.status} = 'uninvoiced' THEN ${timeEntries.amountCents} END), 0)`,
  uninvoicedMinutes: sql<number>`coalesce(sum(CASE WHEN ${timeEntries.status} = 'uninvoiced' THEN ${timeEntries.minutes} END), 0)`,
};

function withRate<T extends { rateCents: number | null; clientRateCents: number }>(row: T) {
  const r = effectiveRate(row.clientRateCents, row.rateCents);
  return { ...row, effectiveRateCents: r.rateCents, rateSource: r.source };
}

export function listProjects(opts: { clientId?: number; includeArchived?: boolean; search?: string } = {}): ProjectWithStats[] {
  const conds = [];
  if (opts.clientId) conds.push(eq(projects.clientId, opts.clientId));
  if (!opts.includeArchived) conds.push(eq(projects.archived, false), eq(clients.archived, false));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(like(projects.name, q), like(clients.name, q)));
  }
  return getDb()
    .select(fields)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(projects.id)
    .orderBy(asc(projects.archived), sql`${clients.name} COLLATE NOCASE`, sql`${projects.name} COLLATE NOCASE`)
    .all()
    .map(withRate);
}

export function getProject(id: number): ProjectWithStats | undefined {
  const row = getDb()
    .select(fields)
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .where(eq(projects.id, id))
    .groupBy(projects.id)
    .get();
  return row ? withRate(row) : undefined;
}

/** Active clients and their active projects, with effective rates — for pickers. */
export function getPickerOptions() {
  const rows = getDb()
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientRateCents: clients.rateCents,
      projectId: projects.id,
      projectName: projects.name,
      projectRateCents: projects.rateCents,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.archived, false), eq(clients.archived, false)))
    .orderBy(sql`${clients.name} COLLATE NOCASE`, sql`${projects.name} COLLATE NOCASE`)
    .all();
  const out: PickerClient[] = [];
  for (const r of rows) {
    let c = out.find((x) => x.id === r.clientId);
    if (!c) out.push((c = { id: r.clientId, name: r.clientName, rateCents: r.clientRateCents, projects: [] }));
    const eff = effectiveRate(r.clientRateCents, r.projectRateCents);
    c.projects.push({ id: r.projectId, name: r.projectName, rateCents: eff.rateCents, rateSource: eff.source });
  }
  return out;
}

export type PickerClient = {
  id: number;
  name: string;
  rateCents: number;
  projects: { id: number; name: string; rateCents: number; rateSource: RateSource }[];
};

export type ProjectInput = {
  clientId: number;
  name: string;
  description?: string | null;
  /** null = inherit the client's rate. */
  rateCents?: number | null;
};

export function createProject(input: ProjectInput): Project {
  return getDb()
    .insert(projects)
    .values({ ...input, name: input.name.trim(), rateCents: input.rateCents ?? null })
    .returning()
    .get();
}

/** Changing the override only affects entries saved afterwards. */
export function updateProject(id: number, input: Partial<ProjectInput>): Project {
  const row = getDb()
    .update(projects)
    .set({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) })
    .where(eq(projects.id, id))
    .returning()
    .get();
  if (!row) throw new Error("Project not found");
  return row;
}

export function setProjectArchived(id: number, archived: boolean) {
  getDb().update(projects).set({ archived }).where(eq(projects.id, id)).run();
}

export function deleteProject(id: number) {
  const db = getDb();
  db.transaction((tx) => {
    const used = tx.select({ n: sql<number>`count(*)` }).from(timeEntries).where(eq(timeEntries.projectId, id)).get();
    if (used && used.n > 0) throw new Error("This project has time entries. Archive it instead so its history is kept.");
    tx.delete(projects).where(eq(projects.id, id)).run();
  });
}
