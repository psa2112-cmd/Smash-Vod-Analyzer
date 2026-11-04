import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayMediaPlayer } from "./ReplayMediaPlayer";

const callbacks = {
  onTimeUpdate: vi.fn(), onDurationChange: vi.fn(), onEnded: vi.fn(), onError: vi.fn(),
};
const props = {
  ...callbacks, isPlaying: false, playbackRate: 1, volume: 72,
  seekRequest: { time: 17, id: 1 }, initialTime: 42,
};

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.YT; });

describe("ReplayMediaPlayer playback continuity", () => {
  it("opens a file at the current playhead, not an old seek, and still accepts new seeks", () => {
    const source = { kind: "file" as const, url: "blob:replay" };
    const { rerender } = render(<ReplayMediaPlayer {...props} source={source} />);
    const video = screen.getByLabelText<HTMLVideoElement>("Replay video");
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);
    video.currentTime = 48;
    rerender(<ReplayMediaPlayer {...props} initialTime={48} source={source} />);
    expect(video.currentTime).toBe(48);
    rerender(<ReplayMediaPlayer {...props} initialTime={48} seekRequest={{ time: 10, id: 2 }} source={source} />);
    expect(video.currentTime).toBe(10);
  });

  it("recreates YouTube at the current playhead and still accepts new seeks", async () => {
    const seekTo = vi.fn();
    const starts: unknown[] = [];
    window.YT = { Player: class {
      constructor(_element: HTMLElement, options: { playerVars: Record<string, number | string>; events: { onReady: () => void } }) {
        starts.push(options.playerVars["start"]);
        queueMicrotask(options.events.onReady);
      }
      playVideo = vi.fn(); pauseVideo = vi.fn(); seekTo = seekTo;
      setPlaybackRate = vi.fn(); setVolume = vi.fn(); destroy = vi.fn();
      getCurrentTime = () => 42; getDuration = () => 224;
    } };
    const source = { kind: "youtube" as const, videoId: "test-video" };
    const { rerender } = render(<ReplayMediaPlayer {...props} source={source} />);
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(42, true));
    expect(starts).toEqual([42]);
    rerender(<ReplayMediaPlayer {...props} initialTime={48} source={source} />);
    expect(seekTo).toHaveBeenCalledTimes(1);
    rerender(<ReplayMediaPlayer {...props} initialTime={48} seekRequest={{ time: 10, id: 2 }} source={source} />);
    expect(seekTo).toHaveBeenLastCalledWith(10, true);
  });
});