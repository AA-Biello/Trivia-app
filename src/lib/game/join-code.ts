/** Ambiguous characters (0/O, 1/I/L) omitted for pub-friendly codes. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const JOIN_CODE_LENGTH = 6;

export function normalizeJoinCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidJoinCodeFormat(code: string): boolean {
  if (code.length !== JOIN_CODE_LENGTH) {
    return false;
  }
  for (const char of code) {
    if (!JOIN_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

/**
 * Build a join code from a byte source.
 * Server callers should pass crypto.randomBytes; tests can inject a stub.
 */
export function generateJoinCode(nextByte: () => number): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[nextByte() % JOIN_CODE_ALPHABET.length];
  }
  return code;
}
