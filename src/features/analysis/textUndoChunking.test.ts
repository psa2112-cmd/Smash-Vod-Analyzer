import { describe, expect, it } from "vitest";
import { TEXT_COMMIT_PAUSE_MS, isWordBoundary } from "./textUndoChunking";

describe("isWordBoundary", () => {
  it("detects a space, punctuation, or newline after a word", () => {
    expect(isWordBoundary("hello", "hello ")).toBe(true);
    expect(isWordBoundary("hello", "hello.")).toBe(true);
    expect(isWordBoundary("hello", "hello\n")).toBe(true);
  });
  it("ignores letters, repeated separators, deletions, and pastes", () => {
    expect(isWordBoundary("hell", "hello")).toBe(false);
    expect(isWordBoundary("hello ", "hello  ")).toBe(false);
    expect(isWordBoundary("hello ", "hello")).toBe(false);
    expect(isWordBoundary("", "two words ")).toBe(false);
  });
  it("uses a 330ms pause", () => expect(TEXT_COMMIT_PAUSE_MS).toBe(330));
});
