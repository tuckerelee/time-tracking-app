"use server";

import { redirect } from "next/navigation";
import { checkPassword, endSession, startSession } from "@/server/auth";

const failures: number[] = [];

export async function login(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  // Slow down guessing: recent failures add delay.
  const now = Date.now();
  while (failures.length && now - failures[0] > 15 * 60_000) failures.shift();
  if (failures.length >= 10) return { error: "Too many attempts. Try again in a few minutes." };

  let ok = false;
  try {
    ok = await checkPassword(password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sign-in is not configured." };
  }
  if (!ok) {
    failures.push(now);
    await new Promise((r) => setTimeout(r, 400 + failures.length * 200));
    return { error: "That password isn't right." };
  }
  failures.length = 0;
  await startSession();
  redirect(next);
}

export async function logout() {
  await endSession();
  redirect("/login");
}
