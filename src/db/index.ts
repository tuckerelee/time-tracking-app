import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

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

/** Process-wide connection (survives dev hot reloads). */
export function getDb(): DB {
  if (!globalForDb.__db) {
    globalForDb.__db = openDb(process.env.DATABASE_PATH || "./data/app.db");
  }
  return globalForDb.__db;
}

/** Tests only: swap the process-wide connection. */
export function setDbForTesting(db: DB) {
  globalForDb.__db = db;
}
