/**
 * The "desktop bridge" is the single doorway between the app's screens and the
 * desktop (Tauri) side of the app.
 *
 * - In the Tauri desktop app, the desktop side puts an object on
 *   `window.desktopBridge` that can really download videos, read files, etc.
 * - In a normal browser, `window.desktopBridge` is missing, so the app falls
 *   back to browser-friendly behaviour instead.
 *
 * Every optional method (marked with `?`) can be left out. The app checks for
 * each one before using it, so a half-finished desktop build still works.
 */

/** Which part of a video to download: the whole thing, or a start/end range in seconds. */
export interface DownloadClipRange { isFullVideo: boolean; startSeconds?: number; endSeconds?: number }

/** Filters shown in a file dialog, e.g. { name: "Replay project", extensions: ["vodproject"] }. */
export interface FileDialogOptions { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }

export interface DesktopBridge {
  /** True when running inside the desktop app. */
  isDesktop: boolean;
  /** Ask to be told when the user tries to close the window. Return false from the handler to keep it open. Returns a function that stops listening. */
  onCloseRequested(handler: () => boolean): (() => void) | void;
  /** Actually close the window (used after the user confirms they want to leave). */
  confirmClose(): void;
  /** Download (and optionally trim) a YouTube/Twitch video to disk, reporting progress 0–100. `fileName` is the suggested name inside the app's video folder. */
  downloadVideo?(params: { url: string; clipRange: DownloadClipRange; onProgress: (percent: number) => void; fileName?: string }): Promise<{ filePath: string }>;
  /** Turn a file path on disk into a link the video player can play. */
  getVideoAssetUrl?(localPath: string): string | Promise<string>;
  /** Check whether a file still exists on disk. */
  fileExists?(filePath: string): Promise<boolean>;
  /** Show the system "Open file" window. Returns the chosen path, or null if cancelled. */
  openFileDialog?(options?: FileDialogOptions): Promise<string | null>;
  /** Show the system "Save file" window. Returns the chosen path, or null if cancelled. */
  saveFileDialog?(options?: FileDialogOptions): Promise<string | null>;
  /** Read a text file from disk. */
  readTextFile?(filePath: string): Promise<string>;
  /** Write a text file to disk. */
  writeTextFile?(filePath: string, contents: string): Promise<void>;
}

declare global { interface Window { desktopBridge?: DesktopBridge } }

/** Returns the desktop bridge if we're in the desktop app, otherwise null. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge ?? null;
}

/** True only inside the desktop app. */
export function isDesktopEnvironment(): boolean {
  return Boolean(getDesktopBridge()?.isDesktop);
}
