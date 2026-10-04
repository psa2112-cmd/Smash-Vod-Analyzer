import { describe, expect, it } from "vitest";
import { extractYouTubeId, registerLocalVideo, resolvePlaybackSource } from "./playbackSource";

describe("playback source", () => {
  it("extracts YouTube ids from common link shapes", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=30")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeId("https://twitch.tv/videos/123")).toBeNull();
  });

  it("resolves a YouTube replay from its original link", () => {
    expect(resolvePlaybackSource({ videoPath: "~/Videos/x.mp4", originalUrl: "https://youtu.be/dQw4w9WgXcQ" })).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  it("resolves a registered local file and returns null for unknown paths", () => {
    URL.createObjectURL = () => "blob:test";
    registerLocalVideo("set.mp4", new Blob(["x"]));
    expect(resolvePlaybackSource({ videoPath: "set.mp4" })?.kind).toBe("file");
    expect(resolvePlaybackSource({ videoPath: "missing.mp4" })).toBeNull();
  });
});
