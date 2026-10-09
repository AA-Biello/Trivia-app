import type { GameStatus } from "@/types/game";

/** Teams may join only while the host has the game in the lobby. */
export function canAcceptTeamJoins(status: GameStatus): boolean {
  return status === "LOBBY";
}

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isValidTeamName(name: string): boolean {
  const normalized = normalizeTeamName(name);
  return normalized.length >= 1 && normalized.length <= 40;
}
