import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/cookie-names";

/** Options for host/team session cookies — path must be "/" for app-wide access. */
export function sessionCookieOptions(now = Date.now()) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(now + SESSION_MAX_AGE_SECONDS * 1000),
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}
