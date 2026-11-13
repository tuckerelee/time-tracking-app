import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, openDb, setDbForTesting } from "@/db";
import { getSettings, updateSettings } from "@/server/settings";
import { createClient, getClient, updateClient, deleteClient, listClients } from "@/server/clients";
import { createProject, getProject, updateProject, deleteProject } from "@/server/projects";
import { createEntry, duplicateEntry, listEntries, setBillingStatus, updateEntry } from "@/server/entries";
import { getReportData, parseReportFilters } from "@/server/reports";
import { getTimer, pauseTimer, resumeTimer, startTimer, stopTimer } from "@/server/timer";
import { clientCount, loadSampleData } from "@/server/sample-data";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-test-"));
let n = 0;

// A fresh database file per test (file-backed so transactions behave as in production).
beforeEach(async () => {
  setDbForTesting(await openDb(`file:${path.join(tmp, `t${++n}.db`)}`));
  await updateSettings({ timezone: "America/Chicago", defaultRateCents: 7500 });
});

async function setup() {
  const acme = await createClient({ name: "Acme Company", rateCents: 8500 });
  const north = await createClient({ name: "Northwind Bakery" }); // inherits the $75 global default
  const wm = await createProject({ clientId: acme.id, name: "Website Maintenance" });
  const br = await createProject({ clientId: acme.id, name: "Brand Refresh", rateCents: 11000 });
  const order = await createProject({ clientId: north.id, name: "Online Ordering" });
  return { acme, north, wm, br, order };
}

const entry = (projectId: number, date: string, minutes: number, extra: object = {}) =>
  createEntry({ date, projectId, description: "Work", minutes, ...extra });

describe("rate hierarchy", () => {
  it("copies the global default onto new clients", async () => {
    const { north } = await setup();
    expect(north.rateCents).toBe(7500);
    await updateSettings({ defaultRateCents: 9000 });
    expect((await getClient(north.id))!.rateCents).toBe(7500); // existing client unchanged
    expect((await createClient({ name: "New Co" })).rateCents).toBe(9000);
  });

  it("resolves project → client rates", async () => {
    const { wm, br, order } = await setup();
    expect(await getProject(wm.id)).toMatchObject({ effectiveRateCents: 8500, rateSource: "client" });
    expect(await getProject(br.id)).toMatchObject({ effectiveRateCents: 11000, rateSource: "project" });
    expect(await getProject(order.id)).toMatchObject({ effectiveRateCents: 7500, rateSource: "client" });
  });

  it("captures the effective rate on each entry", async () => {
    const { wm, br } = await setup();
    const a = await entry(wm.id, "2026-11-09", 90);
    const b = await entry(br.id, "2026-11-06", 135);
    expect([a.rateCents, a.amountCents]).toEqual([8500, 12750]);
    expect([b.rateCents, b.amountCents]).toEqual([11000, 24750]);
  });

  it("allows a manual rate on one entry", async () => {
    const { wm } = await setup();
    const e = await entry(wm.id, "2026-11-09", 60, { rateCents: 12500 });
    expect([e.rateCents, e.amountCents]).toEqual([12500, 12500]);
  });
});

