import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ReplayImportPanel, type ReplaySource } from "@/features/replay-import/ReplayImportPanel";
import { downloadReplayVideo, setPendingReplay } from "@/features/analysis/storageAdapter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Replay Analyzer — Smash Ultimate VOD Review" },
      { name: "description", content: "Import a Smash Ultimate replay, YouTube video or Twitch VOD and jump straight to every hit." },
      { property: "og:title", content: "Replay Analyzer — Smash Ultimate VOD Review" },
      { property: "og:description", content: "Turn long Smash Ultimate VODs into timestamped, taggable review moments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const navigate = useNavigate();

  const handleAnalyze = async (source: ReplaySource) => {
    console.info("[home] analyze requested", { kind: source.kind });
    try {
      if (source.kind === "file") {
        setPendingReplay({ videoPath: source.file.name, title: source.file.name });
      } else {
        setDownloadProgress(0);
        const videoPath = await downloadReplayVideo(source.url, source.clipRange, setDownloadProgress);
        const platformName = source.kind === "youtube" ? "YouTube" : "Twitch VOD";
        setPendingReplay({ videoPath, title: `${platformName} replay`, originalUrl: source.url, clipRange: source.clipRange });
      }
      await navigate({ to: "/analyze" });
    } catch (error) {
      console.error("[home] import failed", error);
      toast.error("The video couldn't be downloaded. Check the link and try again.");
    } finally {
      setDownloadProgress(null);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-stage" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <header className="mb-10">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.35em] text-primary">Smash Ultimate · VOD Review</p>
          <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
            Replay <span className="text-primary">Analyzer</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Drop in a match. We find every hit and give you timestamps to jump, tag and learn from.
          </p>
        </header>
        <section aria-label="Import replay" className="rounded-xl border border-border bg-card/80 p-6 shadow-panel backdrop-blur">
          <ReplayImportPanel onAnalyze={handleAnalyze} downloadProgress={downloadProgress} />
        </section>
      </div>
    </main>
  );
}
