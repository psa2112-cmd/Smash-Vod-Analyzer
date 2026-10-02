import { describe, it, expect, vi } from "vitest";
import { VIDEO_STORAGE_FOLDER, buildVideoFileName, downloadReplayVideo } from "./storageAdapter";

describe("video storage", () => {
  it("lives in the user's Videos folder", () => expect(VIDEO_STORAGE_FOLDER).toBe("~/Videos/SmashReplayAnalyzer"));
  it("names YouTube clips by id and range", () => {
    expect(buildVideoFileName("https://youtu.be/dQw4w9WgXcQ", { isFullVideo: false, startSeconds: 300, endSeconds: 600 }))
      .toBe("youtube-dQw4w9WgXcQ-300-600.mp4");
  });
  it("names full Twitch VODs by id", () => {
    expect(buildVideoFileName("https://twitch.tv/videos/987", { isFullVideo: true })).toBe("twitch-987-full.mp4");
  });
  it("reports progress to 100 and returns the stored path", async () => {
    const onProgress = vi.fn();
    const path = await downloadReplayVideo("https://twitch.tv/videos/987", { isFullVideo: true }, onProgress, 0);
    expect(path).toBe("~/Videos/SmashReplayAnalyzer/twitch-987-full.mp4");
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });
});
