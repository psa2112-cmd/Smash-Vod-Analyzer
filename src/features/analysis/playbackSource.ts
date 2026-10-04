import type { ProjectReplayInfo } from "./projectFile";
import { getDesktopBridge } from "@/features/desktop/desktopBridge";

/** A replay source the in-app player can actually stream. */
export type PlaybackSource =
  | { kind: "youtube"; videoId: string }
  | { kind: "file"; url: string };

const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;

/** In-memory registry of local files picked this session (path → playable blob URL). */
const localVideoUrls = new Map<string, string>();

export function extractYouTubeId(url: string): string | null {
  return url.match(YOUTUBE_ID_PATTERN)?.[1] ?? null;
}

/** Makes a locally picked file playable for the rest of the session. */
export function registerLocalVideo(videoPath: string, file: Blob): void {
  const previous = localVideoUrls.get(videoPath);
  if (previous) URL.revokeObjectURL(previous);
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
      return { kind: "file", url: await bridge.getVideoAssetUrl(replay.videoPath) };
    } catch (error) {
      console.warn("[playbackSource] desktop could not provide the video; trying other sources", error);
    }
  }
  return resolvePlaybackSource(replay);
}
