/**
 * Desktop bridge injected into the webview by the Tauri backend (lib.rs).
 * Implements the DesktopBridge contract from src/features/desktop/desktopBridge.ts.
 * Loaded before any page code, so window.desktopBridge is always present in the app.
 */
(async () => {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  const { open, save } = window.__TAURI__.dialog;
  const { convertFileSrc } = window.__TAURI__.core;
  const { getCurrentWindow } = window.__TAURI__.window;

  const appWindow = getCurrentWindow();

  window.desktopBridge = {
    isDesktop: true,

    // The Rust side intercepts OS close requests and emits "close-requested".
    // The handler returns false to keep the window open (unsaved changes).
    onCloseRequested(handler) {
      let active = true;
      const unlistenPromise = listen("close-requested", () => {
        if (active && handler() !== false) {
          appWindow.destroy();
        }
      });
      return () => {
        active = false;
        unlistenPromise.then((unlisten) => unlisten());
      };
    },

    // Actually close the window after the user confirms they want to leave.
    confirmClose() {
      appWindow.destroy();
    },

    // Download (and optionally trim) a video via the yt-dlp sidecar.
    // Progress events from Rust are forwarded to onProgress(0-100).
    async downloadVideo({ url, clipRange, onProgress, fileName }) {
      const unlisten = await listen("download-progress", (event) => {
        onProgress(event.payload.percent);
      });
      try {
        const filePath = await invoke("download_video", {
          url,
          fileName,
          startSeconds: clipRange.isFullVideo ? null : clipRange.startSeconds ?? null,
          endSeconds: clipRange.isFullVideo ? null : clipRange.endSeconds ?? null,
        });
        return { filePath };
      } finally {
        unlisten();
      }
    },

    // Convert an absolute disk path into a streamable asset:// URL for <video>.
    getVideoAssetUrl(localPath) {
      return convertFileSrc(localPath);
    },

    fileExists(filePath) {
      return invoke("file_exists", { path: filePath });
    },

    async openFileDialog(options = {}) {
      const selected = await open({
        multiple: false,
        filters: options.filters,
        defaultPath: options.defaultPath,
      });
      return selected ?? null;
    },

    async saveFileDialog(options = {}) {
      const selected = await save({
        filters: options.filters,
        defaultPath: options.defaultPath,
      });
      return selected ?? null;
    },

    readTextFile(filePath) {
      return invoke("read_text_file", { path: filePath });
    },

    writeTextFile(filePath, contents) {
      return invoke("write_text_file", { path: filePath, contents });
    },
  };
})();
