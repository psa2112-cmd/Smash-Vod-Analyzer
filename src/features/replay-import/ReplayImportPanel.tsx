import { useId, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Upload, Youtube, Twitch, CheckCircle2, AlertCircle, Loader2, X, Film } from "lucide-react";
import {
  ACCEPTED_VIDEO_TYPES,
  formatFileSize,
  validateTwitchVodUrl,
  validateVideoFile,
  validateYouTubeUrl,
  type ReplaySourceKind,
} from "./replaySource";

export type ReplaySource =
  | { kind: "file"; file: File }
  | { kind: "youtube"; url: string }
  | { kind: "twitch"; url: string };

interface ReplayImportPanelProps {
  onAnalyze: (source: ReplaySource) => void | Promise<void>;
}

type FieldState = { value: string; error: string | null };
const emptyField: FieldState = { value: "", error: null };

export function ReplayImportPanel({ onAnalyze }: ReplayImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [youtube, setYoutube] = useState<FieldState>(emptyField);
  const [twitch, setTwitch] = useState<FieldState>(emptyField);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { yt: useId(), tw: useId(), file: useId() };

  const clearAll = () => {
    setFile(null);
    setFileError(null);
    setYoutube(emptyField);
    setTwitch(emptyField);
  };

  const acceptFile = (candidate: File | undefined) => {
    if (!candidate) return;
    clearAll();
    const result = validateVideoFile(candidate);
    if (result.ok) setFile(result.value);
    else setFileError(result.error);
  };

  const handleUrlChange = (kind: "youtube" | "twitch", raw: string) => {
    setFile(null);
    setFileError(null);
    const validate = kind === "youtube" ? validateYouTubeUrl : validateTwitchVodUrl;
    const result = raw.trim() ? validate(raw) : null;
    const next: FieldState = { value: raw, error: result && !result.ok ? result.error : null };
    if (kind === "youtube") {
      setYoutube(next);
      setTwitch(emptyField);
    } else {
      setTwitch(next);
      setYoutube(emptyField);
    }
  };

  const acceptedSource: ReplaySource | null = file
    ? { kind: "file", file }
    : youtube.value.trim() && !youtube.error
      ? { kind: "youtube", url: youtube.value.trim() }
      : twitch.value.trim() && !twitch.error
        ? { kind: "twitch", url: twitch.value.trim() }
        : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!acceptedSource || isSubmitting) return;
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Upload */}
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
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${
              isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-secondary/50"
            }`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary transition-transform group-hover:scale-110">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="font-display text-lg font-semibold uppercase tracking-wide">Upload video</span>
            <span className="text-sm text-muted-foreground">Drag a file here or click to browse · MP4, WebM, MOV, MKV up to 4 GB</span>
          </label>
        )}
        {fileError && <FieldError message={fileError} />}
      </div>

      <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <UrlField
        id={ids.yt}
        label="YouTube URL"
        placeholder="https://youtube.com/watch?v=…"
        icon={<Youtube className="size-4" aria-hidden />}
        field={youtube}
        onChange={(v) => handleUrlChange("youtube", v)}
      />
      <UrlField
        id={ids.tw}
        label="Twitch VOD URL"
        placeholder="https://twitch.tv/videos/…"
        icon={<Twitch className="size-4" aria-hidden />}
        field={twitch}
        onChange={(v) => handleUrlChange("twitch", v)}
      />

      <div aria-live="polite" className="min-h-6">
        {acceptedSource && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            Source accepted · {sourceLabel[acceptedSource.kind]}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!acceptedSource || isSubmitting}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-display text-base font-bold uppercase tracking-wider text-primary-foreground shadow-glow transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Preparing…" : "Analyze Replay"}
      </button>
    </form>
  );
}

function UrlField(props: {
  id: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  field: FieldState;
  onChange: (value: string) => void;
}) {
  const errorId = `${props.id}-error`;
  return (
    <div>
      <label htmlFor={props.id} className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {props.icon}
        {props.label}
      </label>
      <input
        id={props.id}
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder={props.placeholder}
        value={props.field.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={Boolean(props.field.error)}
        aria-describedby={props.field.error ? errorId : undefined}
        className={`h-11 w-full rounded-md border bg-input/40 px-3 font-mono text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          props.field.error ? "border-destructive" : "border-border"
        }`}
      />
      {props.field.error && <FieldError id={errorId} message={props.field.error} />}
    </div>
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