describe("historical rates are preserved", () => {
  it("does not change saved entries when client or project rates change", async () => {
    const { acme, wm, br } = await setup();
    const a = await entry(wm.id, "2026-11-04", 50);
    const b = await entry(br.id, "2026-11-06", 135);

    await updateClient(acme.id, { rateCents: 9500 });
    await updateProject(br.id, { rateCents: 12000 });

    const rows = await listEntries({});
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ rateCents: 8500, amountCents: 7083 });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ rateCents: 11000, amountCents: 24750 });

    // New work uses the new rates.
    expect((await entry(wm.id, "2026-11-10", 60)).rateCents).toBe(9500);
    expect((await entry(br.id, "2026-11-10", 60)).rateCents).toBe(12000);
  });

  it("keeps the saved rate when an entry's duration is edited", async () => {
    const { acme, wm } = await setup();
    const a = await entry(wm.id, "2026-11-04", 50);
    await updateClient(acme.id, { rateCents: 9500 });
    const edited = await updateEntry(a.id, { minutes: 60 });
    expect([edited.rateCents, edited.amountCents]).toEqual([8500, 8500]);
  });

  it("applies the new project's rate when an entry is moved to another project", async () => {
    const { wm, br } = await setup();
    const a = await entry(wm.id, "2026-11-04", 60);
    expect(await updateEntry(a.id, { projectId: br.id })).toMatchObject({ rateCents: 11000, amountCents: 11000 });
  });

  it("keeps past report totals the same after rate changes", async () => {
    const { acme, wm, br } = await setup();
    await entry(wm.id, "2026-11-04", 50);
    await entry(wm.id, "2026-11-09", 90);
    await entry(br.id, "2026-11-02", 105);
    await entry(br.id, "2026-11-06", 135);
    const filters = { clientId: acme.id, projectId: null, from: "2026-11-01", to: "2026-11-30", status: "all" as const, showTimes: true };
    expect((await getReportData(filters)).report.totalCents).toBe(63833);
    await updateClient(acme.id, { rateCents: 20000 });
    await updateProject(br.id, { rateCents: 30000 });
    expect((await getReportData(filters)).report.totalCents).toBe(63833);
  });
});

