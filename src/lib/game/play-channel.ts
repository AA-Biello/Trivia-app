import type { GameStatus } from "@/types/game";

/** Broadcast topic for live question / reveal / scoreboard flow. */
export function playChannelName(gameId: string): string {
  return `play:${gameId}`;
}

export const GAME_STATE_EVENT = "game_state";
export const ANSWER_PROGRESS_EVENT = "answer_progress";
export const WAGER_PROGRESS_EVENT = "wager_progress";

export type PublicRevealView = {
  questionId: string;
  questionNumber: number;
  questionCount: number;
  prompt: string;
  /** Null until host reveals the correct answer for this question. */
  correctAnswer: string | null;
  /** Null until host reveals team answers for this question. */
  teamAnswers: Array<{
    teamName: string;
    answerText: string;
    isCorrect: boolean | null;
    pointsAwarded: number;
  }> | null;
};

export type PublicScoreboardRow = {
  teamName: string;
  roundPoints: number;
  totalPoints: number;
  rank: number;
};

export type PublicFinalResultsRow = {
  teamName: string;
  startingScore: number;
  wager: number;
  answerText: string | null;
  isCorrect: boolean;
  finalScore: number;
  rank: number;
};

/**
 * Public snapshot safe for team clients.
 * Never includes unrevealed secrets/grades/wagers. Scoreboard only after publish.
 */
export type PublicGameStatePayload = {
  status: GameStatus;
  roundId: string | null;
  roundTitle: string | null;
  questionId: string | null;
  questionNumber: number | null;
  questionCount: number | null;
  prompt: string | null;
  /** Present during wager phases; never includes other teams' amounts. */
  maxWager: number | null;
  /** Host message during ROUND_BREAK / ROUND_REVIEW; null uses app default. */
  waitingMessage: string | null;
  reveal: PublicRevealView | null;
  scoreboard: PublicScoreboardRow[] | null;
  /** Only after host publishes FINAL_RESULTS. */
  finalResults: PublicFinalResultsRow[] | null;
};

/** Host progress ping — team identity only, never answer text. */
export type AnswerProgressPayload = {
  questionId: string;
  submittedCount: number;
  teamId: string;
  teamName: string;
};

/** Host progress ping — team identity only, never wager amounts. */
export type WagerProgressPayload = {
  questionId: string;
  wageredCount: number;
  teamId: string;
  teamName: string;
};
