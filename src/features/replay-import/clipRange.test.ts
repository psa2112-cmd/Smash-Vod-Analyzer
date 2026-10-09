import { describe, it, expect } from "vitest";
import { caretForDigitCount, detectLinkPlatform, digitsBefore, formatTimestampInput, parseClipTimestamp, validateClipRange } from "./replaySource";

describe("detectLinkPlatform", () => {
  it("detects YouTube", () => expect(detectLinkPlatform("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube"));
  it("detects Twitch VODs", () => expect(detectLinkPlatform("twitch.tv/videos/123")).toBe("twitch"));
  it("returns null otherwise", () => expect(detectLinkPlatform("https://vimeo.com/1")).toBeNull());
});

describe("formatTimestampInput", () => {
  it("reads digits right to left", () => {
    expect(formatTimestampInput("123")).toBe("1:23");
    expect(formatTimestampInput("1234")).toBe("12:34");
    expect(formatTimestampInput("10203")).toBe("1:02:03");
  });
  it("ignores colons", () => expect(formatTimestampInput("1:00:00")).toBe("1:00:00"));
  it("returns empty for empty input", () => expect(formatTimestampInput("")).toBe(""));
});

describe("timestamp caret", () => {
  it("counts digits before the original caret", () => expect(digitsBefore("12:34", 4)).toBe(3));
  it("places the caret after the same digit following formatting", () => {
    expect(caretForDigitCount("12:34:56", 3)).toBe(4);
    expect(caretForDigitCount("12:34:56", 0)).toBe(0);
    expect(caretForDigitCount("12:34:56", 9)).toBe(8);
  });
});

describe("parseClipTimestamp", () => {
  it("parses mm:ss", () => {
    expect(parseClipTimestamp("12:30")).toBe(750);
    expect(parseClipTimestamp("24:00")).toBe(1440);
    expect(parseClipTimestamp("30:00")).toBe(1800);
  });
  it("parses hh:mm:ss", () => {
    expect(parseClipTimestamp("01:45:20")).toBe(6320);
    expect(parseClipTimestamp("1:00:00")).toBe(3600);
  });
  it("parses unpadded digits", () => {
    expect(parseClipTimestamp("123")).toBe(83);
    expect(parseClipTimestamp("1:23")).toBe(83);
  });
  it.each(["", "abc", "1a2"])("rejects %s", (raw) => expect(parseClipTimestamp(raw)).toBeNull());
});


describe("validateClipRange", () => {
  it("returns a full range when full video", () => {
    expect(validateClipRange(true, "", "")).toEqual({ ok: true, value: { isFullVideo: true } });
  });
  it("accepts an ordered range", () => {
    expect(validateClipRange(false, "05:00", "01:10:00")).toEqual({
      ok: true,
      value: { isFullVideo: false, startTimestamp: "05:00", endTimestamp: "01:10:00", startSeconds: 300, endSeconds: 4200 },
    });
  });
  it("rejects end before start", () => expect(validateClipRange(false, "10:00", "05:00").ok).toBe(false));
  it("rejects bad format", () => expect(validateClipRange(false, "abc", "10:00").ok).toBe(false));
});