describe("date filtering", () => {
  it("includes both ends of the range and nothing outside it", async () => {
    const { wm } = await setup();
    for (const date of ["2026-10-31", "2026-11-01", "2026-11-15", "2026-11-30", "2026-12-01"]) await entry(wm.id, date, 60);
    const dates = (await listEntries({ from: "2026-11-01", to: "2026-11-30" })).map((e) => e.date).sort();
    expect(dates).toEqual(["2026-11-01", "2026-11-15", "2026-11-30"]);
  });

  it("filters by client, project and billing status", async () => {
    const { acme, wm, br, order } = await setup();
    const a = await entry(wm.id, "2026-11-02", 60);
    await entry(br.id, "2026-11-02", 60);
    await entry(order.id, "2026-11-02", 60);
    await setBillingStatus([a.id], "invoiced", "INV-1042");
    expect(await listEntries({ clientId: acme.id })).toHaveLength(2);
    expect(await listEntries({ projectId: br.id })).toHaveLength(1);
    expect((await listEntries({ status: "invoiced" })).map((e) => e.invoiceRef)).toEqual(["INV-1042"]);
    expect(await listEntries({ status: "uninvoiced" })).toHaveLength(2);
    expect(await listEntries({ clientId: acme.id, status: "uninvoiced" })).toHaveLength(1);
  });

  it("parses report presets relative to today in the configured timezone", async () => {
    const f = await parseReportFilters({ preset: "custom", from: "2026-11-30", to: "2026-11-01" });
    expect([f.from, f.to]).toEqual(["2026-11-01", "2026-11-30"]); // swapped into order
    expect((await parseReportFilters({ preset: "custom", from: "bad" })).from).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe("billing status", () => {
  it("marks invoiced with a reference and can revert", async () => {
    const { wm } = await setup();
    const a = await entry(wm.id, "2026-11-02", 60);
    const b = await entry(wm.id, "2026-11-03", 60);
    expect(await setBillingStatus([a.id, b.id], "invoiced", " INV-7 ")).toBe(2);
    expect((await listEntries({})).every((e) => e.status === "invoiced" && e.invoiceRef === "INV-7")).toBe(true);
    await setBillingStatus([a.id], "uninvoiced");
    expect((await listEntries({ status: "uninvoiced" })).map((e) => [e.id, e.invoiceRef])).toEqual([[a.id, null]]);
  });

  it("generating a report does not mark anything invoiced", async () => {
    const { acme, wm } = await setup();
    await entry(wm.id, "2026-11-02", 60);
    await getReportData({ clientId: acme.id, projectId: null, from: "2026-11-01", to: "2026-11-30", status: "all", showTimes: true });
    expect(await listEntries({ status: "uninvoiced" })).toHaveLength(1);
  });

  it("duplicates as new uninvoiced work", async () => {
    const { wm } = await setup();
    const a = await entry(wm.id, "2026-11-02", 60, { startTime: "09:00", endTime: "10:00" });
    await setBillingStatus([a.id], "invoiced", "INV-1");
    const d = await duplicateEntry(a.id, "2026-11-12");
    expect(d).toMatchObject({ date: "2026-11-12", status: "uninvoiced", invoiceRef: null, minutes: 60, startTime: null });
  });
});

describe("client stats, archiving and deletion", () => {
  it("summarizes totals and uninvoiced amounts", async () => {
    const { acme, wm, br } = await setup();
    const a = await entry(wm.id, "2026-11-02", 90);
    await entry(br.id, "2026-11-03", 60);
    await setBillingStatus([a.id], "invoiced");
    expect(await getClient(acme.id)).toMatchObject({ activeProjects: 2, totalMinutes: 150, totalCents: 23750, uninvoicedCents: 11000 });
  });

  it("refuses to delete clients or projects that have time", async () => {
    const { acme, north, wm, order } = await setup();
    await entry(wm.id, "2026-11-02", 60);
    await expect(deleteClient(acme.id)).rejects.toThrow(/Archive/);
    await expect(deleteProject(wm.id)).rejects.toThrow(/Archive/);
    await deleteProject(order.id);
    await deleteClient(north.id);
    expect((await listClients({ includeArchived: true })).map((c) => c.name)).toEqual(["Acme Company"]);
  });

  it("enforces database constraints", async () => {
    const { wm } = await setup();
    await expect(entry(wm.id, "11/02/2026", 60)).rejects.toThrow();
    await expect(entry(wm.id, "2026-11-02", 0)).rejects.toThrow();
    await expect(entry(9999, "2026-11-02", 60, { rateCents: 100 })).rejects.toThrow();
  });
});

describe("timer", () => {
  it("persists server timestamps and saves the entry with exact times", async () => {
    const { wm } = await setup();
    // 2026-11-09 13:30 in Chicago (CST, UTC-6) = 19:30 UTC
    const start = Date.UTC(2026, 10, 9, 19, 30);
    await startTimer({ projectId: wm.id, description: "Homepage" }, start);
    await expect(startTimer({ projectId: wm.id }, start)).rejects.toThrow(/already running/);
    expect(await getTimer()).toMatchObject({ startedAt: start, runningSince: start });
    const saved = await stopTimer({}, start + 90 * 60_000 + 20_000);
    expect(saved).toMatchObject({ date: "2026-11-09", minutes: 90, startTime: "13:30", endTime: "15:00", source: "timer", amountCents: 12750 });
    expect(await getTimer()).toBeNull();
  });

  it("excludes paused time and omits exact times after a pause", async () => {
    const { wm } = await setup();
    const t0 = Date.UTC(2026, 10, 9, 15, 0);
    await startTimer({ projectId: wm.id }, t0);
    await pauseTimer(t0 + 30 * 60_000);
    await resumeTimer(t0 + 60 * 60_000); // 30 minutes paused
    const saved = await stopTimer({ description: "Work" }, t0 + 75 * 60_000);
    expect(saved).toMatchObject({ minutes: 45, startTime: null, endTime: null, description: "Work" });
  });

  it("dates the entry in the configured timezone", async () => {
    const { wm } = await setup();
    // 10:00pm Nov 9 in Chicago is already Nov 10 in UTC.
    const t0 = Date.UTC(2026, 10, 10, 4, 0);
    await startTimer({ projectId: wm.id }, t0);
    expect((await stopTimer({}, t0 + 30 * 60_000)).date).toBe("2026-11-09");
  });
});

describe("settings and sample data", () => {
  it("defaults the filename suffix to Lee", async () => {
    expect((await getSettings()).filenameSuffix).toBe("Lee");
  });

  it("loads sample data that reconciles", async () => {
    await loadSampleData();
    expect(await clientCount(await getDb())).toBe(4);
    const rows = await listEntries({});
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.amountCents).toBe(Math.floor((r.minutes * r.rateCents + 30) / 60));
  });
});
