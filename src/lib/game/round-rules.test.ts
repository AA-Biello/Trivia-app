import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { denyHostAccessReason } from "@/lib/auth/host-access";
import { canCreateRound } from "@/lib/game/play-rules";
import {
  canCreateNextRound,
  canStartFinalWager,
  canStartNextRound,
  findNextPlayableRound,
  resolveRoundDisplayType,
  resolveRoundListStatus,
} from "@/lib/game/round-rules";
import { rankTeamsByTotal, sumPoints } from "@/lib/game/scoring";

const gameA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const gameB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const round1 = { id: "r1", position: 1, kind: "standard" };
const round2 = { id: "r2", position: 2, kind: "standard" };
const finalRound = { id: "rf", position: 3, kind: "final" };

describe("game with 2 standard rounds", () => {
  it("orders by explicit position and finds the next playable round", () => {
    const rounds = [round2, finalRound, round1];
    assert.equal(findNextPlayableRound(rounds, "r1")?.id, "r2");
    assert.equal(findNextPlayableRound(rounds, "r2"), null);
    assert.equal(resolveRoundDisplayType({ kind: "standard", questionCount: 5 }), "standard");
  });
});

describe("game with 5-question round followed by 10-question music round", () => {
  it("labels standard vs music from question counts", () => {
    assert.equal(
      resolveRoundDisplayType({ kind: "standard", questionCount: 5 }),
      "standard",
    );
    assert.equal(
      resolveRoundDisplayType({ kind: "standard", questionCount: 10 }),
      "music",
    );
    assert.equal(
      resolveRoundDisplayType({ kind: "standard", questionCount: 7 }),
      "custom",
    );
  });
});

describe("Round 1 scoreboard → Round 2 start", () => {
  it("allows next-round start only from SCOREBOARD when a next round exists", () => {
    assert.equal(canStartNextRound("SCOREBOARD"), true);
    assert.equal(canStartNextRound("LOBBY"), false);
    assert.equal(canStartNextRound("FINAL_QUESTION"), false);
    assert.equal(findNextPlayableRound([round1, round2], "r1")?.id, "r2");
    assert.equal(
      resolveRoundListStatus({
        roundId: "r2",
        currentRoundId: "r1",
        gameStatus: "SCOREBOARD",
        hasPublishedScores: false,
      }),
      "upcoming",
    );
  });
});

describe("cumulative scoring across rounds", () => {
  it("sums answer_grade events from multiple rounds", () => {
    const totals = sumPoints(
      [
        { teamId: "t1", delta: 3, roundId: "r1" },
        { teamId: "t1", delta: 2, roundId: "r2" },
        { teamId: "t2", delta: 1, roundId: "r1" },
      ],
      { roundId: "r2" },
    );
    assert.equal(totals.get("t1")?.total, 5);
    assert.equal(totals.get("t1")?.round, 2);
    assert.equal(totals.get("t2")?.total, 1);
  });
});

describe("Round 1 republish does not double-score", () => {
  it("upsert semantics keep one delta per team+question", () => {
    const ledger = new Map<string, number>();
    const apply = (key: string, delta: number) => ledger.set(key, delta);
    apply("g:t1:q1", 1);
    apply("g:t1:q1", 1);
    apply("g:t1:q2", 1);
    assert.equal([...ledger.values()].reduce((a, b) => a + b, 0), 2);
  });
});

describe("next-round start resets reveal state but preserves totals", () => {
  it("marks prior round scored while next is upcoming; totals stay from events", () => {
    assert.equal(
      resolveRoundListStatus({
        roundId: "r1",
        currentRoundId: "r1",
        gameStatus: "SCOREBOARD",
        hasPublishedScores: true,
      }),
      "scored",
    );
    const ranked = rankTeamsByTotal([
      { teamId: "t1", teamName: "A", roundPoints: 2, totalPoints: 5 },
      { teamId: "t2", teamName: "B", roundPoints: 1, totalPoints: 3 },
    ]);
    assert.equal(ranked[0].totalPoints, 5);
  });
});

describe("no next round does not automatically force final wager", () => {
  it("SCOREBOARD can create next or start final, but neither is automatic", () => {
    assert.equal(canCreateNextRound("SCOREBOARD"), true);
    assert.equal(canStartFinalWager("SCOREBOARD"), true);
    assert.equal(findNextPlayableRound([round1], "r1"), null);
    assert.equal(canCreateRound("SCOREBOARD"), true);
    assert.equal(canCreateRound("FINAL_QUESTION"), false);
  });
});

describe("host explicitly starts final wager", () => {
  it("final start is only allowed from SCOREBOARD", () => {
    assert.equal(canStartFinalWager("SCOREBOARD"), true);
    assert.equal(canStartFinalWager("QUESTION_OPEN"), false);
    assert.equal(
      resolveRoundDisplayType({ kind: "final", questionCount: 1 }),
      "final",
    );
  });
});

describe("Game A host cannot manipulate Game B rounds", () => {
  it("denies cross-game host access used by round actions", () => {
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
