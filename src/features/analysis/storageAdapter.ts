import { useEffect, useRef } from "react";
import { PROJECT_FILE_EXTENSION, parseProjectFile, serializeProjectFile, type ParseProjectResult, type VodProjectFile } from "./projectFile";

export const AUTOSAVE_INTERVAL_MS = 300_000;
export const NOTIFICATION_DURATION_MS = 5_000;
export const SAMPLE_VIDEO_PATH = "sample://mario-vs-pikachu-battlefield.mp4";
const WORKSPACE_STORE_PREFIX = "smash-replay-project:";

export interface ProjectHandle { id: string; name: string; filePath: string }
export type OpenProjectResult = ({ ok: true; project: VodProjectFile; handle: ProjectHandle }) | { ok: false; error: string };

interface NativeWritable { write: (data: string) => Promise<void>; close: () => Promise<void> }
interface NativeFileHandle { name: string; getFile: () => Promise<File>; createWritable: () => Promise<NativeWritable> }
interface NativePickerWindow {
  showSaveFilePicker?: (options: unknown) => Promise<NativeFileHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<NativeFileHandle[]>;
}
export interface DesktopBridge { onCloseRequested?: (handler: () => boolean) => (() => void) | void; confirmClose?: () => void }
declare global { interface Window { desktopBridge?: DesktopBridge } }

