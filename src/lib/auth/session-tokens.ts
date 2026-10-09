import "server-only";

/**
 * Host/team browser sessions are opaque tokens. Only SHA-256 hashes are stored
 * (game_hosts / team_sessions). Server Actions must:
 * 1) read the raw token from an httpOnly cookie/header
 * 2) hash it
 * 3) look up the session row with the admin client
 * 4) authorize using the resolved host/team id — never trust client team_id alone
 */
export {
  generateSessionToken,
  hashSessionToken,
  sessionTokensEqual,
} from "@/lib/auth/token-crypto";
