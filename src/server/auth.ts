import "server-only";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, isValidSessionToken } from "@/lib/session";

export async function isSignedIn(): Promise<boolean> {
  const jar = await cookies();
  return isValidSessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for every server action, route handler and page that touches data.
 * The proxy already blocks signed-out requests; this is defense in depth.
 */
export async function requireAuth(): Promise<void> {
  if (!(await isSignedIn())) redirect("/login");
}

/** Same check for route handlers, which should answer 401 rather than redirect. */
export async function isAuthorizedRequest(): Promise<boolean> {
  return isSignedIn();
}

function configuredHash(): string | null {
  const raw = process.env.APP_PASSWORD_HASH?.trim();
  if (!raw) return null;
  // Accept a raw bcrypt hash or the base64 form printed by `npm run hash-password`
  // (base64 avoids "$" being mangled by .env variable expansion).
  if (raw.startsWith("$2")) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.startsWith("$2") ? decoded : null;
  } catch {
    return null;
  }
}

export async function checkPassword(password: string): Promise<boolean> {
  const hash = configuredHash();
  if (hash) return bcrypt.compare(password, hash);
  const plain = process.env.APP_PASSWORD;
  if (plain) {
    const a = Buffer.from(password);
    const b = Buffer.from(plain);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  throw new Error("No login password is configured. Set APP_PASSWORD_HASH (see .env.example).");
}

export async function startSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
