import { isYouTubeUrl } from "./youtubeUrl";
import { parseTimestampInput } from "@/features/analysis/inlineEditing";
export { formatTimestampInput } from "@/features/analysis/inlineEditing";

export type ReplaySourceKind = "file" | "youtube" | "twitch";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_VIDEO_FILE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"] as const;

// YouTube link recognition is shared via youtubeUrl.ts; Twitch keeps its own pattern.
const TWITCH_VOD_PATTERN = /^(https?:\/\/)?(www\.)?twitch\.tv\/videos\/\d+/i;

function validateUrl(raw: string, isValid: (url: string) => boolean, label: string, example: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: `Paste a ${label} link.` };
  if (!isValid(trimmed)) return { ok: false, error: `That doesn't look like a ${label} link. Try ${example}` };
  return { ok: true, value: trimmed };
}

export const validateYouTubeUrl = (raw: string) =>
  validateUrl(raw, isYouTubeUrl, "YouTube", "youtube.com/watch?v=…");

export const validateTwitchVodUrl = (raw: string) =>
  validateUrl(raw, (url) => TWITCH_VOD_PATTERN.test(url), "Twitch VOD", "twitch.tv/videos/…");

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
  if (isYouTubeUrl(trimmed)) return "youtube";
  if (TWITCH_VOD_PATTERN.test(trimmed)) return "twitch";
  return null;
}

export function digitsBefore(text: string, pos: number): number {
  return text.slice(0, pos).replace(/\D/g, "").length;
}

export function caretForDigitCount(formatted: string, count: number): number {
  if (count === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted.charAt(i))) seen++;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}

/** Allowed characters while typing a time: digits and colons only. */
const DOWNLOAD_TIME_PATTERN = /^[\d:]+$/;

/** Reads a typed time ("123", "1:23", "1:02:03") into seconds; null when nothing usable was typed. */
export function parseClipTimestamp(raw: string): number | null {
  if (!DOWNLOAD_TIME_PATTERN.test(raw.trim())) return null;
  return parseTimestampInput(raw);
}

export function validateClipRange(isFullVideo: boolean, start: string, end: string): ValidationResult<ClipRange> {
  if (isFullVideo) return { ok: true, value: { isFullVideo: true } };
  const startSeconds = parseClipTimestamp(start);
  const endSeconds = parseClipTimestamp(end);
  if (startSeconds === null || endSeconds === null) return { ok: false, error: "Enter start and end times as mm:ss or hh:mm:ss." };
  if (endSeconds <= startSeconds) return { ok: false, error: "The end time must be after the start time." };
  return { ok: true, value: { isFullVideo: false, startTimestamp: start.trim(), endTimestamp: end.trim(), startSeconds, endSeconds } };
}
