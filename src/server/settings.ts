import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings, type Settings } from "@/db/schema";

export function getSettings(): Settings {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (row) return row;
  db.insert(settings).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(settings).where(eq(settings.id, 1)).get()!;
}

export type SettingsPatch = Partial<Omit<Settings, "id" | "updatedAt">>;

export function updateSettings(patch: SettingsPatch): Settings {
  getSettings();
  getDb().update(settings).set(patch).where(eq(settings.id, 1)).run();
  return getSettings();
}
