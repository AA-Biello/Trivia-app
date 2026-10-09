import type { GameStatus } from "@/types/game";

export type RoundDisplayType = "standard" | "music" | "custom" | "final";

/** Derive host-facing round type from planned/actual question count. */
export function resolveRoundDisplayType(input: {
  kind: string;
  questionCount: number;
}): RoundDisplayType {
  if (input.kind === "final" || input.kind === "wager") {
    return "final";
  }
  if (input.questionCount === 5) return "standard";
  if (input.questionCount === 10) return "music";
  return "custom";
}

export function formatRoundDisplayType(type: RoundDisplayType): string {
  switch (type) {
    case "standard":
      return "Standard";
    case "music":
      return "Music";
    case "custom":
      return "Custom";
    case "final":
      return "Final wager";
  }
}

export type RoundListStatus =
  | "ready"
  | "active"
  | "in_progress"
  | "scored"
  | "upcoming";

export type HostRoundListItem = {
  id: string;
  position: number;
  title: string;
  kind: string;
  displayType: RoundDisplayType;
  displayTypeLabel: string;
  questionCount: number;
  status: RoundListStatus;
  isFinal: boolean;
};

/**
 * Host round-list status. Ordered by rounds.position (never created_at).
 */
export function resolveRoundListStatus(input: {
  roundId: string;
  currentRoundId: string | null;
  gameStatus: GameStatus;
  hasPublishedScores: boolean;
}): RoundListStatus {
  if (input.hasPublishedScores) return "scored";
  if (input.roundId === input.currentRoundId) {
    if (input.gameStatus === "LOBBY" || input.gameStatus === "SCOREBOARD") {
      return "ready";
    }
    return "active";
  }
  return "upcoming";
}

export function canCreateRoundInLobby(status: GameStatus): boolean {
  return status === "LOBBY";
}

/** Additional standard rounds may be authored from the post-round scoreboard. */
export function canCreateNextRound(status: GameStatus): boolean {
  return status === "SCOREBOARD";
}

export function canStartNextRound(status: GameStatus): boolean {
  return status === "SCOREBOARD";
}

export function canStartFinalWager(status: GameStatus): boolean {
  return status === "SCOREBOARD";
}

/**
 * Next playable (non-final) round after the current one, by explicit position.
 */
export function findNextPlayableRound<
  T extends { id: string; position: number; kind: string },
>(rounds: T[], currentRoundId: string | null): T | null {
  const playable = [...rounds]
    .filter((r) => r.kind !== "final" && r.kind !== "wager")
    .sort((a, b) => a.position - b.position);

  if (!currentRoundId) {
    return playable[0] ?? null;
  }

  const current = playable.find((r) => r.id === currentRoundId);
  if (!current) {
    return playable[0] ?? null;
  }

  return playable.find((r) => r.position > current.position) ?? null;
}
