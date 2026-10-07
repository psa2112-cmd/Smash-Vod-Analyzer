import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { loadRecentProjects, type RecentProject } from "@/features/analysis/projectFile";
import { toast } from "sonner";
import { ReplayImportPanel, type ReplaySource } from "@/features/replay-import/ReplayImportPanel";
import { canDownloadVideos, downloadReplayVideo, hasNativeOpenPicker, openProjectText, openProjectWithPicker, openStoredProject, setPendingProject, setPendingReplay, type OpenProjectResult } from "@/features/analysis/storageAdapter";
import { registerLocalVideo } from "@/features/analysis/playbackSource";
import { fetchYouTubeTitle } from "@/features/replay-import/youtubeUrl";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  useEffect(() => setRecentProjects(loadRecentProjects()), []);

  const handleOpenResult = (result: OpenProjectResult | null) => {
    if (!result) return;
    if (!result.ok) { toast.error(result.error); return; }
    setPendingProject(result.handle, result.project);
    void navigate({ to: "/analyze" });
  };
  const openProject = () => {
    if (hasNativeOpenPicker()) void openProjectWithPicker().then(handleOpenResult);
    else fileInputRef.current?.click();
  };
  const openRecentProject = (project: RecentProject) => void openStoredProject(project.filePath, project.id).then(handleOpenResult);
  const onProjectFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      handleOpenResult(openProjectText(await file.text(), file.name));
    } catch (error) {
      console.error("[home] reading project file failed", error);
      toast.error("The project file could not be read. Try choosing it again.");
    }
  };

  const handleAnalyze = async (source: ReplaySource) => {
    console.info("[home] analyze requested", { kind: source.kind });
    try {
      if (source.kind === "file") {
        registerLocalVideo(source.file.name, source.file);
        setPendingReplay({ videoPath: source.file.name, title: source.file.name });
      } else {
        const platformName = source.kind === "youtube" ? "YouTube" : "Twitch VOD";
        // Grab the real video title; fall back to a generic one if the lookup fails.
        const fetchedTitle = source.kind === "youtube" ? await fetchYouTubeTitle(source.url) : null;
        const title = fetchedTitle ?? `${platformName} replay`;
        let videoPath = source.url;
        // Only the desktop app can really download, so only it shows the progress bar.
        // In the browser we skip straight to the analysis page and stream the video.
        if (canDownloadVideos()) {
          setDownloadProgress(0);
          videoPath = await downloadReplayVideo(source.url, source.clipRange, setDownloadProgress, undefined, fetchedTitle ?? undefined);
        }
        setPendingReplay({ videoPath, title, originalUrl: source.url, clipRange: source.clipRange });
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
            Drop in a match. Create timestamps to jump, tag and learn from. 
          </p>
          <div className="mt-2 text-sm font-medium text-destructive">
            <p>This is an alpha build. Some features are unsuporrted. There are also probably bugs.</p>
            <h2 className="mt-3 text-base font-semibold">Unsupported/unfinished features:</h2>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Twitch VOD Support</li>
              <li>Event filters (but sorting the table does work)</li>
            </ul>
          </div>
        </header>
        <section aria-label="Import replay" className="rounded-xl border border-border bg-card/80 p-6 shadow-panel backdrop-blur">
          <ReplayImportPanel onAnalyze={handleAnalyze} downloadProgress={downloadProgress} />
        </section>
        <section aria-label="Open existing project" className="mt-4 flex flex-wrap gap-3 rounded-xl border border-border bg-card/80 p-4 shadow-panel backdrop-blur">
          <Button variant="outline" className="flex-1" onClick={openProject}><FolderOpen /> Open from disk</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="flex-1"><History /> Recently opened</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {recentProjects.length === 0 ? (
                <DropdownMenuItem disabled>No recent projects</DropdownMenuItem>
              ) : recentProjects.map((project) => (
                <DropdownMenuItem key={project.id} onSelect={() => openRecentProject(project)} className="flex-col items-start gap-0">
                  <span className="text-sm">{project.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{project.filePath}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInputRef} type="file" accept=".vodproject,application/json" className="hidden" onChange={onProjectFileChosen} />
        </section>
      </div>
    </main>
  );
}
