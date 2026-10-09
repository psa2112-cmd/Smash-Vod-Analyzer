import { useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Upload, Link2, Check, CheckCircle2, AlertCircle, Loader2, X, Film } from "lucide-react";
import {
  ACCEPTED_VIDEO_TYPES,
  detectLinkPlatform,
  formatFileSize,
  formatTimestampInput,
  validateClipRange,
  validateVideoFile,
  type ClipRange,
  type LinkPlatform,
  type ReplaySourceKind,
} from "./replaySource";

export type ReplaySource =
  | { kind: "file"; file: File }
  | { kind: LinkPlatform; url: string; clipRange: ClipRange };

interface ReplayImportPanelProps {
  onAnalyze: (source: ReplaySource) => void | Promise<void>;
  /** 0–100 while the selected video downloads; null/undefined when idle. */
  downloadProgress?: number | null;
}

// ALPHA BUILD: original message was "Paste a YouTube video or Twitch VOD link (twitch.tv/videos/…)."
const LINK_ERROR = "Paste a YouTube video link.";
/** ALPHA BUILD flag: flip to true to allow Twitch VOD imports again. */
const TWITCH_ENABLED = false;
/** ALPHA BUILD flag: flip to true to show the "Full video" checkbox and clip start/end inputs again. */
const CLIP_RANGE_ENABLED: boolean = false;
const TWITCH_DISABLED_ERROR = "Twitch VODs aren't supported in this build yet. Please use a YouTube link or a local video file.";

