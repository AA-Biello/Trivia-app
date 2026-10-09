import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sessionOwnsGame } from "@/lib/auth/ownership";
import {
  hashSessionToken,
  sessionTokensEqual,
} from "@/lib/auth/token-crypto";

describe("team-session ownership", () => {
  it("binds authorization to the resolved session game, not a client id", () => {
    const resolvedGameId = "11111111-1111-1111-1111-111111111111";
    const otherGameId = "22222222-2222-2222-2222-222222222222";
    assert.equal(sessionOwnsGame(resolvedGameId, resolvedGameId), true);
    assert.equal(sessionOwnsGame(resolvedGameId, otherGameId), false);
  });

  it("hashes session tokens stably for lookup", () => {
    const token = "test-team-token";
    assert.equal(hashSessionToken(token), hashSessionToken(token));
    assert.notEqual(hashSessionToken(token), token);
    assert.equal(
      sessionTokensEqual(hashSessionToken(token), hashSessionToken(token)),
      true,
    );
  });
});
