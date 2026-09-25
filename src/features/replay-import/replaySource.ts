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
