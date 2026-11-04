import { describe, expect, it } from "vitest";
import { formatTimestampString, handleArrowDown, handleArrowLeft, handleArrowRight, handleArrowUp, parseCharacterInput, parseDamageInput, parseTimestampInput, sanitizeTimestampInput, toArrowKey } from "./inlineEditing";

describe("timestamp input controls", () => {
  it("keeps only digits and colons in typed or pasted text", () => {
    expect(sanitizeTimestampInput("1a2b3")).toBe("123");
    expect(sanitizeTimestampInput("abc123")).toBe("123");
    expect(sanitizeTimestampInput(" 1:02:03% ")).toBe("1:02:03");
  });
  it("maps WASD to the matching arrows without changing other keys", () => {
    expect(toArrowKey("w")).toBe("ArrowUp");
    expect(toArrowKey("A")).toBe("ArrowLeft");
    expect(toArrowKey("s")).toBe("ArrowDown");
    expect(toArrowKey("D")).toBe("ArrowRight");
    expect(toArrowKey("Enter")).toBe("Enter");
    expect(toArrowKey("ArrowDown")).toBe("ArrowDown");
  });
});

describe("inline editing parsers", () => {
  it("reads timestamps right to left", () => {
    expect(formatTimestampString("1")).toBe("0:01");
    expect(formatTimestampString("12")).toBe("0:12");
    expect(formatTimestampString("123")).toBe("1:23");
    expect(formatTimestampString("1234")).toBe("12:34");
    expect(formatTimestampString("1:02:03")).toBe("1:02:03");
    expect(formatTimestampString("")).toBe("0:00");
    expect(parseTimestampInput("123")).toBe(83);
    expect(parseTimestampInput("02:15")).toBe(135);
    expect(parseTimestampInput("10203")).toBe(3723);
    expect(parseTimestampInput("ab")).toBeNull();
    expect(formatTimestampString("8000")).toBe("1:20:00");
  });
  it("parses damage with % tolerance", () => {
    expect(parseDamageInput("14.24%")).toBe(14.2);
    expect(parseDamageInput(" 9 ")).toBe(9);
    expect(parseDamageInput("-3")).toBeNull();
    expect(parseDamageInput("abc")).toBeNull();
    expect(parseDamageInput("")).toBeNull();
  });
  it("normalizes character text", () => {
    expect(parseCharacterInput("  Mario ")).toBe("Mario");
    expect(parseCharacterInput("   ")).toBeNull();
  });
});

describe("tag grid arrow navigation", () => {
  // Two rows: [0,1,2] at top 0, [3,4] at top 30
  const grid = [{ top: 0, left: 0 }, { top: 0, left: 80 }, { top: 0, left: 160 }, { top: 30, left: 0 }, { top: 30, left: 90 }];
  it("moves left and right with wrap-around", () => {
    expect(handleArrowRight(1, 5)).toBe(2);
    expect(handleArrowRight(4, 5)).toBe(0);
    expect(handleArrowLeft(0, 5)).toBe(4);
  });
  it("moves down to the nearest tag below, or leaves past the bottom row", () => {
    expect(handleArrowDown(grid, 1)).toBe(4);
    expect(handleArrowDown(grid, 2)).toBe(4);
    expect(handleArrowDown(grid, 3)).toBe("after");
  });
  it("moves up to the nearest tag above, or leaves past the top row", () => {
    expect(handleArrowUp(grid, 4)).toBe(1);
    expect(handleArrowUp(grid, 0)).toBe("before");
  });
});
