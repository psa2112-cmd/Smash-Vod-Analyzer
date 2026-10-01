import { useMemo, useRef } from "react";
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
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
  component: AnalyzePage,
});

function AnalyzePage() {
  const navigate = useNavigate();
  const unsavedRef = useRef(false);
  const blocker = useBlocker({ shouldBlockFn: () => unsavedRef.current, enableBeforeUnload: false, withResolver: true });
  const blockedNavigation = useMemo(
    () => (blocker.status === "blocked" ? { proceed: blocker.proceed, cancel: blocker.reset } : null),
    [blocker.status, blocker.proceed, blocker.reset],
  );
  return (
    <AnalysisWorkspace
      onBack={() => void navigate({ to: "/" })}
      onUnsavedChange={(value) => { unsavedRef.current = value; }}
      blockedNavigation={blockedNavigation}
    />
  );
}
