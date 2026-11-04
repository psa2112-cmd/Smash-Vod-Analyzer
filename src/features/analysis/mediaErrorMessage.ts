/** Turns a browser MediaError into a specific, user-friendly explanation. */
export function describeMediaError(error: MediaError | null): string {
  const detail = error?.message ? ` (Details: ${error.message})` : "";
  switch (error?.code) {
    case 1:
      return `Loading the video was stopped before it finished. Try opening it again.${detail}`;
    case 2:
      return `The video file couldn't be read. It may have been moved, deleted, or is still being written.${detail}`;
    case 3:
      return `The browser couldn't decode this video. The file may be damaged, use an unsupported profile (e.g. H.264 High 4:4:4 or 10-bit), or have an unsupported audio track. Try re-exporting as H.264 (8-bit, yuv420p) with AAC audio.${detail}`;
    case 4:
      return `This video format or codec isn't supported by the browser. Use an .mp4 (H.264 + AAC) or .webm recording, or remux it in OBS.${detail}`;
    default:
      return `This video file can't be played. Try an .mp4 or .webm recording.${detail}`;
  }
}
