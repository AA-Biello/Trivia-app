import "server-only";

import { randomBytes } from "node:crypto";

import { generateJoinCode } from "@/lib/game/join-code";

export function generateSecureJoinCode(): string {
  return generateJoinCode(() => randomBytes(1)[0]!);
}
