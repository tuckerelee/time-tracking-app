import { beforeEach, describe, expect, it } from "vitest";
import { openDb, setDbForTesting } from "@/db";
import { getSettings, updateSettings } from "@/server/settings";
import { createClient, getClient, updateClient, deleteClient, listClients } from "@/server/clients";
import { createProject, getProject, updateProject, deleteProject } from "@/server/projects";
import { createEntry, duplicateEntry, listEntries, setBillingStatus, updateEntry } from "@/server/entries";
import { getReportData, parseReportFilters } from "@/server/reports";
import { getTimer, pauseTimer, resumeTimer, startTimer, stopTimer } from "@/server/timer";

beforeEach(() => {
  setDbForTesting(openDb(":memory:"));
  updateSettings({ timezone: "America/Chicago", defaultRateCents: 7500 });
});

function setup() {
  const acme = createClient({ name: "Acme Company", rateCents: 8500 });
  const north = createClient({ name: "Northwind Bakery" }); // inherits the $75 global default
  const wm = createProject({ clientId: acme.id, name: "Website Maintenance" });
  const br = createProject({ clientId: acme.id, name: "Brand Refresh", rateCents: 11000 });
  const order = createProject({ clientId: north.id, name: "Online Ordering" });
  return { acme, north, wm, br, order };
}

describe("rate hierarchy", () => {
  it("copies the global default onto new clients", () => {
    const { north } = setup();
    expect(north.rateCents).toBe(7500);
    updateSettings({ defaultRateCents: 9000 });
    expect(getClient(north.id)!.rateCents).toBe(7500); // existing client unchanged
    expect(createClient({ name: "New Co" }).rateCents).toBe(9000);
  });

  it("resolves project → client rates", () => {
    const { wm, br, order } = setup();
    expect(getProject(wm.id)).toMatchObject({ effectiveRateCents: 8500, rateSource: "client" });
    expect(getProject(br.id)).toMatchObject({ effectiveRateCents: 11000, rateSource: "project" });
    expect(getProject(order.id)).toMatchObject({ effectiveRateCents: 7500, rateSource: "client" });
  });

  it("captures the effective rate on each entry", () => {
    const { wm, br } = setup();
    const a = createEntry({ date: "2026-11-09", projectId: wm.id, description: "Homepage", minutes: 90 });
    const b = createEntry({ date: "2026-11-06", projectId: br.id, description: "Logos", minutes: 135 });
    expect([a.rateCents, a.amountCents]).toEqual([8500, 12750]);
    expect([b.rateCents, b.amountCents]).toEqual([11000, 24750]);
  });

  it("allows a manual rate on one entry", () => {
    const { wm } = setup();
    const e = createEntry({ date: "2026-11-09", projectId: wm.id, description: "Rush job", minutes: 60, rateCents: 12500 });
    expect([e.rateCents, e.amountCents]).toEqual([12500, 12500]);
  });
});

