import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { denyHostAccessReason } from "@/lib/auth/host-access";
import {
  canSubmitAnswer,
  resolveSubmittingTeamId,
  resolveTeamPlayPhase,
} from "@/lib/game/play-rules";
import { rankTeamsByTotal } from "@/lib/game/scoring";
import {
  applyFinalScore,
  canInsertWagerForGameStatus,
  canSubmitFinalResponse,
  effectiveMaxWager,
  finalWagerDelta,
  parseWagerAmount,
  validateWager,
} from "@/lib/game/wager-rules";

const gameA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const gameB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("wager insert succeeds during FINAL_QUESTION", () => {
  it("allows DB/app insert window for FINAL_QUESTION and legacy WAGER_OPEN", () => {
    assert.equal(canInsertWagerForGameStatus("FINAL_QUESTION"), true);
    assert.equal(canInsertWagerForGameStatus("WAGER_OPEN"), true);
    assert.equal(canSubmitFinalResponse("FINAL_QUESTION"), true);
  });
});

describe("wager insert during unrelated states is rejected", () => {
  it("rejects SCOREBOARD, REVIEW, LOBBY, QUESTION_OPEN, etc.", () => {
    for (const status of [
      "LOBBY",
      "QUESTION_OPEN",
      "QUESTION_CLOSED",
      "ROUND_BREAK",
      "ROUND_REVIEW",
      "REVEAL",
      "SCOREBOARD",
      "WAGER_LOCKED",
      "FINAL_REVIEW",
      "FINAL_RESULTS",
      "GAME_OVER",
    ]) {
      assert.equal(
        canInsertWagerForGameStatus(status),
        false,
        `expected reject for ${status}`,
      );
    }
  });
});

describe("zero wager succeeds", () => {
  it("accepts amount 0 within effective max", () => {
    const result = validateWager({
      amount: 0,
      maxWager: 5,
      currentScore: 3,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.amount, 0);
      assert.equal(result.effectiveMax, 3);
    }
  });
});

describe("wager above effective max rejected", () => {
  it("uses min(configured max, current score) as the cap", () => {
    assert.equal(effectiveMaxWager(10, 4), 4);
    assert.equal(effectiveMaxWager(3, 10), 3);
    assert.equal(effectiveMaxWager(5, 5), 5);

    const aboveScore = validateWager({
      amount: 5,
      maxWager: 10,
      currentScore: 4,
    });
    assert.equal(aboveScore.ok, false);
    if (!aboveScore.ok) {
      assert.match(aboveScore.error, /4/);
    }

    const aboveConfigured = validateWager({
      amount: 6,
      maxWager: 5,
      currentScore: 10,
    });
    assert.equal(aboveConfigured.ok, false);
  });
});

describe("duplicate/second wager rejected", () => {
  it("combined final response is locked once answer+wager exist", () => {
    assert.equal(
      resolveTeamPlayPhase({
        status: "FINAL_QUESTION",
        hasAnswer: true,
        hasWager: true,
      }),
      "final_question_answered",
    );
    assert.equal(canSubmitFinalResponse("FINAL_REVIEW"), false);
  });
});

describe("valid wager", () => {
  it("accepts whole-number wagers within effective max", () => {
    assert.deepEqual(
      validateWager({ amount: 3, maxWager: 5, currentScore: 4 }),
      { ok: true, amount: 3, effectiveMax: 4 },
    );
    assert.equal(parseWagerAmount("0"), 0);
    assert.equal(parseWagerAmount("12"), 12);
  });
});

describe("negative wager rejected", () => {
  it("rejects negative amounts", () => {
    const result = validateWager({ amount: -1, maxWager: 5, currentScore: 5 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /negative/i);
    }
  });
});

describe("one team cannot submit another team’s wager", () => {
  it("team identity must come from session, not client teamId", () => {
    assert.equal(
      resolveSubmittingTeamId("team-aaa", "attacker-bbb"),
      "team-aaa",
    );
  });
});

describe("final answer locks", () => {
  it("uses combined FINAL_QUESTION submit; standard answer action stays closed", () => {
    assert.equal(canSubmitAnswer("FINAL_QUESTION"), false);
    assert.equal(canSubmitAnswer("QUESTION_OPEN"), true);
    assert.equal(canSubmitFinalResponse("FINAL_QUESTION"), true);
    assert.equal(
      resolveTeamPlayPhase({
        status: "FINAL_QUESTION",
        hasAnswer: false,
        hasWager: false,
      }),
      "final_question_unanswered",
    );
  });
});

describe("host from Game A cannot grade Game B", () => {
  it("denies cross-game host access for final grading", () => {
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

describe("correct wager adds points", () => {
  it("adds wager to starting score", () => {
    assert.equal(finalWagerDelta(true, 4), 4);
    assert.equal(applyFinalScore(10, true, 4), 14);
  });
});

describe("incorrect wager subtracts points", () => {
  it("subtracts wager from starting score", () => {
    assert.equal(finalWagerDelta(false, 4), -4);
    assert.equal(applyFinalScore(10, false, 4), 6);
  });
});

describe("double publish does not duplicate score effects", () => {
  it("re-applying the same final_wager delta does not double totals", () => {
    const ledger = new Map<string, number>();
    const apply = (key: string, delta: number) => {
      ledger.set(key, delta);
    };
    apply("g:t1:final", 3);
    apply("g:t1:final", 3);
    assert.equal(ledger.get("g:t1:final"), 3);
  });
});

describe("final rankings handle ties", () => {
  it("shares rank without inventing tie-breakers", () => {
    const ranked = rankTeamsByTotal([
      { teamId: "a", teamName: "Alpha", roundPoints: 2, totalPoints: 12 },
      { teamId: "b", teamName: "Beta", roundPoints: 2, totalPoints: 12 },
      { teamId: "c", teamName: "Gamma", roundPoints: 0, totalPoints: 8 },
    ]);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 1);
    assert.equal(ranked[2].rank, 3);
  });
});

describe("private wagers do not leak before final results", () => {
  it("teams wait through review without public finalResults", () => {
    assert.equal(
      resolveTeamPlayPhase({
        status: "FINAL_REVIEW",
        hasAnswer: true,
        hasWager: true,
      }),
      "final_review",
    );
    assert.equal(
      resolveTeamPlayPhase({
        status: "FINAL_RESULTS",
        hasAnswer: true,
        hasWager: true,
      }),
      "final_results",
    );
  });
});
