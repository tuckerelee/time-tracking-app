import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { clients, projects, timeEntries, type TimeEntry } from "@/db/schema";
import { billableCents } from "@/lib/money";
import { effectiveRate } from "@/lib/rates";
import type { BillingStatus, ReportEntry } from "@/lib/report";
import { getSettings } from "./settings";
import { todayIn } from "@/lib/dates";

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

function currentRate(db: DB | Tx, projectId: number): number {
  const row = db
    .select({ clientRate: clients.rateCents, projectRate: projects.rateCents })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId))
    .get();
  if (!row) throw new Error("Project not found");
  return effectiveRate(row.clientRate, row.projectRate).rateCents;
}

export function createEntry(input: EntryInput, db: DB | Tx = getDb()): TimeEntry {
  const rateCents = input.rateCents ?? currentRate(db, input.projectId);
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
export function updateEntry(id: number, input: Partial<EntryInput>): TimeEntry {
  const db = getDb();
  const existing = db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!existing) throw new Error("Entry not found");
  const projectId = input.projectId ?? existing.projectId;
  const rateCents =
    input.rateCents ?? (projectId !== existing.projectId ? currentRate(db, projectId) : existing.rateCents);
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
export function duplicateEntry(id: number, date?: string): TimeEntry {
  const db = getDb();
  const e = db.select().from(timeEntries).where(eq(timeEntries.id, id)).get();
  if (!e) throw new Error("Entry not found");
  return createEntry({
    date: date ?? todayIn(getSettings().timezone),
    projectId: e.projectId,
    description: e.description,
    minutes: e.minutes,
  });
}

export function deleteEntry(id: number) {
  getDb().delete(timeEntries).where(eq(timeEntries.id, id)).run();
}

export function deleteEntries(ids: number[]) {
  if (ids.length) getDb().delete(timeEntries).where(inArray(timeEntries.id, ids)).run();
}

/** Mark entries invoiced (with an optional reference) or back to uninvoiced. */
export function setBillingStatus(ids: number[], status: BillingStatus, invoiceRef?: string | null): number {
  if (!ids.length) return 0;
  const set =
    status === "invoiced"
      ? { status, ...(invoiceRef?.trim() ? { invoiceRef: invoiceRef.trim() } : {}) }
      : { status, invoiceRef: null };
  return getDb().update(timeEntries).set(set).where(inArray(timeEntries.id, ids)).run().changes;
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
export function listEntries(f: EntryFilters = {}): EntryRow[] {
  const q = getDb()
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

export function getEntry(id: number): EntryRow | undefined {
  return listEntries({ id, limit: 1 })[0];
}

export function sumEntries(f: EntryFilters = {}) {
  return getDb()
    .select({
      count: sql<number>`count(*)`,
      minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
      cents: sql<number>`coalesce(sum(${timeEntries.amountCents}), 0)`,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(filterConds(f))
    .get()!;
}

/** Per-client totals for a filter (dashboard breakdown). */
export function totalsByClient(f: EntryFilters = {}) {
  return getDb()
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