describe("historical rates are preserved", () => {
  it("does not change saved entries when client or project rates change", () => {
    const { acme, wm, br } = setup();
    const a = createEntry({ date: "2026-11-04", projectId: wm.id, description: "Plugins", minutes: 50 });
    const b = createEntry({ date: "2026-11-06", projectId: br.id, description: "Logos", minutes: 135 });

    updateClient(acme.id, { rateCents: 9500 });
    updateProject(br.id, { rateCents: 12000 });

    const rows = listEntries({});
    expect(rows.find((r) => r.id === a.id)).toMatchObject({ rateCents: 8500, amountCents: 7083 });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({ rateCents: 11000, amountCents: 24750 });

    // New work uses the new rates.
    expect(createEntry({ date: "2026-11-10", projectId: wm.id, description: "More", minutes: 60 }).rateCents).toBe(9500);
    expect(createEntry({ date: "2026-11-10", projectId: br.id, description: "More", minutes: 60 }).rateCents).toBe(12000);
  });

  it("keeps the saved rate when an entry's duration is edited", () => {
    const { acme, wm } = setup();
    const a = createEntry({ date: "2026-11-04", projectId: wm.id, description: "Plugins", minutes: 50 });
    updateClient(acme.id, { rateCents: 9500 });
    const edited = updateEntry(a.id, { minutes: 60 });
    expect([edited.rateCents, edited.amountCents]).toEqual([8500, 8500]);
  });

  it("applies the new project's rate when an entry is moved to another project", () => {
    const { wm, br } = setup();
    const a = createEntry({ date: "2026-11-04", projectId: wm.id, description: "Plugins", minutes: 60 });
    expect(updateEntry(a.id, { projectId: br.id })).toMatchObject({ rateCents: 11000, amountCents: 11000 });
  });

  it("keeps past report totals the same after rate changes", () => {
    const { acme, wm, br } = setup();
    createEntry({ date: "2026-11-04", projectId: wm.id, description: "a", minutes: 50 });
    createEntry({ date: "2026-11-09", projectId: wm.id, description: "b", minutes: 90 });
    createEntry({ date: "2026-11-02", projectId: br.id, description: "c", minutes: 105 });
    createEntry({ date: "2026-11-06", projectId: br.id, description: "d", minutes: 135 });
    const filters = { clientId: acme.id, projectId: null, from: "2026-11-01", to: "2026-11-30", status: "all" as const, showTimes: true };
    expect(getReportData(filters).report.totalCents).toBe(63833);
    updateClient(acme.id, { rateCents: 20000 });
    updateProject(br.id, { rateCents: 30000 });
    expect(getReportData(filters).report.totalCents).toBe(63833);
  });
});

describe("date filtering", () => {
  it("includes both ends of the range and nothing outside it", () => {
    const { wm } = setup();
    for (const date of ["2026-10-31", "2026-11-01", "2026-11-15", "2026-11-30", "2026-12-01"]) {
      createEntry({ date, projectId: wm.id, description: date, minutes: 60 });
    }
    const dates = listEntries({ from: "2026-11-01", to: "2026-11-30" }).map((e) => e.date).sort();
    expect(dates).toEqual(["2026-11-01", "2026-11-15", "2026-11-30"]);
  });

  it("filters by client, project and billing status", () => {
    const { acme, wm, br, order } = setup();
    const a = createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 60 });
    createEntry({ date: "2026-11-02", projectId: br.id, description: "b", minutes: 60 });
    createEntry({ date: "2026-11-02", projectId: order.id, description: "c", minutes: 60 });
    setBillingStatus([a.id], "invoiced", "INV-1042");
    expect(listEntries({ clientId: acme.id })).toHaveLength(2);
    expect(listEntries({ projectId: br.id })).toHaveLength(1);
    expect(listEntries({ status: "invoiced" }).map((e) => e.invoiceRef)).toEqual(["INV-1042"]);
    expect(listEntries({ status: "uninvoiced" })).toHaveLength(2);
    expect(listEntries({ clientId: acme.id, status: "uninvoiced" })).toHaveLength(1);
  });

  it("parses report presets relative to today in the configured timezone", () => {
    const f = parseReportFilters({ preset: "custom", from: "2026-11-30", to: "2026-11-01" });
    expect([f.from, f.to]).toEqual(["2026-11-01", "2026-11-30"]); // swapped into order
    expect(parseReportFilters({ preset: "custom", from: "bad" }).from).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe("billing status", () => {
  it("marks invoiced with a reference and can revert", () => {
    const { wm } = setup();
    const a = createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 60 });
    const b = createEntry({ date: "2026-11-03", projectId: wm.id, description: "b", minutes: 60 });
    expect(setBillingStatus([a.id, b.id], "invoiced", " INV-7 ")).toBe(2);
    expect(listEntries({}).every((e) => e.status === "invoiced" && e.invoiceRef === "INV-7")).toBe(true);
    setBillingStatus([a.id], "uninvoiced");
    expect(listEntries({ status: "uninvoiced" }).map((e) => [e.id, e.invoiceRef])).toEqual([[a.id, null]]);
  });

  it("generating a report does not mark anything invoiced", () => {
    const { acme, wm } = setup();
    createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 60 });
    getReportData({ clientId: acme.id, projectId: null, from: "2026-11-01", to: "2026-11-30", status: "all", showTimes: true });
    expect(listEntries({ status: "uninvoiced" })).toHaveLength(1);
  });

  it("duplicates as new uninvoiced work", () => {
    const { wm } = setup();
    const a = createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 60, startTime: "09:00", endTime: "10:00" });
    setBillingStatus([a.id], "invoiced", "INV-1");
    const d = duplicateEntry(a.id, "2026-11-12");
    expect(d).toMatchObject({ date: "2026-11-12", status: "uninvoiced", invoiceRef: null, minutes: 60, startTime: null });
  });
});

