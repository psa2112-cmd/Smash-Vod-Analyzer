import { describe, it, expect } from "vitest";
import { validateYouTubeUrl, validateTwitchVodUrl, validateVideoFile, MAX_VIDEO_FILE_BYTES } from "./replaySource";

describe("validateYouTubeUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ&t=30",
  ])("accepts %s", (url) => {
    expect(validateYouTubeUrl(url)).toEqual({ ok: true, value: expect.any(String) });
  });
  it("rejects empty", () => expect(validateYouTubeUrl("  ").ok).toBe(false));
  it("rejects non-youtube", () => expect(validateYouTubeUrl("https://vimeo.com/123").ok).toBe(false));
});

describe("validateTwitchVodUrl", () => {
  it("accepts a VOD url", () => expect(validateTwitchVodUrl("https://www.twitch.tv/videos/123456789").ok).toBe(true));
  it("rejects a channel url", () => expect(validateTwitchVodUrl("https://twitch.tv/somechannel").ok).toBe(false));
});

describe("validateVideoFile", () => {
  const makeFile = (type: string, size = 10) => {
    const f = new File(["x"], "clip", { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  it("accepts mp4", () => expect(validateVideoFile(makeFile("video/mp4")).ok).toBe(true));
  it("rejects non-video", () => expect(validateVideoFile(makeFile("image/png")).ok).toBe(false));
  it("rejects too large", () => expect(validateVideoFile(makeFile("video/mp4", MAX_VIDEO_FILE_BYTES + 1)).ok).toBe(false));
});