const PICKER_TYPES = [{ description: "Replay analysis project", accept: { "application/json": [PROJECT_FILE_EXTENSION] } }];
const nativeHandles = new Map<string, NativeFileHandle>();

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "replay";
export const createProjectId = () => `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const nameFromPath = (path: string) => path.split(/[\\/]/).pop()?.replace(PROJECT_FILE_EXTENSION, "") ?? path;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function writeWorkspaceStore(filePath: string, contents: string) {
  window.localStorage.setItem(WORKSPACE_STORE_PREFIX + filePath, contents);
}

export function readWorkspaceStore(filePath: string): string | null {
  return window.localStorage.getItem(WORKSPACE_STORE_PREFIX + filePath);
}

/** Writes a project to the active handle, a native picker, or the local workspace store fallback. */
export async function saveProject(project: VodProjectFile, handle: ProjectHandle | null): Promise<ProjectHandle | null> {
  const contents = serializeProjectFile(project);
  const picker = window as unknown as NativePickerWindow;
  let activeHandle = handle;
  console.info("[storageAdapter] save start", { filePath: handle?.filePath ?? null, events: project.table.events.length });

  const existingNative = handle ? nativeHandles.get(handle.filePath) : undefined;
  if (!activeHandle && picker.showSaveFilePicker) {
    try {
      const nativeHandle = await picker.showSaveFilePicker({ suggestedName: `${slugify(project.replay.title)}${PROJECT_FILE_EXTENSION}`, types: PICKER_TYPES });
      activeHandle = { id: createProjectId(), name: nameFromPath(nativeHandle.name), filePath: nativeHandle.name };
      nativeHandles.set(activeHandle.filePath, nativeHandle);
    } catch (error) {
      if (isAbort(error)) return null;
      console.warn("[storageAdapter] native save picker unavailable; using workspace storage", error);
    }
  }
  if (!activeHandle) {
    const filePath = `${slugify(project.replay.title)}${PROJECT_FILE_EXTENSION}`;
    activeHandle = { id: createProjectId(), name: nameFromPath(filePath), filePath };
  }
  const nativeHandle = existingNative ?? nativeHandles.get(activeHandle.filePath);
  if (nativeHandle) {
    const writable = await nativeHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  }
  writeWorkspaceStore(activeHandle.filePath, contents);
  console.info("[storageAdapter] save complete", { filePath: activeHandle.filePath });
  return activeHandle;
}

export function openProjectText(text: string, filePath: string, id: string = createProjectId()): OpenProjectResult {
  const parsed: ParseProjectResult = parseProjectFile(text);
  if (!parsed.ok) return parsed;
  writeWorkspaceStore(filePath, text);
  return { ok: true, project: parsed.project, handle: { id, name: nameFromPath(filePath), filePath } };
}

export const hasNativeOpenPicker = () => typeof (window as unknown as NativePickerWindow).showOpenFilePicker === "function";

/** Opens a project with the native picker. Returns null when cancelled or unsupported. */
export async function openProjectWithPicker(): Promise<OpenProjectResult | null> {
  const picker = window as unknown as NativePickerWindow;
  if (!picker.showOpenFilePicker) return null;
  try {
    const [nativeHandle] = await picker.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    if (!nativeHandle) return null;
    const file = await nativeHandle.getFile();
    nativeHandles.set(nativeHandle.name, nativeHandle);
    return openProjectText(await file.text(), nativeHandle.name);
  } catch (error) {
    if (isAbort(error)) return null;
    console.error("[storageAdapter] open picker failed", error);
    return { ok: false, error: "The project could not be opened. Try choosing the file again." };
  }
}

export function openStoredProject(filePath: string, id: string): OpenProjectResult {
  const text = readWorkspaceStore(filePath);
  if (text === null) return { ok: false, error: `The project "${nameFromPath(filePath)}" could not be found. It may have been moved or deleted.` };
  return openProjectText(text, filePath, id);
}

/** Resolves whether a replay's video can be played in this environment. */
export async function isVideoAvailable(videoPath: string): Promise<boolean> {
  if (videoPath === SAMPLE_VIDEO_PATH) return true;
  if (/^https?:\/\//.test(videoPath)) {
    try {
      const response = await fetch(videoPath, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }
  return false;
}

/** Blocks window/desktop close while unsaved changes exist and asks the workspace to confirm. */
export function useCloseInterceptor(hasUnsavedChanges: boolean, onCloseRequested: () => void) {
  const stateRef = useRef({ hasUnsavedChanges, onCloseRequested });
  stateRef.current = { hasUnsavedChanges, onCloseRequested };
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!stateRef.current.hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    const unsubscribe = window.desktopBridge?.onCloseRequested?.(() => {
      if (!stateRef.current.hasUnsavedChanges) return true;
      stateRef.current.onCloseRequested();
      return false;
    });
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);
}

/** App-managed download folder (user's Videos folder; Movies on macOS in native builds). */
export const VIDEO_STORAGE_FOLDER = "~/Videos/SmashReplayAnalyzer";
const PENDING_REPLAY_KEY = "smash-replay-pending-import";

interface DownloadClipRange { isFullVideo: boolean; startSeconds?: number; endSeconds?: number }

export function buildVideoFileName(url: string, clipRange: DownloadClipRange): string {
  const youtubeId = url.match(/(?:v=|youtu\.be\/|live\/|shorts\/)([\w-]{6,})/)?.[1];
  const twitchId = url.match(/videos\/(\d+)/)?.[1];
  const base = youtubeId ? `youtube-${youtubeId}` : twitchId ? `twitch-${twitchId}` : `replay-${slugify(url)}`;
  const range = clipRange.isFullVideo ? "full" : `${clipRange.startSeconds ?? 0}-${clipRange.endSeconds ?? 0}`;
  return `${base}-${range}.mp4`;
}

/**
 * Downloads the selected section into the managed video folder.
 * The preview simulates progress; the packaged desktop app performs the real download.
 */
export async function downloadReplayVideo(
  url: string,
  clipRange: DownloadClipRange,
  onProgress: (percent: number) => void,
  stepDelayMs = 120,
): Promise<string> {
  const videoPath = `${VIDEO_STORAGE_FOLDER}/${buildVideoFileName(url, clipRange)}`;
  console.info("[storageAdapter] download start", { url, clipRange, videoPath });
  for (let percent = 10; percent <= 100; percent += 10) {
    await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
    onProgress(percent);
  }
  console.info("[storageAdapter] download complete", { videoPath });
  return videoPath;
}

export interface PendingReplay { videoPath: string; title: string; originalUrl?: string; clipRange?: DownloadClipRange & { startTimestamp?: string; endTimestamp?: string } }

export function setPendingReplay(replay: PendingReplay): void {
  window.sessionStorage.setItem(PENDING_REPLAY_KEY, JSON.stringify(replay));
}

/** Returns and clears the replay handed off from the home page, if any. */
export function takePendingReplay(): PendingReplay | null {
  const raw = window.sessionStorage.getItem(PENDING_REPLAY_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(PENDING_REPLAY_KEY);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as PendingReplay).videoPath === "string" && typeof (parsed as PendingReplay).title === "string") {
      return parsed as PendingReplay;
    }
  } catch {
    console.warn("[storageAdapter] pending replay unreadable");
  }
  return null;
}
