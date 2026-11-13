import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "./schema";
// Circular with the services it calls, but only used at call time, never at module load.
import { clientCount, loadSampleData } from "@/server/sample-data";

export type DB = BetterSQLite3Database<typeof schema>;

/** Open a database at `file` (":memory:" for tests) and apply migrations. */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

const globalForDb = globalThis as unknown as { __db?: DB };

/**
 * Demo mode (DEMO_MODE=1) is for trying the app on hosts without a permanent
 * disk, such as Vercel: the database lives in temporary storage and is filled
 * with sample data whenever it starts out empty. Data can reset at any time.
 */
export const isDemoMode = () => process.env.DEMO_MODE === "1";

/** Process-wide connection (survives dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__db) {
    const file = isDemoMode() ? path.join(os.tmpdir(), "ledger-demo.db") : process.env.DATABASE_PATH || "./data/app.db";
    globalForDb.__db = openDb(file);
    if (isDemoMode()) seedDemo(globalForDb.__db);
  }
  return globalForDb.__db;
}

function seedDemo(db: DB) {
  if (clientCount(db) === 0) loadSampleData();
}

/** Tests only: swap the process-wide connection. */
export function setDbForTesting(db: DB) {
  globalForDb.__db = db;
}
