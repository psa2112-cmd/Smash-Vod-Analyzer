import { useEffect, useRef } from "react";
import type { PlaybackSource } from "./playbackSource";

export interface SeekRequest { time: number; id: number }

interface ReplayMediaPlayerProps {
  source: PlaybackSource;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  seekRequest: SeekRequest;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

/** Streams the replay and follows the workspace's own controls; native controls stay hidden. */
export function ReplayMediaPlayer(props: ReplayMediaPlayerProps) {
  return props.source.kind === "youtube"
    ? <YouTubePlayer {...props} videoId={props.source.videoId} />
    : <FilePlayer {...props} url={props.source.url} />;
}

const MEDIA_CLASS = "block aspect-video h-full w-auto max-w-full bg-video-letterbox";

function FilePlayer({ url, isPlaying, playbackRate, volume, seekRequest, onTimeUpdate, onDurationChange, onEnded, onError }: ReplayMediaPlayerProps & { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.play().catch((error: unknown) => console.warn("[ReplayMediaPlayer] play blocked", error));
    else video.pause();
  }, [isPlaying]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = playbackRate; }, [playbackRate]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume / 100; }, [volume]);
  useEffect(() => { if (videoRef.current) videoRef.current.currentTime = seekRequest.time; }, [seekRequest]);
  return (
    <video
      ref={videoRef}
      src={url}
      aria-label="Replay video"
      className={MEDIA_CLASS}
      playsInline
      onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => onDurationChange(event.currentTarget.duration)}
      onEnded={onEnded}
      onError={() => onError("This video file can't be played. Try an .mp4 or .webm recording.")}
    />
  );
}

// ---- YouTube IFrame API (minimal typed surface) ----
interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}
interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    width: string;
    height: string;
    playerVars: Record<string, number | string>;
    events: { onReady: () => void; onStateChange: (event: { data: number }) => void; onError: (event: { data: number }) => void };
  }) => YouTubePlayerInstance;
}
declare global { interface Window { YT?: YouTubeNamespace; onYouTubeIframeAPIReady?: () => void } }

let youTubeApiPromise: Promise<YouTubeNamespace> | null = null;
function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youTubeApiPromise ??= new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previousReady?.(); if (window.YT) resolve(window.YT); };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => { youTubeApiPromise = null; reject(new Error("YouTube player failed to load")); };
    document.head.appendChild(script);
  });
  return youTubeApiPromise;
}

const YT_ENDED = 0;

function YouTubePlayer({ videoId, isPlaying, playbackRate, volume, seekRequest, onTimeUpdate, onDurationChange, onEnded, onError }: ReplayMediaPlayerProps & { videoId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const latest = useRef({ isPlaying, playbackRate, volume, seekRequest, onTimeUpdate, onDurationChange, onEnded, onError });
  latest.current = { isPlaying, playbackRate, volume, seekRequest, onTimeUpdate, onDurationChange, onEnded, onError };

  useEffect(() => {
    let isCancelled = false;
    let poll: number | undefined;
    const mount = document.createElement("div");
    hostRef.current?.appendChild(mount);
    loadYouTubeApi().then((yt) => {
      if (isCancelled) return;
      const player = new yt.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, start: Math.floor(latest.current.seekRequest.time) },
        events: {
          onReady: () => {
            const state = latest.current;
            player.setPlaybackRate(state.playbackRate);
            player.setVolume(state.volume);
            player.seekTo(state.seekRequest.time, true);
            if (state.isPlaying) player.playVideo(); else player.pauseVideo();
            playerRef.current = player;
            state.onDurationChange(player.getDuration());
            poll = window.setInterval(() => {
              latest.current.onTimeUpdate(player.getCurrentTime());
              const duration = player.getDuration();
              if (duration > 0) latest.current.onDurationChange(duration);
            }, 250);
          },
          onStateChange: (event) => { if (event.data === YT_ENDED) latest.current.onEnded(); },
          onError: (event) => {
            console.error("[ReplayMediaPlayer] YouTube error", event.data);
            latest.current.onError("This YouTube video can't be played here. It may be private or block embedding.");
          },
        },
      });
    }).catch((error: unknown) => {
      console.error("[ReplayMediaPlayer] YouTube API load failed", error);
      latest.current.onError("The YouTube player couldn't load. Check your connection and try again.");
    });
    return () => {
      isCancelled = true;
      window.clearInterval(poll);
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.remove();
    };
  }, [videoId]);

  useEffect(() => { const p = playerRef.current; if (!p) return; if (isPlaying) p.playVideo(); else p.pauseVideo(); }, [isPlaying]);
  useEffect(() => { playerRef.current?.setPlaybackRate(playbackRate); }, [playbackRate]);
  useEffect(() => { playerRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => { playerRef.current?.seekTo(seekRequest.time, true); }, [seekRequest]);

  return <div ref={hostRef} aria-label="YouTube replay video" className={`${MEDIA_CLASS} pointer-events-none [&>iframe]:h-full [&>iframe]:w-full`} />;
}
