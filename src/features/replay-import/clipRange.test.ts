import { describe, it, expect } from "vitest";
import { caretForDigitCount, detectLinkPlatform, digitsBefore, formatTimestampInput, parseClipTimestamp, validateClipRange } from "./replaySource";

describe("detectLinkPlatform", () => {
  it("detects YouTube", () => expect(detectLinkPlatform("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube"));
  it("detects Twitch VODs", () => expect(detectLinkPlatform("twitch.tv/videos/123")).toBe("twitch"));
  it("returns null otherwise", () => expect(detectLinkPlatform("https://vimeo.com/1")).toBeNull());
});

describe("formatTimestampInput", () => {
  it("groups digits as mm:ss", () => expect(formatTimestampInput("1230")).toBe("12:30"));
  it("inserts a colon after every two digits while typing", () => {
    expect(formatTimestampInput("123")).toBe("12:3");
    expect(formatTimestampInput("12345")).toBe("12:34:5");
    expect(formatTimestampInput("123456")).toBe("12:34:56");
  });
  it("ignores stray non-digit characters", () => expect(formatTimestampInput("1a2b3")).toBe("12:3"));
  it("caps at hh:mm:ss length", () => expect(formatTimestampInput("1234567")).toBe("12:34:56"));
  it("regroups values typed with colons", () => expect(formatTimestampInput("1:00:00")).toBe("10:00:0"));
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
  it("parses mm:ss", () => expect(parseClipTimestamp("12:30")).toBe(750));
  it("parses hh:mm:ss", () => expect(parseClipTimestamp("01:45:20")).toBe(6320));
  it.each(["", "1:2", "1:00:00", "24:00", "12:60", "abc", "1:00:00:00"])("rejects %s", (raw) => expect(parseClipTimestamp(raw)).toBeNull());
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
  it("rejects bad format", () => expect(validateClipRange(false, "5", "10:00").ok).toBe(false));
});
