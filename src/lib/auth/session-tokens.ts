import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Host/team browser sessions are opaque tokens. Only SHA-256 hashes are stored
 * (game_hosts / team_sessions). Server Actions must:
 * 1) read the raw token from an httpOnly cookie/header
 * 2) hash it
 * 3) look up the session row with the admin client
 * 4) authorize using the resolved host/team id — never trust client team_id alone
 */

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sessionTokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
