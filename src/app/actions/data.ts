"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuth } from "@/server/auth";
import * as clientsSvc from "@/server/clients";
import * as projectsSvc from "@/server/projects";
import * as entriesSvc from "@/server/entries";
import * as timerSvc from "@/server/timer";
import { updateSettings } from "@/server/settings";
import { parseMoneyToCents } from "@/lib/money";
import { isIsoDate, isValidTimeZone } from "@/lib/dates";
import { minutesBetween, parseTimeOfDay } from "@/lib/duration";
import { formatPhone } from "@/lib/phone";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function run<T>(fn: () => T | Promise<T>, message?: string): Promise<ActionResult<T>> {
  await requireAuth();
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    const msg = e instanceof Error ? e.message : "Something went wrong";
    if (/UNIQUE constraint failed: projects/.test(msg)) return { ok: false, error: "This client already has a project with that name." };
    if (/FOREIGN KEY/.test(msg)) return { ok: false, error: "That client or project no longer exists." };
    if (/CHECK constraint/.test(msg)) return { ok: false, error: "Some values are out of range." };
    return { ok: false, error: msg };
  }
}

const id = z.number().int().positive();
const ids = z.array(id).max(5000);
const optText = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters`)
    .transform((s) => s.trim() || null)
    .nullish();
const money = (label: string) =>
  z.string().transform((s, ctx) => {
    const c = parseMoneyToCents(s);
    if (c === null || c > 10_000_000) {
      ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 85 or 85.50` });
      return z.NEVER;
    }
    return c;
  });
const hhmm = z
  .string()
  .nullish()
  .transform((s, ctx) => {
    if (!s) return null;
    const m = parseTimeOfDay(s);
    if (m === null) {
      ctx.addIssue({ code: "custom", message: "Enter times like 1:30 PM" });
      return z.NEVER;
    }
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });

// ---------- Time entries ----------

const entrySchema = z
  .object({
    id: id.optional(),
    date: z.string().refine(isIsoDate, "Enter a valid date"),
    projectId: id,
    description: z.string().trim().min(1, "Describe the work performed").max(2000),
    minutes: z.number().int().min(1, "Enter a duration").max(1440, "An entry can be at most 24 hours"),
    rate: money("Hourly rate"),
    startTime: hhmm,
    endTime: hhmm,
  })
  .superRefine((v, ctx) => {
    if (!!v.startTime !== !!v.endTime) ctx.addIssue({ code: "custom", message: "Enter both a start and end time, or neither." });
    if (v.startTime && v.endTime) {
      const span = minutesBetween(parseTimeOfDay(v.startTime)!, parseTimeOfDay(v.endTime)!);
      if (span !== v.minutes) ctx.addIssue({ code: "custom", message: "The start and end times don't match the duration." });
    }
  });

export async function saveEntry(input: z.input<typeof entrySchema>) {
  return run(() => {
    const v = entrySchema.parse(input);
    const data = { date: v.date, projectId: v.projectId, description: v.description, minutes: v.minutes, rateCents: v.rate, startTime: v.startTime, endTime: v.endTime };
    return v.id ? entriesSvc.updateEntry(v.id, data) : entriesSvc.createEntry(data);
  });
}

export async function duplicateEntryAction(entryId: number) {
  return run(() => entriesSvc.duplicateEntry(id.parse(entryId)), "Duplicated to today");
}

export async function deleteEntriesAction(entryIds: number[]) {
  return run(() => entriesSvc.deleteEntries(ids.parse(entryIds)));
}

export async function setBillingStatusAction(entryIds: number[], status: "invoiced" | "uninvoiced", invoiceRef?: string) {
  return run(() =>
    entriesSvc.setBillingStatus(ids.parse(entryIds), z.enum(["invoiced", "uninvoiced"]).parse(status), z.string().max(100).optional().parse(invoiceRef)),
  );
}

// ---------- Clients ----------

const clientSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Client name is required").max(200),
  company: optText(200),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "Enter a valid email address")
    .transform((s) => s || null)
    .nullish(),
  phone: optText(50).transform((s) => (s ? formatPhone(s) : null)),
  notes: optText(5000),
  rate: money("Hourly rate").optional(),
});

