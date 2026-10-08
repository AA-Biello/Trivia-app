/**
 * Domain types for pub trivia.
 *
 * Security model:
 * - Host is authoritative for game status and grading (service-role server only).
 * - Teams authenticate with a browser session token; only the hash is stored in
 *   `team_sessions` (never on the public `teams` roster row / realtime).
 * - Correct answers, grades, private wagers, and unpublished scores stay off
 *   team clients until the host publishes/reveals per question.
 * - Do not authorize with client-supplied team_id alone — resolve the team from
 *   the hashed session token on the server first.
 */

export const GAME_STATUSES = [
  "LOBBY",
  "QUESTION_OPEN",
  "QUESTION_CLOSED",
  "ROUND_BREAK",
  "ROUND_REVIEW",
  "REVEAL",
  "RESULTS_PUBLISHED",
  "SCOREBOARD",
  "WAGER_OPEN",
  "WAGER_LOCKED",
  "FINAL_QUESTION",
  "FINAL_REVIEW",
  "FINAL_RESULTS",
  "GAME_OVER",
] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];

/** Statuses in which teams may submit/change answer text. */
export const ANSWER_OPEN_STATUSES = [
  "QUESTION_OPEN",
  "FINAL_QUESTION",
] as const satisfies readonly GameStatus[];

export type AnswerOpenStatus = (typeof ANSWER_OPEN_STATUSES)[number];

export const ROUND_KINDS = ["standard", "wager", "final"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

/** Host-facing game row (host token never returned to clients). */
export type Game = {
  id: string;
  joinCode: string;
  title: string;
  status: GameStatus;
  currentRoundId: string | null;
  currentQuestionId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Public slice safe for team clients / realtime. */
export type GamePublic = Pick<
  Game,
  | "id"
  | "joinCode"
  | "title"
  | "status"
  | "currentRoundId"
  | "currentQuestionId"
  | "updatedAt"
>;

export type Team = {
  id: string;
  gameId: string;
  name: string;
  /** Scoreboard total; only advanced when score events are published. */
  displayScore: number;
  createdAt: string;
};

/** Server-only session row — never send to team browsers. */
export type TeamSession = {
  teamId: string;
  sessionTokenHash: string;
  createdAt: string;
};

/** Server-only host session row — never send to team browsers. */
export type GameHost = {
  gameId: string;
  hostTokenHash: string;
  createdAt: string;
};

export type Round = {
  id: string;
  gameId: string;
  position: number;
  title: string;
  kind: RoundKind;
  /** Usual default is 5 for a standard round. */
  plannedQuestionCount: number;
  createdAt: string;
};

/** Prompt content teams may see when the host opens the question. */
export type Question = {
  id: string;
  gameId: string;
  roundId: string;
  position: number;
  prompt: string;
  mediaUrl: string | null;
  pointValue: number;
  /**
   * Per-question publish gate for ROUND_REVIEW.
   * When set, grades for this question may be shown; other questions stay hidden.
   */
  resultsPublishedAt: string | null;
  createdAt: string;
};

/** Host-only. Never select via team-facing clients. */
export type QuestionSecret = {
  questionId: string;
  correctAnswer: string;
  gradingNotes: string | null;
};

/** Team submission body (no correctness). */
export type Answer = {
  id: string;
  gameId: string;
  questionId: string;
  teamId: string;
  answerText: string;
  submittedAt: string;
  updatedAt: string;
  /** When set, answer text is immutable without host bypass. */
  lockedAt: string | null;
};

/** Host grading; team-visible only after question.resultsPublishedAt. */
export type AnswerGrade = {
  answerId: string;
  isCorrect: boolean | null;
  pointsAwarded: number;
  gradedAt: string | null;
};

export type Wager = {
  id: string;
  gameId: string;
  questionId: string;
  teamId: string;
  amount: number;
  lockedAt: string | null;
  /** When set, amount may be shown publicly. */
  revealedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Append-only scoring ledger; team-visible only once publishedAt is set. */
export type ScoreEvent = {
  id: string;
  gameId: string;
  teamId: string;
  questionId: string | null;
  roundId: string | null;
  delta: number;
  reason: string;
  publishedAt: string | null;
  createdAt: string;
};

/** Safe payload for team UI before results are published. */
export type TeamAnswerView = Pick<
  Answer,
  "id" | "questionId" | "teamId" | "answerText" | "submittedAt" | "lockedAt"
>;

/** Payload after host publishes results for a question. */
export type PublishedAnswerView = TeamAnswerView & {
  isCorrect: boolean | null;
  pointsAwarded: number;
};
