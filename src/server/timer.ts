import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activeTimer, clients, projects } from "@/db/schema";
import { zonedParts } from "@/lib/dates";
import { toHHMM } from "@/lib/duration";
import { createEntry } from "./entries";
import { getSettings } from "./settings";

export type TimerState = {
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
  description: string;
  startedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
  wasPaused: boolean;
};

export function getTimer(): TimerState | null {
  const row = getDb()
    .select({
      projectId: activeTimer.projectId,
      projectName: projects.name,
      clientId: clients.id,
      clientName: clients.name,
      description: activeTimer.description,
      startedAt: activeTimer.startedAt,
      accumulatedMs: activeTimer.accumulatedMs,
      runningSince: activeTimer.runningSince,
      wasPaused: activeTimer.wasPaused,
    })
    .from(activeTimer)
    .innerJoin(projects, eq(projects.id, activeTimer.projectId))
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(activeTimer.id, 1))
    .get();
  return row ?? null;
}

export function elapsedMs(t: Pick<TimerState, "accumulatedMs" | "runningSince">, now = Date.now()): number {
  return t.accumulatedMs + (t.runningSince ? Math.max(0, now - t.runningSince) : 0);
}

export function startTimer(input: { projectId: number; description?: string }, now = Date.now()) {
  if (getTimer()) throw new Error("A timer is already running. Stop or discard it first.");
  getDb()
    .insert(activeTimer)
    .values({ id: 1, projectId: input.projectId, description: input.description?.trim() ?? "", startedAt: now, accumulatedMs: 0, runningSince: now })
    .run();
}

export function pauseTimer(now = Date.now()) {
  const t = getTimer();
  if (!t || !t.runningSince) return;
  getDb()
    .update(activeTimer)
    .set({ accumulatedMs: elapsedMs(t, now), runningSince: null, wasPaused: true })
    .where(eq(activeTimer.id, 1))
    .run();
}

export function resumeTimer(now = Date.now()) {
  const t = getTimer();
  if (!t || t.runningSince) return;
  getDb().update(activeTimer).set({ runningSince: now }).where(eq(activeTimer.id, 1)).run();
}

export function updateTimer(input: { projectId?: number; description?: string }) {
  getDb()
    .update(activeTimer)
    .set({
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    })
    .where(eq(activeTimer.id, 1))
    .run();
}

export function discardTimer() {
  getDb().delete(activeTimer).where(eq(activeTimer.id, 1)).run();
}

/**
 * Stop the timer and save it as an entry dated the day it started (in the
 * configured timezone). Duration is rounded to the nearest minute (minimum 1).
 * Exact start/end times are recorded only when the timer was never paused, so
 * the span on a report always matches the billed duration.
 */
export function stopTimer(opts: { description?: string } = {}, now = Date.now()) {
  const t = getTimer();
  if (!t) throw new Error("No timer is running.");
  const { timezone } = getSettings();
  let minutes = Math.max(1, Math.round(elapsedMs(t, now) / 60000));
  const start = zonedParts(t.startedAt, timezone);
  const tooLong = minutes > 1440;
  if (tooLong) minutes = 1440;
  const recordTimes = !t.wasPaused && !tooLong;
  const description = (opts.description ?? t.description).trim() || "Timed work";
  const db = getDb();
  return db.transaction((tx) => {
    const entry = createEntry(
      {
        date: start.date,
        projectId: t.projectId,
        description,
        minutes,
        startTime: recordTimes ? toHHMM(start.minutes) : null,
        endTime: recordTimes ? toHHMM(start.minutes + minutes) : null,
        source: "timer",
      },
      tx,
    );
    tx.delete(activeTimer).where(eq(activeTimer.id, 1)).run();
    return entry;
  });
}

