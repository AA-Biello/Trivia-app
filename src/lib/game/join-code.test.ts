import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  generateJoinCode,
  isValidJoinCodeFormat,
  normalizeJoinCode,
} from "@/lib/game/join-code";

describe("join code generation", () => {
  it("produces a 6-character code from the safe alphabet", () => {
    let i = 0;
    const bytes = [0, 1, 2, 3, 4, 5];
    const code = generateJoinCode(() => bytes[i++]!);
    assert.equal(code.length, JOIN_CODE_LENGTH);
    assert.equal(
      code,
      bytes.map((b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join(""),
    );
    for (const char of code) {
      assert.ok(JOIN_CODE_ALPHABET.includes(char));
    }
  });

  it("normalizes and validates human input", () => {
    assert.equal(normalizeJoinCode(" ab c12 "), "ABC12");
    assert.equal(isValidJoinCodeFormat("ABC234"), true);
    assert.equal(isValidJoinCodeFormat("ABC23"), false);
    assert.equal(isValidJoinCodeFormat("ABCIO1"), false);
  });
});