export async function saveClient(input: z.input<typeof clientSchema>) {
  return run(() => {
    const { id: clientId, rate, ...v } = clientSchema.parse(input);
    if (clientId) return clientsSvc.updateClient(clientId, { ...v, ...(rate !== undefined ? { rateCents: rate } : {}) });
    return clientsSvc.createClient({ ...v, rateCents: rate });
  });
}

export async function setClientArchivedAction(clientId: number, archived: boolean) {
  return run(() => clientsSvc.setClientArchived(id.parse(clientId), archived));
}

export async function deleteClientAction(clientId: number) {
  const r = await run(() => clientsSvc.deleteClient(id.parse(clientId)));
  if (r.ok) redirect("/clients");
  return r;
}

// ---------- Projects ----------

const projectSchema = z.object({
  id: id.optional(),
  clientId: id,
  name: z.string().trim().min(1, "Project name is required").max(200),
  description: optText(5000),
  /** Empty string = use the client's rate. */
  rate: z.string().transform((s, ctx) => {
    if (!s.trim()) return null;
    const c = parseMoneyToCents(s);
    if (c === null || c > 10_000_000) {
      ctx.addIssue({ code: "custom", message: "Rate override: enter an amount like 110, or leave it blank" });
      return z.NEVER;
    }
    return c;
  }),
});

export async function saveProject(input: z.input<typeof projectSchema>) {
  return run(() => {
    const { id: projectId, rate, ...v } = projectSchema.parse(input);
    const data = { ...v, rateCents: rate };
    return projectId ? projectsSvc.updateProject(projectId, data) : projectsSvc.createProject(data);
  });
}

export async function setProjectArchivedAction(projectId: number, archived: boolean) {
  return run(() => projectsSvc.setProjectArchived(id.parse(projectId), archived));
}

export async function deleteProjectAction(projectId: number) {
  const r = await run(() => projectsSvc.deleteProject(id.parse(projectId)));
  if (r.ok) redirect("/projects");
  return r;
}

// ---------- Timer ----------

export async function startTimerAction(input: { projectId: number; description?: string }) {
  return run(() => timerSvc.startTimer({ projectId: id.parse(input.projectId), description: z.string().max(2000).optional().parse(input.description) }));
}

export async function pauseTimerAction() {
  return run(() => timerSvc.pauseTimer());
}

export async function resumeTimerAction() {
  return run(() => timerSvc.resumeTimer());
}

export async function updateTimerAction(input: { projectId?: number; description?: string }) {
  return run(() =>
    timerSvc.updateTimer({ projectId: input.projectId ? id.parse(input.projectId) : undefined, description: z.string().max(2000).optional().parse(input.description) }),
  );
}

export async function stopTimerAction(input: { description?: string } = {}) {
  return run(() => timerSvc.stopTimer({ description: z.string().max(2000).optional().parse(input.description) }), "Timer saved as an entry");
}

export async function discardTimerAction() {
  return run(() => timerSvc.discardTimer());
}

// ---------- Settings ----------

const settingsSchema = z.object({
  businessName: z.string().trim().max(200),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(50).transform(formatPhone),
  address: z.string().trim().max(500),
  website: z.string().trim().max(200),
  reportFooter: z.string().trim().max(500),
  filenameSuffix: z.string().trim().max(40).regex(/^[^\\/:*?"<>|]*$/, 'The suffix can\'t contain \\ / : * ? " < > |'),
  defaultRate: money("Default hourly rate"),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone"),
  dateFormat: z.enum(["medium", "us"]),
  timeFormat: z.enum(["12short", "12", "24"]),
  showTimesOnReports: z.boolean(),
});

export async function saveSettings(input: z.input<typeof settingsSchema>) {
  return run(() => {
    const { defaultRate, ...v } = settingsSchema.parse(input);
    return updateSettings({ ...v, defaultRateCents: defaultRate });
  }, "Settings saved");
}
