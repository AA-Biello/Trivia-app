export const DEFAULT_CORRECT_POINTS = 1;
export const DEFAULT_INCORRECT_POINTS = 0;
export const ANSWER_GRADE_REASON = "answer_grade";
export { FINAL_WAGER_REASON } from "@/lib/game/wager-rules";

/** Host-only grading row — never send raw grades to team clients before reveal. */
export type HostGradeQuestionView = {
  id: string;
  position: number;
  prompt: string;
  pointValue: number;
  correctAnswer: string;
  answers: Array<{
    answerId: string;
    teamId: string;
    teamName: string;
    answerText: string;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    gradedAt: string | null;
  }>;
  unansweredTeams: Array<{ teamId: string; teamName: string }>;
};

export type HostRevealSnapshot = {
  roundId: string;
  questionId: string | null;
  questionNumber: number | null;
  questionCount: number;
  prompt: string | null;
  correctAnswer: string | null;
  correctAnswerRevealed: boolean;
  teamAnswersRevealed: boolean;
};

export function defaultPointsForGrade(isCorrect: boolean): number {
  return isCorrect ? DEFAULT_CORRECT_POINTS : DEFAULT_INCORRECT_POINTS;
}

export function resolveGradePoints(input: {
  isCorrect: boolean;
  pointsOverride?: number | null;
}): number {
  if (
    input.pointsOverride != null &&
    Number.isFinite(input.pointsOverride) &&
    Number.isInteger(input.pointsOverride)
  ) {
    return input.pointsOverride;
  }
  return defaultPointsForGrade(input.isCorrect);
}

export type TeamScoreRow = {
  teamId: string;
  teamName: string;
  roundPoints: number;
  totalPoints: number;
};

export type RankedTeamScore = TeamScoreRow & {
  rank: number;
};

/**
 * Competition ranking: equal totals share a rank; next rank skips
 * (e.g. 1, 2, 2, 4). No invented tie-breakers.
 */
export function rankTeamsByTotal(rows: TeamScoreRow[]): RankedTeamScore[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    if (b.roundPoints !== a.roundPoints) {
      return b.roundPoints - a.roundPoints;
    }
    return a.teamName.localeCompare(b.teamName);
  });

  let lastTotal: number | null = null;
  let lastRank = 0;

  return sorted.map((row, index) => {
    if (lastTotal === null || row.totalPoints !== lastTotal) {
      lastRank = index + 1;
      lastTotal = row.totalPoints;
    }
    return { ...row, rank: lastRank };
  });
}

export function sumPoints(
  events: Array<{ teamId: string; delta: number; roundId?: string | null }>,
  options?: { roundId?: string },
): Map<string, { total: number; round: number }> {
  const map = new Map<string, { total: number; round: number }>();
  for (const event of events) {
    const current = map.get(event.teamId) ?? { total: 0, round: 0 };
    current.total += event.delta;
    if (options?.roundId && event.roundId === options.roundId) {
      current.round += event.delta;
    }
    map.set(event.teamId, current);
  }
  return map;
}

/** Public reveal payload builder — only includes what the host has revealed. */
export function buildPublicRevealView(input: {
  questionId: string;
  questionNumber: number;
  questionCount: number;
  prompt: string;
  correctAnswer: string;
  correctAnswerRevealed: boolean;
  teamAnswersRevealed: boolean;
  teamAnswers: Array<{
    teamName: string;
    answerText: string;
    isCorrect: boolean | null;
    pointsAwarded: number;
  }>;
}): {
  questionId: string;
  questionNumber: number;
  questionCount: number;
  prompt: string;
  correctAnswer: string | null;
  teamAnswers: Array<{
    teamName: string;
    answerText: string;
    isCorrect: boolean | null;
    pointsAwarded: number;
  }> | null;
} {
  return {
    questionId: input.questionId,
    questionNumber: input.questionNumber,
    questionCount: input.questionCount,
    prompt: input.prompt,
    correctAnswer: input.correctAnswerRevealed ? input.correctAnswer : null,
    teamAnswers: input.teamAnswersRevealed ? input.teamAnswers : null,
  };
}
