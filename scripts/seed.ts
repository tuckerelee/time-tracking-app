/**
 * Development sample data: clients with different rates, projects with and
 * without overrides, and entries across two months (some with exact times,
 * some invoiced).
 *
 *   npm run db:seed            # only if the database has no clients yet
 *   npm run db:seed -- --reset # wipe all data first (asks no questions!)
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { createClient, setClientArchived } from "../src/server/clients";
import { createProject, setProjectArchived } from "../src/server/projects";
import { createEntry, setBillingStatus } from "../src/server/entries";
import { getSettings, updateSettings } from "../src/server/settings";
import { clients } from "../src/db/schema";
import { addDays, presetRange, todayIn } from "../src/lib/dates";
import { minutesBetween, parseTimeOfDay } from "../src/lib/duration";

const db = getDb();
const reset = process.argv.includes("--reset");
const existing = db.select({ n: sql<number>`count(*)` }).from(clients).get()!.n;

if (existing > 0 && !reset) {
  console.log(`Database already has ${existing} clients. Run with --reset to replace everything with sample data.`);
  process.exit(0);
}
if (reset) {
  db.run(sql`DELETE FROM active_timer`);
  db.run(sql`DELETE FROM time_entries`);
  db.run(sql`DELETE FROM projects`);
  db.run(sql`DELETE FROM clients`);
}

if (!getSettings().businessName) updateSettings({ businessName: "Tucker E. Lee" });
updateSettings({ defaultRateCents: 7500 });

const acme = createClient({ name: "Acme Company", company: "Acme Company LLC", email: "billing@acme.example", phone: "(555) 010-2244", notes: "Send reports to billing on the 1st. Net 15.", rateCents: 8500 });
const harbor = createClient({ name: "Harbor & Pine Law", email: "office@harborpine.example", rateCents: 9500 });
const north = createClient({ name: "Northwind Bakery", email: "orders@northwind.example" }); // global default, $75
const old = createClient({ name: "Riverside Dental", rateCents: 8000 });

const wm = createProject({ clientId: acme.id, name: "Website Maintenance", description: "Monthly updates, backups and small fixes." });
const br = createProject({ clientId: acme.id, name: "Brand Refresh", description: "Logo and identity update.", rateCents: 11000 });
const holiday = createProject({ clientId: acme.id, name: "Holiday Landing Page" });
const intake = createProject({ clientId: harbor.id, name: "Client Intake Form" });
const hosting = createProject({ clientId: harbor.id, name: "Hosting & Support", rateCents: 6500 });
const order = createProject({ clientId: north.id, name: "Online Ordering" });
const site = createProject({ clientId: old.id, name: "Website Rebuild" });

const today = todayIn(getSettings().timezone);
const thisMonth = presetRange("thisMonth", today);
const lastMonth = presetRange("lastMonth", today);

type Seed = [dayOffsetFromMonthStart: number, projectId: number, description: string, start: string | null, end: string | null, minutes?: number];
function add(monthStart: string, rows: Seed[]) {
  return rows
    .map(([offset, projectId, description, start, end, minutes]) => {
      const date = addDays(monthStart, offset);
      if (date > today) return null;
      const m = minutes ?? minutesBetween(parseTimeOfDay(start!)!, parseTimeOfDay(end!)!);
      return createEntry({ date, projectId, description, minutes: m, startTime: start, endTime: end });
    })
    .filter((e) => e !== null);
}

const last = add(lastMonth.from, [
  [1, site.id, "Final content migration and redirects", "09:00", "12:30"],
  [2, wm.id, "WordPress core and plugin updates", "08:30", "09:15"],
  [5, intake.id, "Discovery call and intake requirements", "10:00", "11:00"],
  [7, intake.id, "Wireframed intake form steps", "13:00", "15:30"],
  [8, order.id, "Menu data import from spreadsheet", null, null, 95],
  [12, hosting.id, "SSL renewal and DNS cleanup", "16:00", "16:40"],
  [14, wm.id, "Fixed contact form spam filter", "11:15", "12:00"],
  [19, order.id, "Pickup time slot logic", "09:30", "12:00"],
  [21, intake.id, "Built step one of intake form", "13:30", "16:45"],
  [26, wm.id, "Monthly backup verification", null, null, 30],
]);
setBillingStatus(last.map((e) => e.id), "invoiced", "Oct statement");

const cur = add(thisMonth.from, [
  [1, br.id, "Client kickoff and mood board", "09:00", "10:45"],
  [2, order.id, "Menu photo optimization", null, null, 80],
  [3, wm.id, "Plugin updates and backup verification", "08:40", "09:30"],
  [4, intake.id, "Built conditional intake form fields", "13:00", "16:00"],
  [5, br.id, "Logo exploration, round two — three directions", "10:00", "12:15"],
  [8, order.id, "Fixed checkout tax line display", "09:15", "10:00"],
  [8, wm.id, "Updated homepage layout and repaired mobile navigation", "13:30", "15:00"],
  [10, hosting.id, "Email deliverability check", "14:00", "14:30"],
]);
const invoiced = cur.filter((e) => e.description === "Client kickoff and mood board" || e.description === "Menu photo optimization");
setBillingStatus(invoiced.map((e) => e.id), "invoiced", "INV-1042");

setProjectArchived(holiday.id, true);
setClientArchived(old.id, true);

console.log(`Seeded 4 clients, 7 projects and ${last.length + cur.length} entries.`);
