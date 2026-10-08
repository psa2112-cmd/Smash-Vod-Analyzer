import type { ProjectReplayInfo } from "./projectFile";
import { getDesktopBridge } from "@/features/desktop/desktopBridge";
import { extractYouTubeId } from "@/features/replay-import/youtubeUrl";

/** A replay source the in-app player can actually stream. */
export type PlaybackSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "file"; url: string };

// YouTube link parsing lives in replay-import/youtubeUrl.ts (shared with
// link validation and download file naming); re-exported for existing imports.
export { extractYouTubeId };

/** In-memory registry of local files picked this session (path → playable blob URL). */
const localVideoUrls = new Map<string, string>();

/** Releases every local video held in memory. */
export function revokeAllLocalVideos(): void {
  for (const url of localVideoUrls.values()) URL.revokeObjectURL(url);
  localVideoUrls.clear();
}

/** Makes a locally picked file playable; only the newest file is kept in memory. */
export function registerLocalVideo(videoPath: string, file: Blob): void {
  revokeAllLocalVideos();
  localVideoUrls.set(videoPath, URL.createObjectURL(file));
}

export function resolvePlaybackSource(replay: Pick<ProjectReplayInfo, "videoPath" | "originalUrl">): PlaybackSource | null {
  const localUrl = localVideoUrls.get(replay.videoPath);
  if (localUrl) return { kind: "file", url: localUrl };
  const videoId = extractYouTubeId(replay.originalUrl ?? "") ?? extractYouTubeId(replay.videoPath);
  if (videoId) return { kind: "youtube", videoId };
  return null;
}

/** True for paths that point to a file on the computer, e.g. "~/Videos/..." or "C:\\...". */
const isLocalFilePath = (path: string) => /^(~|\/|[A-Za-z]:[\\/])/.test(path);

/**
 * Same as resolvePlaybackSource, but in the desktop app it can also play
 * downloaded files from disk by asking the desktop side for a playable link.
 */
export async function resolvePlaybackSourceAsync(replay: Pick<ProjectReplayInfo, "videoPath" | "originalUrl">): Promise<PlaybackSource | null> {
  const bridge = getDesktopBridge();
  if (bridge?.getVideoAssetUrl && isLocalFilePath(replay.videoPath) && !localVideoUrls.has(replay.videoPath)) {
    try {
      // A missing file on disk falls through to the YouTube stream (if the replay has one).
      const exists = bridge.fileExists ? await bridge.fileExists(replay.videoPath) : true;
      if (exists) return { kind: "file", url: await bridge.getVideoAssetUrl(replay.videoPath) };
    } catch (error) {
      console.warn("[playbackSource] desktop could not provide the video; trying other sources", error);
    }
  }
  return resolvePlaybackSource(replay);
}
