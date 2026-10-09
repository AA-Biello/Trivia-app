import "server-only";

import { cookies } from "next/headers";

import {
  HOST_SESSION_COOKIE,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/cookie-names";
import {
  clearSessionCookieOptions,
  sessionCookieOptions,
} from "@/lib/auth/cookie-options";

export { HOST_SESSION_COOKIE, TEAM_SESSION_COOKIE };

export async function setHostSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(HOST_SESSION_COOKIE, token, sessionCookieOptions());
}

export async function setTeamSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  // Distinct cookie name — must never replace the host session cookie.
  jar.set(TEAM_SESSION_COOKIE, token, sessionCookieOptions());
}

export async function readHostSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(HOST_SESSION_COOKIE)?.value ?? null;
}

export async function readTeamSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(TEAM_SESSION_COOKIE)?.value ?? null;
}

export async function clearHostSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(HOST_SESSION_COOKIE, "", clearSessionCookieOptions());
}

export async function clearTeamSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(TEAM_SESSION_COOKIE, "", clearSessionCookieOptions());
}
