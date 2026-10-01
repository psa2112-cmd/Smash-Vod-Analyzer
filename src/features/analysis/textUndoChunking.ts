/** Idle time after which a burst of typing becomes its own undo step. */
export const TEXT_COMMIT_PAUSE_MS = 330;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * True when the edit just finished a word: a single character was appended that is
 * whitespace or punctuation, directly after a letter or number (Google Docs-style chunking).
 */
export function isWordBoundary(previous: string, next: string): boolean {
  if (next.length !== previous.length + 1 || !next.startsWith(previous)) return false;
  const typed = next.at(-1) ?? "";
  const before = previous.at(-1) ?? "";
  return !WORD_CHARACTER.test(typed) && WORD_CHARACTER.test(before);
}
