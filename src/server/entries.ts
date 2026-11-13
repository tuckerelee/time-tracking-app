import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { clients, projects, timeEntries, type TimeEntry } from "@/db/schema";
import { billableCents } from "@/lib/money";
import { effectiveRate } from "@/lib/rates";
import type { BillingStatus, ReportEntry } from "@/lib/report";
import { todayIn } from "@/lib/dates";
import { getSettings } from "./settings";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type EntryInput = {
  date: string;
  projectId: number;
  description: string;
  minutes: number;
  /**
   * Hourly rate for this entry in cents. Omit (or null) to use the project's
   * current effective rate on create, or to keep the entry's saved rate on update.
   */
  rateCents?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  source?: "manual" | "timer";
};

async function currentRate(db: DB | Tx, projectId: number): Promise<number> {
  const row = await db
    .select({ clientRate: clients.rateCents, projectRate: projects.rateCents })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId))
    .get();
  if (!row) throw new Error("Project not found");
  return effectiveRate(row.clientRate, row.projectRate).rateCents;
}

export async function createEntry(input: EntryInput, conn?: DB | Tx): Promise<TimeEntry> {
  const db = conn ?? (await getDb());
  const rateCents = input.rateCents ?? (await currentRate(db, input.projectId));
  return db
    .insert(timeEntries)
    .values({
      date: input.date,
      projectId: input.projectId,
      description: input.description.trim(),
      minutes: input.minutes,
      rateCents,
      amountCents: billableCents(input.minutes, rateCents),
      startTime: input.startTime || null,
      endTime: input.endTime || null,
      source: input.source ?? "manual",
    })
    .returning()
    .get();
}

/**
 * Update an entry. The saved rate is kept unless a new rate is given or the
 * entry moves to a different project (then that project's current rate applies).
 * The amount is always recomputed from the entry's own minutes and rate.
 */
export async function updateEntry(id: number, input: Partial<EntryInput>): Promise<TimeEntry> {
  const db = await getDb();
  const existing = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!existing) throw new Error("Entry not found");
  const projectId = input.projectId ?? existing.projectId;
  const rateCents = input.rateCents ?? (projectId !== existing.projectId ? await currentRate(db, projectId) : existing.rateCents);
  const minutes = input.minutes ?? existing.minutes;
  return db
    .update(timeEntries)
    .set({
      date: input.date ?? existing.date,
      projectId,
      description: (input.description ?? existing.description).trim(),
      minutes,
      rateCents,
      amountCents: billableCents(minutes, rateCents),
      startTime: input.startTime !== undefined ? input.startTime || null : existing.startTime,
      endTime: input.endTime !== undefined ? input.endTime || null : existing.endTime,
    })
    .where(eq(timeEntries.id, id))
    .returning()
    .get();
}

/** Copy an entry to a new date (default today) as new, uninvoiced work at the project's current rate. */
export async function duplicateEntry(id: number, date?: string): Promise<TimeEntry> {
  const db = await getDb();
  const e = await db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!e) throw new Error("Entry not found");
  return createEntry({
    date: date ?? todayIn((await getSettings()).timezone),
    projectId: e.projectId,
    description: e.description,
    minutes: e.minutes,
  });
}

export async function deleteEntries(ids: number[]) {
  if (ids.length) await (await getDb()).delete(timeEntries).where(inArray(timeEntries.id, ids)).run();
}

/** Mark entries invoiced (with an optional reference) or back to uninvoiced. Returns the number changed. */
export async function setBillingStatus(ids: number[], status: BillingStatus, invoiceRef?: string | null): Promise<number> {
  if (!ids.length) return 0;
  const set =
    status === "invoiced"
      ? { status, ...(invoiceRef?.trim() ? { invoiceRef: invoiceRef.trim() } : {}) }
      : { status, invoiceRef: null };
  const r = await (await getDb()).update(timeEntries).set(set).where(inArray(timeEntries.id, ids)).run();
  return r.rowsAffected;
}

export type EntryFilters = {
  clientId?: number | null;
  projectId?: number | null;
  from?: string | null;
  to?: string | null;
  status?: BillingStatus | "all" | null;
  search?: string | null;
  id?: number;
  limit?: number;
};

export type EntryRow = ReportEntry & { source: "manual" | "timer"; createdAt: number };

function filterConds(f: EntryFilters) {
  const conds = [];
  if (f.id) conds.push(eq(timeEntries.id, f.id));
  if (f.clientId) conds.push(eq(projects.clientId, f.clientId));
  if (f.projectId) conds.push(eq(timeEntries.projectId, f.projectId));
  if (f.from) conds.push(gte(timeEntries.date, f.from));
  if (f.to) conds.push(lte(timeEntries.date, f.to));
  if (f.status && f.status !== "all") conds.push(eq(timeEntries.status, f.status));
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    conds.push(or(like(timeEntries.description, q), like(projects.name, q), like(clients.name, q)));
  }
  return conds.length ? and(...conds) : undefined;
}

/** Entries matching the filters, newest first. Date bounds are inclusive. */
export async function listEntries(f: EntryFilters = {}): Promise<EntryRow[]> {
  const q = (await getDb())
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      clientId: clients.id,
      clientName: clients.name,
      projectId: projects.id,
      projectName: projects.name,
      description: timeEntries.description,
      minutes: timeEntries.minutes,
      rateCents: timeEntries.rateCents,
      amountCents: timeEntries.amountCents,
      status: timeEntries.status,
      invoiceRef: timeEntries.invoiceRef,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      source: timeEntries.source,
      createdAt: timeEntries.createdAt,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(filterConds(f))
    .orderBy(desc(timeEntries.date), sql`${timeEntries.startTime} IS NULL`, desc(timeEntries.startTime), desc(timeEntries.id));
  return f.limit ? q.limit(f.limit).all() : q.all();
}

export async function getEntry(id: number): Promise<EntryRow | undefined> {
  return (await listEntries({ id, limit: 1 }))[0];
}

export async function sumEntries(f: EntryFilters = {}) {
  return (await (await getDb())
    .select({
      count: sql<number>`count(*)`,
      minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
      cents: sql<number>`coalesce(sum(${timeEntries.amountCents}), 0)`,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(filterConds(f))
    .get())!;
}

/** Per-client totals for a filter (dashboard breakdown). */
export async function totalsByClient(f: EntryFilters = {}) {
  return (await getDb())
    .select({
      clientId: clients.id,
      clientName: clients.name,
      projectCount: sql<number>`count(DISTINCT ${projects.id})`,
      minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
      cents: sql<number>`coalesce(sum(${timeEntries.amountCents}), 0)`,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(filterConds(f))
    .groupBy(clients.id)
    .orderBy(sql`sum(${timeEntries.amountCents}) DESC`)
    .all();
}
