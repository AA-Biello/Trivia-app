export const WAITING_MESSAGE_MAX_LENGTH = 280;

/**
 * Normalize host-entered waiting copy for storage / broadcast.
 * Blank or whitespace-only becomes null (app shows default copy).
 */
export function normalizeWaitingMessage(value: unknown): string | null {
  const raw = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return null;
  if (raw.length > WAITING_MESSAGE_MAX_LENGTH) {
    return raw.slice(0, WAITING_MESSAGE_MAX_LENGTH);
  }
  return raw;
}

/** Public payload includes waitingMessage only for round break/review. */
export function publicWaitingMessageForStatus(
  status: string,
  stored: string | null | undefined,
): string | null {
  if (status !== "ROUND_BREAK" && status !== "ROUND_REVIEW") {
    return null;
  }
  return stored ?? null;
}
