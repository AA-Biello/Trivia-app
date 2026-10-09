import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUniqueViolation } from "@/lib/game/db-errors";
import {
  canAcceptTeamJoins,
  isValidTeamName,
  normalizeTeamName,
} from "@/lib/game/join-rules";
import { GAME_STATUSES } from "@/types/game";

describe("duplicate team rejection signal", () => {
  it("detects Postgres unique_violation codes", () => {
    assert.equal(isUniqueViolation({ code: "23505" }), true);
    assert.equal(isUniqueViolation({ code: "42501" }), false);
    assert.equal(isUniqueViolation(null), false);
  });
});

describe("joining rejected when game is not in LOBBY", () => {
  it("allows joins only in LOBBY", () => {
    assert.equal(canAcceptTeamJoins("LOBBY"), true);
    for (const status of GAME_STATUSES) {
      if (status === "LOBBY") continue;
      assert.equal(
        canAcceptTeamJoins(status),
        false,
        `expected ${status} to reject joins`,
      );
    }
  });
});

describe("team name normalization", () => {
  it("trims and collapses whitespace", () => {
    assert.equal(normalizeTeamName("  Quiz   Night  "), "Quiz Night");
    assert.equal(isValidTeamName("A"), true);
    assert.equal(isValidTeamName("   "), false);
  });
});
