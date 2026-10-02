import { describe, it, expect } from "vitest";
import { detectLinkPlatform, parseClipTimestamp, validateClipRange } from "./replaySource";

describe("detectLinkPlatform", () => {
  it("detects YouTube", () => expect(detectLinkPlatform("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube"));
  it("detects Twitch VODs", () => expect(detectLinkPlatform("twitch.tv/videos/123")).toBe("twitch"));
  it("returns null otherwise", () => expect(detectLinkPlatform("https://vimeo.com/1")).toBeNull());
});

describe("parseClipTimestamp", () => {
  it("parses mm:ss", () => expect(parseClipTimestamp("12:30")).toBe(750));
  it("parses hh:mm:ss", () => expect(parseClipTimestamp("01:45:20")).toBe(6320));
  it.each(["", "1:2", "12:60", "abc", "1:00:00:00"])("rejects %s", (raw) => expect(parseClipTimestamp(raw)).toBeNull());
});

describe("validateClipRange", () => {
  it("returns a full range when full video", () => {
    expect(validateClipRange(true, "", "")).toEqual({ ok: true, value: { isFullVideo: true } });
  });
  it("accepts an ordered range", () => {
    expect(validateClipRange(false, "05:00", "1:10:00")).toEqual({
      ok: true,
      value: { isFullVideo: false, startTimestamp: "05:00", endTimestamp: "1:10:00", startSeconds: 300, endSeconds: 4200 },
    });
  });
  it("rejects end before start", () => expect(validateClipRange(false, "10:00", "05:00").ok).toBe(false));
  it("rejects bad format", () => expect(validateClipRange(false, "5", "10:00").ok).toBe(false));
});
