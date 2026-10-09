import type { GameStatus } from "@/types/game";

/** Common presets — not hard limits on round length. */
export const ROUND_LENGTH_PRESETS = {
  standard: 5,
  music: 10,
} as const;

export type RoundLengthPreset = keyof typeof ROUND_LENGTH_PRESETS;

/** Default when creating a standard round. */
export const STANDARD_ROUND_QUESTION_COUNT = ROUND_LENGTH_PRESETS.standard;

export const MUSIC_ROUND_QUESTION_COUNT = ROUND_LENGTH_PRESETS.music;

export const MIN_ROUND_QUESTIONS = 1;
export const MAX_ROUND_QUESTIONS = 30;

export function parseQuestionCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < MIN_ROUND_QUESTIONS || n > MAX_ROUND_QUESTIONS) {
    return null;
  }
  return n;
}

export function canCreateRound(status: GameStatus): boolean {
  return status === "LOBBY" || status === "SCOREBOARD";
}

export function canOpenQuestion(status: GameStatus): boolean {
  return status === "LOBBY" || status === "QUESTION_CLOSED";
}

export function canCloseQuestion(status: GameStatus): boolean {
  return status === "QUESTION_OPEN";
}

/** Standard-round answers only. Final uses submitFinalResponseAction. */
export function canSubmitAnswer(status: GameStatus): boolean {
  return status === "QUESTION_OPEN";
}

/** True when this position is the last among the round's actual questions. */
export function isLastQuestion(
  questionPosition: number,
  questionCount: number,
): boolean {
  return questionCount > 0 && questionPosition >= questionCount;
}

/**
 * After the current question is closed, decide the host's next control.
 * Driven by whether another question exists in the round — not a fixed length.
 */
export function nextStepAfterClose(hasNextQuestion: boolean): "open_next" | "round_break";
export function nextStepAfterClose(
  closedQuestionPosition: number,
  questionCount: number,
): "open_next" | "round_break";
export function nextStepAfterClose(
  closedQuestionPositionOrHasNext: number | boolean,
  questionCount?: number,
): "open_next" | "round_break" {
  if (typeof closedQuestionPositionOrHasNext === "boolean") {
    return closedQuestionPositionOrHasNext ? "open_next" : "round_break";
  }
  return isLastQuestion(closedQuestionPositionOrHasNext, questionCount ?? 0)
    ? "round_break"
    : "open_next";
}

export function nextQuestionPosition(currentPosition: number): number {
  return currentPosition + 1;
}

export function formatQuestionProgress(
  questionNumber: number,
  questionCount: number,
): string {
  return `Question ${questionNumber} of ${questionCount}`;
}

/** Strip any grading fields from a payload before sending to team clients. */
export function toTeamSafeAnswer(input: {
  text: string;
  submittedAt: string;
  isCorrect?: boolean | null;
  pointsAwarded?: number;
  correctAnswer?: string;
}): { text: string; submittedAt: string } {
  return {
    text: input.text,
    submittedAt: input.submittedAt,
  };
}

/**
 * Submissions always use the cookie-resolved team id.
 * Browser-supplied teamId values are ignored.
 */
export function resolveSubmittingTeamId(
  sessionTeamId: string,
  clientSuppliedTeamId?: string | null,
): string {
  void clientSuppliedTeamId;
  return sessionTeamId;
}

export type TeamPlayPhase =
  | "lobby"
  | "question_open_unanswered"
  | "question_open_answered"
  | "question_closed_answered"
  | "question_closed_unanswered"
  | "round_break"
  | "round_review"
  | "reveal"
  | "awaiting_scoreboard"
  | "scoreboard"
  | "final_question_unanswered"
  | "final_question_answered"
  | "final_review"
  | "final_results"
  | "other";

export function resolveTeamPlayPhase(input: {
  status: GameStatus;
  hasAnswer: boolean;
  hasWager?: boolean;
}): TeamPlayPhase {
  const { status, hasAnswer, hasWager } = input;
  if (status === "LOBBY") return "lobby";
  if (status === "QUESTION_OPEN") {
    return hasAnswer ? "question_open_answered" : "question_open_unanswered";
  }
  if (status === "QUESTION_CLOSED") {
    return hasAnswer ? "question_closed_answered" : "question_closed_unanswered";
  }
  if (status === "ROUND_BREAK") return "round_break";
  if (status === "ROUND_REVIEW") return "round_review";
  if (status === "REVEAL") return "reveal";
  if (status === "RESULTS_PUBLISHED") return "awaiting_scoreboard";
  if (status === "SCOREBOARD") return "scoreboard";
  // Legacy statuses map to waiting — combined final uses FINAL_QUESTION only.
  if (status === "WAGER_OPEN" || status === "WAGER_LOCKED") return "other";
  if (status === "FINAL_QUESTION") {
    const locked = Boolean(hasAnswer && hasWager);
    return locked ? "final_question_answered" : "final_question_unanswered";
  }
  if (status === "FINAL_REVIEW") return "final_review";
  if (status === "FINAL_RESULTS" || status === "GAME_OVER") {
    return "final_results";
  }
  return "other";
}
