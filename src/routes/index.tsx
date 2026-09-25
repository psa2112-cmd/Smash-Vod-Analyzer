import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ReplayImportPanel, type ReplaySource } from "@/features/replay-import/ReplayImportPanel";

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
  const [lastSource, setLastSource] = useState<ReplaySource | null>(null);

  const handleAnalyze = async (source: ReplaySource) => {
    console.info("[home] analyze requested", { kind: source.kind });
    await new Promise((resolve) => setTimeout(resolve, 600));
    // Processing page is the next module; hand-off wired once approved.
    setLastSource(source);
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
          <ReplayImportPanel onAnalyze={handleAnalyze} />
        </section>
        {lastSource && (
          <p role="status" className="mt-4 text-center text-sm text-muted-foreground">
            Ready to analyze. The progress screen comes in the next step.
          </p>
        )}
      </div>
    </main>
  );
}
