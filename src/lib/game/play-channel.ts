import type { GameStatus } from "@/types/game";

/** Broadcast topic for live question flow (no DB table subscriptions). */
export function playChannelName(gameId: string): string {
  return `play:${gameId}`;
}

export const GAME_STATE_EVENT = "game_state";
export const ANSWER_PROGRESS_EVENT = "answer_progress";

/** Public snapshot safe for team clients — never includes grades/keys. */
export type PublicGameStatePayload = {
  status: GameStatus;
  roundId: string | null;
  roundTitle: string | null;
  questionId: string | null;
  questionNumber: number | null;
  questionCount: number | null;
  prompt: string | null;
};

/** Host progress ping — team identity only, never answer text. */
export type AnswerProgressPayload = {
  questionId: string;
  submittedCount: number;
  teamId: string;
  teamName: string;
};
