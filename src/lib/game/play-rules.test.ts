import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { denyHostAccessReason } from "@/lib/auth/host-access";
import {
  MUSIC_ROUND_QUESTION_COUNT,
  STANDARD_ROUND_QUESTION_COUNT,
  canSubmitAnswer,
  formatQuestionProgress,
  isLastQuestion,
  nextQuestionPosition,
  nextStepAfterClose,
  parseQuestionCount,
  resolveSubmittingTeamId,
  resolveTeamPlayPhase,
  toTeamSafeAnswer,
} from "@/lib/game/play-rules";

const gameA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const gameB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("team can submit while question is open", () => {
  it("allows submit only in QUESTION_OPEN", () => {
    assert.equal(canSubmitAnswer("QUESTION_OPEN"), true);
    assert.equal(canSubmitAnswer("QUESTION_CLOSED"), false);
    assert.equal(canSubmitAnswer("LOBBY"), false);
    assert.equal(canSubmitAnswer("ROUND_BREAK"), false);
  });
});

describe("duplicate submit rejected", () => {
  it("models one-answer-per-team via answered phase (unique constraint enforced in DB)", () => {
    assert.equal(
      resolveTeamPlayPhase({ status: "QUESTION_OPEN", hasAnswer: true }),
      "question_open_answered",
    );
  });
});

describe("submit after close rejected", () => {
  it("blocks submit when question is closed", () => {
    assert.equal(canSubmitAnswer("QUESTION_CLOSED"), false);
    assert.equal(
      resolveTeamPlayPhase({ status: "QUESTION_CLOSED", hasAnswer: false }),
      "question_closed_unanswered",
    );
  });
});

describe("one team cannot answer for another team", () => {
  it("ignores client-supplied team ids and uses the session team", () => {
    const sessionTeam = "team-session-aaa";
    assert.equal(
      resolveSubmittingTeamId(sessionTeam, "attacker-team-bbb"),
      sessionTeam,
    );
  });
});

describe("host from Game A cannot control Game B", () => {
  it("denies cross-game host control", () => {
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

describe("question sequence advances correctly", () => {
  it("moves through arbitrary round lengths", () => {
    assert.equal(nextQuestionPosition(1), 2);
    assert.equal(nextQuestionPosition(9), 10);
    assert.equal(isLastQuestion(5, STANDARD_ROUND_QUESTION_COUNT), true);
    assert.equal(isLastQuestion(4, STANDARD_ROUND_QUESTION_COUNT), false);
    assert.equal(isLastQuestion(10, MUSIC_ROUND_QUESTION_COUNT), true);
    assert.equal(isLastQuestion(9, MUSIC_ROUND_QUESTION_COUNT), false);
    assert.equal(nextStepAfterClose(true), "open_next");
    assert.equal(nextStepAfterClose(false), "round_break");
    assert.equal(nextStepAfterClose(3, 10), "open_next");
    assert.equal(nextStepAfterClose(10, 10), "round_break");
  });
});

describe("configurable round lengths", () => {
  it("supports standard, music, and custom counts", () => {
    assert.equal(STANDARD_ROUND_QUESTION_COUNT, 5);
    assert.equal(MUSIC_ROUND_QUESTION_COUNT, 10);
    assert.equal(parseQuestionCount("5"), 5);
    assert.equal(parseQuestionCount("10"), 10);
    assert.equal(parseQuestionCount("7"), 7);
    assert.equal(parseQuestionCount("0"), null);
    assert.equal(parseQuestionCount("99"), null);
    assert.equal(formatQuestionProgress(3, 10), "Question 3 of 10");
    assert.equal(formatQuestionProgress(5, 5), "Question 5 of 5");
  });
});

describe("Round completion uses actual question count", () => {
  it("ends after the last question whether N is 5, 10, or custom", () => {
    assert.equal(nextStepAfterClose(5, 5), "round_break");
    assert.equal(nextStepAfterClose(10, 10), "round_break");
    assert.equal(nextStepAfterClose(7, 7), "round_break");
    assert.equal(nextStepAfterClose(false), "round_break");
    assert.equal(
      resolveTeamPlayPhase({ status: "ROUND_BREAK", hasAnswer: true }),
      "round_break",
    );
  });
});

describe("team never receives grading/correctness data", () => {
  it("strips grading fields from team-facing answer payloads", () => {
    const safe = toTeamSafeAnswer({
      text: "Paris",
      submittedAt: "2026-01-01T00:00:00.000Z",
      isCorrect: true,
      pointsAwarded: 1,
      correctAnswer: "Paris",
    });
    assert.deepEqual(safe, {
      text: "Paris",
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal("isCorrect" in safe, false);
    assert.equal("pointsAwarded" in safe, false);
    assert.equal("correctAnswer" in safe, false);
  });
});
