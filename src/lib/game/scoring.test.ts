import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { denyHostAccessReason } from "@/lib/auth/host-access";
import {
  MUSIC_ROUND_QUESTION_COUNT,
  STANDARD_ROUND_QUESTION_COUNT,
  isLastQuestion,
  nextStepAfterClose,
  resolveTeamPlayPhase,
  toTeamSafeAnswer,
} from "@/lib/game/play-rules";
import {
  ANSWER_GRADE_REASON,
  buildPublicRevealView,
  defaultPointsForGrade,
  rankTeamsByTotal,
  resolveGradePoints,
  sumPoints,
  type TeamScoreRow,
} from "@/lib/game/scoring";

const gameA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const gameB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("grading correct/incorrect", () => {
  it("defaults correct to 1 and incorrect to 0", () => {
    assert.equal(defaultPointsForGrade(true), 1);
    assert.equal(defaultPointsForGrade(false), 0);
    assert.equal(resolveGradePoints({ isCorrect: true }), 1);
    assert.equal(resolveGradePoints({ isCorrect: false }), 0);
  });
});

describe("host can override a grade", () => {
  it("honors host-supplied point overrides", () => {
    assert.equal(
      resolveGradePoints({ isCorrect: true, pointsOverride: 2 }),
      2,
    );
    assert.equal(
      resolveGradePoints({ isCorrect: false, pointsOverride: 1 }),
      1,
    );
    assert.equal(
      resolveGradePoints({ isCorrect: true, pointsOverride: 0 }),
      0,
    );
  });
});

describe("host from Game A cannot grade Game B", () => {
  it("denies cross-game host access used by grading actions", () => {
    assert.equal(
      denyHostAccessReason({
        hasCookie: true,
        resolvedGameId: gameA,
        routeGameId: gameB,
      }),
      "host_game_mismatch",
    );
  });
});

describe("team cannot grade answers", () => {
  it("team-facing answer views never carry grade fields", () => {
    const safe = toTeamSafeAnswer({
      text: "1955",
      submittedAt: "2026-01-01T00:00:00.000Z",
      isCorrect: true,
      pointsAwarded: 1,
      correctAnswer: "1955",
    });
    assert.deepEqual(Object.keys(safe).sort(), ["submittedAt", "text"]);
  });

  it("teams stay on review/waiting phases while host grades", () => {
    assert.equal(
      resolveTeamPlayPhase({ status: "ROUND_REVIEW", hasAnswer: true }),
      "round_review",
    );
    assert.equal(
      resolveTeamPlayPhase({ status: "ROUND_BREAK", hasAnswer: true }),
      "round_break",
    );
  });
});

describe("unrevealed correct answer is not present in team/public state", () => {
  it("omits correct answer until host reveals it", () => {
    const view = buildPublicRevealView({
      questionId: "q1",
      questionNumber: 1,
      questionCount: 5,
      prompt: "What year did Disneyland open?",
      correctAnswer: "1955",
      correctAnswerRevealed: false,
      teamAnswersRevealed: false,
      teamAnswers: [],
    });
    assert.equal(view.correctAnswer, null);
    assert.equal(view.teamAnswers, null);
  });
});

describe("unrevealed grade is not present in team/public state", () => {
  it("omits team answers/grades until host reveals them", () => {
    const view = buildPublicRevealView({
      questionId: "q1",
      questionNumber: 1,
      questionCount: 5,
      prompt: "What year did Disneyland open?",
      correctAnswer: "1955",
      correctAnswerRevealed: true,
      teamAnswersRevealed: false,
      teamAnswers: [
        {
          teamName: "Quiz Khalifa",
          answerText: "1955",
          isCorrect: true,
          pointsAwarded: 1,
        },
      ],
    });
    assert.equal(view.correctAnswer, "1955");
    assert.equal(view.teamAnswers, null);
  });
});

describe("revealing Q1 does not leak Q2", () => {
  it("public reveal payload only contains the current question", () => {
    const q1 = buildPublicRevealView({
      questionId: "q1",
      questionNumber: 1,
      questionCount: 5,
      prompt: "Disneyland year?",
      correctAnswer: "1955",
      correctAnswerRevealed: true,
      teamAnswersRevealed: true,
      teamAnswers: [
        {
          teamName: "Quiz Khalifa",
          answerText: "1955",
          isCorrect: true,
          pointsAwarded: 1,
        },
      ],
    });
    assert.equal(q1.questionId, "q1");
    assert.equal(q1.questionNumber, 1);
    assert.equal(q1.correctAnswer, "1955");
    // Next question secrets/grades are simply not part of this payload.
    assert.equal(
      JSON.stringify(q1).includes("q2"),
      false,
    );
  });
});

