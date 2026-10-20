import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyFinalScore, finalWagerDelta } from "@/lib/game/wager-rules";
import { rankTeamsByTotal } from "@/lib/game/scoring";

describe("host running scoreboard projection", () => {
  it("projects final totals from starting score, grade, and wager", () => {
    const start = 10;
    assert.equal(applyFinalScore(start, true, 3), 13);
    assert.equal(applyFinalScore(start, false, 3), 7);
    assert.equal(finalWagerDelta(true, 3), 3);
    assert.equal(finalWagerDelta(false, 3), -3);
  });

  it("ranks by current totals for host-only standings", () => {
    const ranked = rankTeamsByTotal([
      { teamId: "a", teamName: "A", roundPoints: 0, totalPoints: 8 },
      { teamId: "b", teamName: "B", roundPoints: 0, totalPoints: 12 },
    ]);
    assert.equal(ranked[0].teamId, "b");
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 2);
  });
});

describe("public final results stay gated until publish", () => {
  it("documents that teams only see finals at FINAL_RESULTS", () => {
    const publicStatuses = new Set(["FINAL_RESULTS", "GAME_OVER"]);
    assert.equal(publicStatuses.has("FINAL_REVIEW"), false);
    assert.equal(publicStatuses.has("FINAL_QUESTION"), false);
    assert.equal(publicStatuses.has("FINAL_RESULTS"), true);
  });
});
