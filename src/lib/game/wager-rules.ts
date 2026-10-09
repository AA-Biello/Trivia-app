export const FINAL_WAGER_REASON = "final_wager";

/** Host-only final review row — never send raw wagers/grades to teams before FINAL_RESULTS. */
export type HostFinalReviewRow = {
  teamId: string;
  teamName: string;
  startingScore: number;
  wagerAmount: number | null;
  wagerLocked: boolean;
  answerId: string | null;
  answerText: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
};

export type HostFinalSnapshot = {
  roundId: string;
  questionId: string;
  prompt: string;
  correctAnswer: string;
  maxWager: number;
  /** Teams that locked both answer and wager. */
  lockedTeamIds: string[];
  lockedTeamNames: string[];
  reviewRows: HostFinalReviewRow[];
};

export function parseWagerAmount(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return null;
    return value;
  }
  const raw = String(value ?? "").trim();
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) return null;
  return n;
}

export type WagerValidationResult =
  | { ok: true; amount: number; effectiveMax: number }
  | { ok: false; error: string };

/**
 * Team-facing cap: min(configured max wager, current score).
 * Current score is included because teams.display_score is constrained >= 0.
 */
export function effectiveMaxWager(
  configuredMaxWager: number,
  currentScore: number,
): number {
  const max = Number.isInteger(configuredMaxWager) ? configuredMaxWager : 0;
  const score = Number.isInteger(currentScore) ? currentScore : 0;
  return Math.max(0, Math.min(max, score));
}

/**
 * Mirrors DB trigger public.enforce_wager_submission_window insert window.
 * FINAL_QUESTION is the combined final-response path; WAGER_OPEN is legacy.
 */
export function canInsertWagerForGameStatus(status: string): boolean {
  return status === "FINAL_QUESTION" || status === "WAGER_OPEN";
}

/**
 * App-layer wager rules (amount + effective max).
 * Does not replace DB uniqueness / ownership / lock immutability.
 */
export function validateWager(input: {
  amount: number;
  maxWager: number;
  currentScore: number;
}): WagerValidationResult {
  const { amount, maxWager, currentScore } = input;

  if (!Number.isInteger(amount)) {
    return { ok: false, error: "Wager must be a whole number." };
  }
  if (amount < 0) {
    return { ok: false, error: "Wager cannot be negative." };
  }
  if (!Number.isInteger(maxWager) || maxWager < 0) {
    return { ok: false, error: "Maximum wager is not configured." };
  }
  if (!Number.isInteger(currentScore) || currentScore < 0) {
    return { ok: false, error: "Current score is invalid." };
  }

  const effectiveMax = effectiveMaxWager(maxWager, currentScore);
  if (amount > effectiveMax) {
    return {
      ok: false,
      error: `Wager cannot exceed ${effectiveMax} (min of max wager and your score).`,
    };
  }
  return { ok: true, amount, effectiveMax };
}

/** Correct adds wager; incorrect (including no answer) subtracts wager. */
export function finalWagerDelta(isCorrect: boolean, wagerAmount: number): number {
  const amount = Math.max(0, wagerAmount);
  return isCorrect ? amount : -amount;
}

export function applyFinalScore(
  startingScore: number,
  isCorrect: boolean,
  wagerAmount: number,
): number {
  return startingScore + finalWagerDelta(isCorrect, wagerAmount);
}

/** Combined final response: answer + wager while FINAL_QUESTION is open. */
export function canSubmitFinalResponse(status: string): boolean {
  return status === "FINAL_QUESTION";
}

export function canStartFinalWager(status: string): boolean {
  return status === "SCOREBOARD";
}

export function canEnterFinalReview(status: string): boolean {
  return status === "FINAL_QUESTION";
}

export function canGradeFinal(status: string): boolean {
  return status === "FINAL_REVIEW";
}

export function canPublishFinalResults(status: string): boolean {
  return status === "FINAL_REVIEW" || status === "FINAL_RESULTS";
}
