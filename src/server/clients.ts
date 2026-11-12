import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, projects, timeEntries, type Client } from "@/db/schema";
import { getSettings } from "./settings";

export type ClientWithStats = Client & {
  activeProjects: number;
  totalMinutes: number;
  totalCents: number;
  uninvoicedCents: number;
  uninvoicedMinutes: number;
  uninvoicedCount: number;
};

const statsFields = {
  activeProjects: sql<number>`(SELECT count(*) FROM projects ap WHERE ap.client_id = ${clients.id} AND ap.archived = 0)`,
  totalMinutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)`,
  totalCents: sql<number>`coalesce(sum(${timeEntries.amountCents}), 0)`,
  uninvoicedCents: sql<number>`coalesce(sum(CASE WHEN ${timeEntries.status} = 'uninvoiced' THEN ${timeEntries.amountCents} END), 0)`,
  uninvoicedMinutes: sql<number>`coalesce(sum(CASE WHEN ${timeEntries.status} = 'uninvoiced' THEN ${timeEntries.minutes} END), 0)`,
  uninvoicedCount: sql<number>`count(CASE WHEN ${timeEntries.status} = 'uninvoiced' THEN 1 END)`,
};

export function listClients(opts: { includeArchived?: boolean; search?: string } = {}): ClientWithStats[] {
  const conds = [];
  if (!opts.includeArchived) conds.push(eq(clients.archived, false));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(like(clients.name, q), like(clients.company, q)));
  }
  return getDb()
    .select({ ...clientColumns(), ...statsFields })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(clients.id)
    .orderBy(asc(clients.archived), sql`${clients.name} COLLATE NOCASE`)
    .all();
}

export function getClient(id: number): ClientWithStats | undefined {
  return getDb()
    .select({ ...clientColumns(), ...statsFields })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .where(eq(clients.id, id))
    .groupBy(clients.id)
    .get();
}

export type ClientInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  /** Omit to use the global default rate. */
  rateCents?: number;
};

export function createClient(input: ClientInput): Client {
  const rateCents = input.rateCents ?? getSettings().defaultRateCents;
  return getDb()
    .insert(clients)
    .values({ ...input, name: input.name.trim(), rateCents })
    .returning()
    .get();
}

/**
 * Changing a client's rate only affects entries saved afterwards: every saved
 * entry keeps the rate it was logged at.
 */
export function updateClient(id: number, input: Partial<ClientInput>): Client {
  const row = getDb()
    .update(clients)
    .set({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) })
    .where(eq(clients.id, id))
    .returning()
    .get();
  if (!row) throw new Error("Client not found");
  return row;
}

export function setClientArchived(id: number, archived: boolean) {
  getDb().update(clients).set({ archived }).where(eq(clients.id, id)).run();
}

/** Only clients with no time entries can be deleted; otherwise archive them. */
export function deleteClient(id: number) {
  const db = getDb();
  db.transaction((tx) => {
    const used = tx
      .select({ n: sql<number>`count(*)` })
      .from(timeEntries)
      .innerJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(eq(projects.clientId, id))
      .get();
    if (used && used.n > 0) throw new Error("This client has time entries. Archive it instead so its history is kept.");
    tx.delete(projects).where(eq(projects.clientId, id)).run();
    tx.delete(clients).where(eq(clients.id, id)).run();
  });
}

function clientColumns() {
  return {
    id: clients.id,
    name: clients.name,
    company: clients.company,
    email: clients.email,
    phone: clients.phone,
    notes: clients.notes,
    rateCents: clients.rateCents,
    archived: clients.archived,
    createdAt: clients.createdAt,
    updatedAt: clients.updatedAt,
  };
}
