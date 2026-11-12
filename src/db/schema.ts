import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()).$onUpdateFn(() => Date.now()),
};

export const clients = sqliteTable(
  "clients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /** Default hourly rate for this client's projects, in cents. */
    rateCents: integer("rate_cents").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check("clients_rate_nonneg", sql`${t.rateCents} >= 0`),
    check("clients_name_nonempty", sql`length(trim(${t.name})) > 0`),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Optional override in cents; null means "use the client's rate". */
    rateCents: integer("rate_cents"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("projects_client_idx").on(t.clientId),
    uniqueIndex("projects_client_name_uq").on(t.clientId, t.name),
    check("projects_rate_nonneg", sql`${t.rateCents} IS NULL OR ${t.rateCents} >= 0`),
    check("projects_name_nonempty", sql`length(trim(${t.name})) > 0`),
  ],
);

export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Calendar date of the work, "YYYY-MM-DD", in the configured timezone. */
    date: text("date").notNull(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    minutes: integer("minutes").notNull(),
    /** Effective hourly rate captured when the entry was saved, in cents. */
    rateCents: integer("rate_cents").notNull(),
    /** minutes / 60 × rate, rounded half-up to the cent, computed on save. */
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["uninvoiced", "invoiced"] }).notNull().default("uninvoiced"),
    invoiceRef: text("invoice_ref"),
    source: text("source", { enum: ["manual", "timer"] }).notNull().default("manual"),
    /** Optional local start/end time "HH:MM" (24-hour). */
    startTime: text("start_time"),
    endTime: text("end_time"),
    ...timestamps,
  },
  (t) => [
    index("entries_date_idx").on(t.date),
    index("entries_project_idx").on(t.projectId),
    check("entries_date_format", sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
    check("entries_minutes_pos", sql`${t.minutes} > 0 AND ${t.minutes} <= 1440`),
    check("entries_rate_nonneg", sql`${t.rateCents} >= 0`),
    check("entries_amount_nonneg", sql`${t.amountCents} >= 0`),
    check("entries_status", sql`${t.status} IN ('uninvoiced','invoiced')`),
    check("entries_source", sql`${t.source} IN ('manual','timer')`),
    check("entries_start_fmt", sql`${t.startTime} IS NULL OR ${t.startTime} GLOB '[0-2][0-9]:[0-5][0-9]'`),
    check("entries_end_fmt", sql`${t.endTime} IS NULL OR ${t.endTime} GLOB '[0-2][0-9]:[0-5][0-9]'`),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    id: integer("id").primaryKey(),
    businessName: text("business_name").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    website: text("website").notNull().default(""),
    reportFooter: text("report_footer").notNull().default("Thank you for your business."),
    filenameSuffix: text("filename_suffix").notNull().default("Lee"),
    defaultRateCents: integer("default_rate_cents").notNull().default(7500),
    timezone: text("timezone").notNull().default("America/Chicago"),
    dateFormat: text("date_format", { enum: ["medium", "us"] }).notNull().default("medium"),
    timeFormat: text("time_format", { enum: ["12short", "12", "24"] }).notNull().default("12short"),
    showTimesOnReports: integer("show_times_on_reports", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at", { mode: "number" }).notNull().$defaultFn(() => Date.now()).$onUpdateFn(() => Date.now()),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`), check("settings_rate_nonneg", sql`${t.defaultRateCents} >= 0`)],
);

/** At most one running/paused timer (row id is always 1). Times are server epoch ms. */
export const activeTimer = sqliteTable(
  "active_timer",
  {
    id: integer("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    /** When the timer was first started. */
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    /** Time accumulated in completed running segments, in ms. */
    accumulatedMs: integer("accumulated_ms", { mode: "number" }).notNull().default(0),
    /** Start of the current running segment; null while paused. */
    runningSince: integer("running_since", { mode: "number" }),
    /** Whether the timer was ever paused (then exact start/end times aren't recorded). */
    wasPaused: integer("was_paused", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [check("timer_singleton", sql`${t.id} = 1`)],
);

export type Client = typeof clients.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type ActiveTimer = typeof activeTimer.$inferSelect;