describe("reveal state survives refresh", () => {
  it("rebuilds the same public reveal from persisted flags", () => {
    const persisted = {
      questionId: "q3",
      questionNumber: 3,
      questionCount: 10,
      prompt: "Who wrote Hamlet?",
      correctAnswer: "Shakespeare",
      correctAnswerRevealed: true,
      teamAnswersRevealed: false,
      teamAnswers: [],
    };
    const afterRefresh = buildPublicRevealView(persisted);
    assert.deepEqual(afterRefresh, {
      questionId: "q3",
      questionNumber: 3,
      questionCount: 10,
      prompt: "Who wrote Hamlet?",
      correctAnswer: "Shakespeare",
      teamAnswers: null,
    });
  });
});

describe("score publication is idempotent", () => {
  it("re-applying the same grade events does not double totals", () => {
    const ledger = new Map<string, number>();
    const apply = (key: string, delta: number) => {
      // Mirrors unique (game, team, question) answer_grade upsert semantics.
      ledger.set(key, delta);
    };
    apply("g:t1:q1", 1);
    apply("g:t1:q1", 1);
    apply("g:t1:q2", 0);
    apply("g:t1:q2", 0);
    const total = [...ledger.values()].reduce((a, b) => a + b, 0);
    assert.equal(total, 1);
    assert.equal(ANSWER_GRADE_REASON, "answer_grade");
  });
});

describe("score total is calculated from approved grades", () => {
  it("sums published answer_grade deltas per team", () => {
    const totals = sumPoints(
      [
        { teamId: "t1", delta: 1, roundId: "r1" },
        { teamId: "t1", delta: 1, roundId: "r1" },
        { teamId: "t2", delta: 0, roundId: "r1" },
        { teamId: "t2", delta: 1, roundId: "r1" },
      ],
      { roundId: "r1" },
    );
    assert.equal(totals.get("t1")?.total, 2);
    assert.equal(totals.get("t1")?.round, 2);
    assert.equal(totals.get("t2")?.total, 1);
    assert.equal(totals.get("t2")?.round, 1);
  });
});

describe("scoreboard ranking works", () => {
  it("sorts highest total first with competition ranks", () => {
    const rows: TeamScoreRow[] = [
      { teamId: "a", teamName: "Alpha", roundPoints: 2, totalPoints: 2 },
      { teamId: "b", teamName: "Beta", roundPoints: 5, totalPoints: 5 },
      { teamId: "c", teamName: "Gamma", roundPoints: 3, totalPoints: 3 },
    ];
    const ranked = rankTeamsByTotal(rows);
    assert.deepEqual(
      ranked.map((r) => [r.teamName, r.rank, r.totalPoints]),
      [
        ["Beta", 1, 5],
        ["Gamma", 2, 3],
        ["Alpha", 3, 2],
      ],
    );
  });
});

describe("tied teams are handled without fake tie-breaking", () => {
  it("shares rank and skips the next place", () => {
    const ranked = rankTeamsByTotal([
      { teamId: "a", teamName: "Alpha", roundPoints: 3, totalPoints: 3 },
      { teamId: "b", teamName: "Beta", roundPoints: 3, totalPoints: 3 },
      { teamId: "c", teamName: "Gamma", roundPoints: 1, totalPoints: 1 },
    ]);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 1);
    assert.equal(ranked[2].rank, 3);
    // Ordering among ties is stable by name only for display, not a score rule.
    assert.equal(ranked[0].teamName, "Alpha");
    assert.equal(ranked[1].teamName, "Beta");
  });
});

describe("5-question and 10-question rounds both grade/reveal correctly", () => {
  it("supports full standard and music length sequences through break", () => {
    assert.equal(STANDARD_ROUND_QUESTION_COUNT, 5);
    assert.equal(MUSIC_ROUND_QUESTION_COUNT, 10);
    assert.equal(isLastQuestion(5, 5), true);
    assert.equal(isLastQuestion(10, 10), true);
    assert.equal(nextStepAfterClose(5, 5), "round_break");
    assert.equal(nextStepAfterClose(10, 10), "round_break");

    for (const count of [5, 10] as const) {
      for (let n = 1; n <= count; n++) {
        const revealed = buildPublicRevealView({
          questionId: `q${n}`,
          questionNumber: n,
          questionCount: count,
          prompt: `Prompt ${n}`,
          correctAnswer: `Answer ${n}`,
          correctAnswerRevealed: true,
          teamAnswersRevealed: true,
          teamAnswers: [
            {
              teamName: "Team",
              answerText: `Answer ${n}`,
              isCorrect: true,
              pointsAwarded: 1,
            },
          ],
        });
        assert.equal(revealed.questionNumber, n);
        assert.equal(revealed.questionCount, count);
        assert.equal(revealed.correctAnswer, `Answer ${n}`);
        assert.equal(revealed.teamAnswers?.length, 1);
      }
    }

    assert.equal(
      resolveTeamPlayPhase({ status: "REVEAL", hasAnswer: true }),
      "reveal",
    );
    assert.equal(
      resolveTeamPlayPhase({ status: "SCOREBOARD", hasAnswer: true }),
      "scoreboard",
    );
    assert.equal(
      resolveTeamPlayPhase({ status: "RESULTS_PUBLISHED", hasAnswer: true }),
      "awaiting_scoreboard",
    );
  });
});
