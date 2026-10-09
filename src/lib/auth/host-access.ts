import { sessionOwnsGame } from "@/lib/auth/ownership";

export type HostAccessDenial =
  | "missing_host_session"
  | "invalid_host_session"
  | "host_game_mismatch";

/**
 * Pure host-route authorization decision used by pages and tests.
 * Cookie presence and DB lookup results are supplied by the caller —
 * never trusts a client-supplied hostId.
 */
export function denyHostAccessReason(input: {
  hasCookie: boolean;
  /** game_id from game_hosts lookup; null when cookie present but lookup fails */
  resolvedGameId: string | null;
  routeGameId: string;
}): HostAccessDenial | null {
  if (!input.hasCookie) {
    return "missing_host_session";
  }
  if (!input.resolvedGameId) {
    return "invalid_host_session";
  }
  if (!sessionOwnsGame(input.resolvedGameId, input.routeGameId)) {
    return "host_game_mismatch";
  }
  return null;
}

export function hostResumeHref(gameId: string): string {
  return `/host/${gameId}`;
}

export function hostResumeLabel(title: string): string {
  const trimmed = title.trim() || "game";
  return `Resume ${trimmed}`;
}
