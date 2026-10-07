/**
 * Single source of truth for recognizing YouTube links and pulling the
 * 11-character video id out of them. Used by replay-import validation,
 * playback source resolution, and download file naming.
 */
const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/;

/** Returns the 11-character video id from any common YouTube link shape, or null. */
export function extractYouTubeId(url: string): string | null {
  return url.match(YOUTUBE_ID_PATTERN)?.[1] ?? null;
}

/** True when the text is a recognizable YouTube video link. */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

/**
 * Looks up a YouTube video's real title using YouTube's free public oEmbed
 * endpoint (no API key). Returns null if the link is invalid or the lookup fails,
 * so callers can fall back to a generic title.
 */
export async function fetchYouTubeTitle(url: string): Promise<string | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  try {
    const watchUrl = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const response = await fetch(`https://www.youtube.com/oembed?url=${watchUrl}&format=json`);
    if (!response.ok) {
      console.warn("[youtubeUrl] title lookup failed", { videoId, status: response.status });
      return null;
    }
    const data: unknown = await response.json();
    const title = typeof data === "object" && data !== null && "title" in data ? (data as { title: unknown }).title : null;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch (error) {
    console.warn("[youtubeUrl] title lookup error", { videoId, error });
    return null;
  }
}
