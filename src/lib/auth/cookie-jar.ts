import {
  HOST_SESSION_COOKIE,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/cookie-names";

/**
 * Minimal in-memory cookie jar for unit tests of host/team cookie isolation.
 * Mirrors production: two distinct names, path-scoped conceptually to "/".
 */
export type MemoryCookieJar = Map<string, string>;

export function createMemoryCookieJar(
  initial?: Record<string, string>,
): MemoryCookieJar {
  return new Map(Object.entries(initial ?? {}));
}

export function memorySetHostSession(
  jar: MemoryCookieJar,
  token: string,
): void {
  jar.set(HOST_SESSION_COOKIE, token);
}

export function memorySetTeamSession(
  jar: MemoryCookieJar,
  token: string,
): void {
  jar.set(TEAM_SESSION_COOKIE, token);
}

export function memoryReadHostSession(jar: MemoryCookieJar): string | null {
  return jar.get(HOST_SESSION_COOKIE) ?? null;
}

export function memoryReadTeamSession(jar: MemoryCookieJar): string | null {
  return jar.get(TEAM_SESSION_COOKIE) ?? null;
}
