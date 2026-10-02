export type ReplaySourceKind = "file" | "youtube" | "twitch";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_VIDEO_FILE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"] as const;

const YOUTUBE_PATTERN = /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|live\/|shorts\/)|youtu\.be\/)[\w-]{6,}/i;
const TWITCH_VOD_PATTERN = /^(https?:\/\/)?(www\.)?twitch\.tv\/videos\/\d+/i;

function validateUrl(raw: string, pattern: RegExp, label: string, example: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: `Paste a ${label} link.` };
  if (!pattern.test(trimmed)) return { ok: false, error: `That doesn't look like a ${label} link. Try ${example}` };
  return { ok: true, value: trimmed };
}

export const validateYouTubeUrl = (raw: string) =>
  validateUrl(raw, YOUTUBE_PATTERN, "YouTube", "youtube.com/watch?v=…");

export const validateTwitchVodUrl = (raw: string) =>
  validateUrl(raw, TWITCH_VOD_PATTERN, "Twitch VOD", "twitch.tv/videos/…");

export function validateVideoFile(file: File): ValidationResult<File> {
  if (!file.type.startsWith("video/")) return { ok: false, error: "Please choose a video file (MP4, WebM, MOV or MKV)." };
  if (file.size > MAX_VIDEO_FILE_BYTES) return { ok: false, error: "That file is larger than 4 GB." };
  return { ok: true, value: file };
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type LinkPlatform = "youtube" | "twitch";

/** Saved start/end of the downloaded section; shared with the .vodproject replay info. */
export interface ClipRange {
  isFullVideo: boolean;
  startTimestamp?: string;
  endTimestamp?: string;
  startSeconds?: number;
  endSeconds?: number;
}

export function detectLinkPlatform(raw: string): LinkPlatform | null {
  const trimmed = raw.trim();
  if (YOUTUBE_PATTERN.test(trimmed)) return "youtube";
  if (TWITCH_VOD_PATTERN.test(trimmed)) return "twitch";
  return null;
}

/** Parses "mm:ss" or "hh:mm:ss" into seconds; null when malformed. */
export function parseClipTimestamp(raw: string): number | null {
  const parts = raw.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((part, index) => (index === 0 ? /^\d{1,3}$/ : /^\d{2}$/).test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((value) => value > 59)) return null;
  return numbers.reduce((total, value) => total * 60 + value, 0);
}

export function validateClipRange(isFullVideo: boolean, start: string, end: string): ValidationResult<ClipRange> {
  if (isFullVideo) return { ok: true, value: { isFullVideo: true } };
  const startSeconds = parseClipTimestamp(start);
  const endSeconds = parseClipTimestamp(end);
  if (startSeconds === null || endSeconds === null) return { ok: false, error: "Enter start and end times as mm:ss or hh:mm:ss." };
  if (endSeconds <= startSeconds) return { ok: false, error: "The end time must be after the start time." };
  return { ok: true, value: { isFullVideo: false, startTimestamp: start.trim(), endTimestamp: end.trim(), startSeconds, endSeconds } };
}
