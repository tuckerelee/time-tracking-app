import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

/**
 * Where the data lives:
 *  - Turso (production): TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (the names
 *    Vercel's Turso integration sets) or DATABASE_URL / DATABASE_AUTH_TOKEN.
 *  - Local development: a SQLite file, ./data/app.db unless DATABASE_PATH says otherwise.
 */
export function databaseConfig(): { url: string; authToken?: string } {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || undefined;
  if (url) return { url, authToken };
  return { url: `file:${process.env.DATABASE_PATH || "./data/app.db"}` };
}

/** Open a database and apply any pending migrations. */
export async function openDb(url: string, authToken?: string): Promise<DB> {
  const local = url.startsWith("file:");
  if (local) fs.mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  const client = createClient({ url, authToken });
  if (local) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

const g = globalThis as unknown as { __db?: Promise<DB> };

/** Process-wide connection, opened (and migrated) once per server instance. */
export function getDb(): Promise<DB> {
  if (!g.__db) {
    const { url, authToken } = databaseConfig();
    g.__db = openDb(url, authToken).catch((e) => {
      g.__db = undefined; // let the next request retry
      throw e;
    });
  }
  return g.__db;
}

/** Tests only: swap the process-wide connection. */
export function setDbForTesting(db: DB) {
  g.__db = Promise.resolve(db);
}
