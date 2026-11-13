/**
 * Load development sample data.
 *
 *   npm run db:seed            # only if the database has no clients yet
 *   npm run db:seed -- --reset # wipe all clients, projects and entries first
 */
import { getDb } from "../src/db";
import { clientCount, loadSampleData, wipeData } from "../src/server/sample-data";

async function main() {
  const db = await getDb();
  const reset = process.argv.includes("--reset");
  const existing = await clientCount(db);
  if (existing > 0 && !reset) {
    console.log(`Database already has ${existing} clients. Run with --reset to replace everything with sample data.`);
    return;
  }
  if (reset) await wipeData(db);
  const { entries } = await loadSampleData();
  console.log(`Seeded 4 clients, 7 projects and ${entries} entries.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