export function ReplayImportPanel({ onAnalyze, downloadProgress }: ReplayImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [isFullVideo, setIsFullVideo] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { link: useId(), full: useId(), start: useId(), end: useId(), file: useId() };

  const platform = detectLinkPlatform(link);
  // ALPHA BUILD: Twitch VODs are disabled and show an error instead.
  // To re-enable Twitch, set TWITCH_ENABLED to true (original line: `link.trim() && !platform ? LINK_ERROR : null`).
  const isTwitchBlocked = !TWITCH_ENABLED && platform === "twitch";
  const linkError = isTwitchBlocked ? TWITCH_DISABLED_ERROR : link.trim() && !platform ? LINK_ERROR : null;
  const clipResult = platform ? validateClipRange(isFullVideo, startTime, endTime) : null;
  const hasTypedRange = Boolean(startTime.trim() && endTime.trim());
  const clipError = clipResult && !clipResult.ok && hasTypedRange ? clipResult.error : null;

  // While typing, only keep digits and colons — no reformatting, so the cursor never jumps.
  const handleTimeChange = (event: ChangeEvent<HTMLInputElement>, setTime: (value: string) => void) => {
    setTime(event.currentTarget.value.replace(/[^\d:]/g, ""));
  };

  // When the user leaves the field, tidy the time (e.g. "123" becomes "1:23").
  const validateTimeOnBlur = (input: HTMLInputElement, setTime: (value: string) => void) => {
    if (input.value.trim()) setTime(formatTimestampInput(input.value));
    input.setCustomValidity("");
  };

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;
    setLink("");
    const result = validateVideoFile(candidate);
    if (result.ok) { setFile(result.value); setFileError(null); }
    else { setFile(null); setFileError(result.error); }
  };

  const handleLinkChange = (raw: string) => {
    setFile(null);
    setFileError(null);
    const nextPlatform = detectLinkPlatform(raw);
    if (nextPlatform && nextPlatform !== platform) setIsFullVideo(nextPlatform === "youtube");
    setLink(raw);
  };

  // ALPHA BUILD: Twitch links are blocked. To re-enable Twitch, remove `!isTwitchBlocked &&`.
  const acceptedSource: ReplaySource | null = file
    ? { kind: "file", file }
    : !isTwitchBlocked && platform && clipResult?.ok
      ? { kind: platform, url: link.trim(), clipRange: clipResult.value }
      : null;

  const isBusy = isSubmitting || downloadProgress != null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!acceptedSource || isBusy) return;
    setIsSubmitting(true);
    try {
      await onAnalyze(acceptedSource);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  const sourceLabel: Record<ReplaySourceKind, string> = { file: "Local video", youtube: "YouTube", twitch: "Twitch VOD" };
  const inputClass = (hasError: boolean) =>
    `h-11 w-full rounded-md border bg-input/40 px-3 font-mono text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hasError ? "border-destructive" : "border-border"}`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor={ids.link} className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Link2 className="size-4" aria-hidden />
            Video link
            {platform && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">{sourceLabel[platform]}</span>}
          </label>
          <input
            id={ids.link}
            type="url"
            autoComplete="off"
            // ALPHA BUILD: Twitch disabled. Original placeholder: "YouTube or Twitch VOD link"
            placeholder="YouTube video link"
            value={link}
            onChange={(e) => handleLinkChange(e.target.value)}
            aria-invalid={Boolean(linkError)}
            aria-describedby={linkError ? `${ids.link}-error` : undefined}
            className={inputClass(Boolean(linkError))}
          />
          {linkError && <FieldError id={`${ids.link}-error`} message={linkError} />}
        </div>

        {/*
          ALPHA BUILD: the "Full video" checkbox and clip start/end inputs are hidden.
          Links always import the full video (isFullVideo stays true).
          To restore clip trimming, set CLIP_RANGE_ENABLED to true.
        */}
        {CLIP_RANGE_ENABLED && platform && (
          <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4">
            <legend className="sr-only">Download range</legend>
            <label htmlFor={ids.full} className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                id={ids.full}
                type="checkbox"
                checked={isFullVideo}
                onChange={(e) => setIsFullVideo(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-muted text-primary-foreground transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background [&>svg]:opacity-0 peer-checked:border-primary peer-checked:bg-primary peer-checked:[&>svg]:opacity-100"
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </span>
              Full video
            </label>
            {!isFullVideo && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={ids.start} className="mb-1 block text-xs font-medium text-muted-foreground">Start timestamp</label>
                  <input
                    id={ids.start}
                    inputMode="numeric"
                    placeholder="mm:ss or hh:mm:ss"
                    value={startTime}
                    onChange={(e) => handleTimeChange(e, setStartTime)}
                    onBlur={(e) => validateTimeOnBlur(e.currentTarget, setStartTime)}
                    className={inputClass(Boolean(clipError))}
                  />
                </div>
                <div>
                  <label htmlFor={ids.end} className="mb-1 block text-xs font-medium text-muted-foreground">End timestamp</label>
                  <input
                    id={ids.end}
                    inputMode="numeric"
                    placeholder="mm:ss or hh:mm:ss"
                    value={endTime}
                    onChange={(e) => handleTimeChange(e, setEndTime)}
                    onBlur={(e) => validateTimeOnBlur(e.currentTarget, setEndTime)}
                    className={inputClass(Boolean(clipError))}
                  />
                </div>
              </div>
            )}
            {clipError && <FieldError message={clipError} />}
          </fieldset>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <div>
        <input
          ref={fileInputRef}
          id={ids.file}
          type="file"
          accept={ACCEPTED_VIDEO_TYPES.join(",")}
          className="sr-only"
          aria-label="Upload video"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file ? (
          <div className="flex items-center gap-4 rounded-lg border border-primary/50 bg-primary/10 p-4">
            <Film className="size-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Remove selected video"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor={ids.file}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-5 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${
              isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-secondary/50"
            }`}
          >
            <Upload className="size-5 text-primary" aria-hidden />
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Upload a video file</span> · MP4, WebM, MOV, MKV up to 4 GB
            </span>
          </label>
        )}
        {fileError && <FieldError message={fileError} />}
      </div>

      <div aria-live="polite" className="min-h-6">
        {downloadProgress != null ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Downloading video… {downloadProgress}%</p>
            <div role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress} className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${downloadProgress}%` }} />
            </div>
          </div>
        ) : acceptedSource && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            Source accepted · {sourceLabel[acceptedSource.kind]}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!acceptedSource || isBusy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-display text-base font-bold uppercase tracking-wider text-primary-foreground shadow-glow transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isBusy ? "Preparing…" : "Analyze Replay"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-2 flex items-center gap-2 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