describe("client stats, archiving and deletion", () => {
  it("summarizes totals and uninvoiced amounts", () => {
    const { acme, wm, br } = setup();
    const a = createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 90 });
    createEntry({ date: "2026-11-03", projectId: br.id, description: "b", minutes: 60 });
    setBillingStatus([a.id], "invoiced");
    expect(getClient(acme.id)).toMatchObject({ activeProjects: 2, totalMinutes: 150, totalCents: 23750, uninvoicedCents: 11000 });
  });

  it("refuses to delete clients or projects that have time", () => {
    const { acme, north, wm, order } = setup();
    createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 60 });
    expect(() => deleteClient(acme.id)).toThrow(/Archive/);
    expect(() => deleteProject(wm.id)).toThrow(/Archive/);
    deleteProject(order.id);
    deleteClient(north.id);
    expect(listClients({ includeArchived: true }).map((c) => c.name)).toEqual(["Acme Company"]);
  });

  it("enforces database constraints", () => {
    const { wm } = setup();
    expect(() => createEntry({ date: "11/02/2026", projectId: wm.id, description: "a", minutes: 60 })).toThrow();
    expect(() => createEntry({ date: "2026-11-02", projectId: wm.id, description: "a", minutes: 0 })).toThrow();
    expect(() => createEntry({ date: "2026-11-02", projectId: 9999, description: "a", minutes: 60 })).toThrow();
  });
});

describe("timer", () => {
  it("persists server timestamps and saves the entry with exact times", () => {
    const { wm } = setup();
    // 2026-11-09 13:30 in Chicago (CST, UTC-6) = 19:30 UTC
    const start = Date.UTC(2026, 10, 9, 19, 30);
    startTimer({ projectId: wm.id, description: "Homepage" }, start);
    expect(() => startTimer({ projectId: wm.id }, start)).toThrow(/already running/);
    expect(getTimer()).toMatchObject({ startedAt: start, runningSince: start });
    const entry = stopTimer({}, start + 90 * 60_000 + 20_000);
    expect(entry).toMatchObject({ date: "2026-11-09", minutes: 90, startTime: "13:30", endTime: "15:00", source: "timer", amountCents: 12750 });
    expect(getTimer()).toBeNull();
  });

  it("excludes paused time and omits exact times after a pause", () => {
    const { wm } = setup();
    const t0 = Date.UTC(2026, 10, 9, 15, 0);
    startTimer({ projectId: wm.id }, t0);
    pauseTimer(t0 + 30 * 60_000);
    resumeTimer(t0 + 60 * 60_000); // 30 minutes paused
    const entry = stopTimer({ description: "Work" }, t0 + 75 * 60_000);
    expect(entry).toMatchObject({ minutes: 45, startTime: null, endTime: null, description: "Work" });
  });

  it("dates the entry in the configured timezone", () => {
    const { wm } = setup();
    // 10:00pm Nov 9 in Chicago is already Nov 10 in UTC.
    const t0 = Date.UTC(2026, 10, 10, 4, 0);
    startTimer({ projectId: wm.id }, t0);
    expect(stopTimer({}, t0 + 30 * 60_000).date).toBe("2026-11-09");
  });
});

describe("settings", () => {
  it("defaults the filename suffix to Lee", () => {
    expect(getSettings().filenameSuffix).toBe("Lee");
  });
});
