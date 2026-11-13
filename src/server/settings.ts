import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings, type Settings } from "@/db/schema";

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.select().from(settings).where(eq(settings.id, 1)).get();
  if (row) return row;
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing().run();
  return (await db.select().from(settings).where(eq(settings.id, 1)).get())!;
}

export type SettingsPatch = Partial<Omit<Settings, "id" | "updatedAt">>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  await getSettings();
  await (await getDb()).update(settings).set(patch).where(eq(settings.id, 1)).run();
  return getSettings();
}
