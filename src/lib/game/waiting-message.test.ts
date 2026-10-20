import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WAITING_MESSAGE_MAX_LENGTH,
  normalizeWaitingMessage,
  publicWaitingMessageForStatus,
} from "@/lib/game/waiting-message";

describe("normalizeWaitingMessage", () => {
  it("trims blank input to null", () => {
    assert.equal(normalizeWaitingMessage(""), null);
    assert.equal(normalizeWaitingMessage("   "), null);
    assert.equal(normalizeWaitingMessage(null), null);
  });

  it("keeps host message text within the max length", () => {
    assert.equal(
      normalizeWaitingMessage("  Grab a drink — music next  "),
      "Grab a drink — music next",
    );
    const long = "x".repeat(WAITING_MESSAGE_MAX_LENGTH + 40);
    const normalized = normalizeWaitingMessage(long);
    assert.equal(normalized?.length, WAITING_MESSAGE_MAX_LENGTH);
  });

  it("preserves intentional line breaks", () => {
    assert.equal(
      normalizeWaitingMessage("Line one\r\nLine two"),
      "Line one\nLine two",
    );
  });
});

describe("publicWaitingMessageForStatus", () => {
  it("exposes the message only during ROUND_BREAK and ROUND_REVIEW", () => {
    assert.equal(
      publicWaitingMessageForStatus("ROUND_BREAK", "Hang tight"),
      "Hang tight",
    );
    assert.equal(
      publicWaitingMessageForStatus("ROUND_REVIEW", "Hang tight"),
      "Hang tight",
    );
    assert.equal(publicWaitingMessageForStatus("SCOREBOARD", "Hang tight"), null);
    assert.equal(publicWaitingMessageForStatus("QUESTION_OPEN", "Hang tight"), null);
    assert.equal(publicWaitingMessageForStatus("FINAL_REVIEW", "Hang tight"), null);
  });
});
