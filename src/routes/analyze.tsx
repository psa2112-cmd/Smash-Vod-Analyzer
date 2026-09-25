import { createFileRoute } from "@tanstack/react-router";
import { AnalysisWorkspace } from "@/features/analysis/AnalysisWorkspace";

export const Route = createFileRoute("/analyze")({
  head: () => ({
    meta: [
      { title: "Analysis Workspace — Replay Analyzer" },
      { name: "description", content: "Review timestamped Smash Ultimate interactions, notes, tags, and gameplay patterns." },
      { property: "og:title", content: "Analysis Workspace — Replay Analyzer" },
      { property: "og:description", content: "A focused workspace for reviewing timestamped Smash Ultimate gameplay moments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalysisWorkspace,
});