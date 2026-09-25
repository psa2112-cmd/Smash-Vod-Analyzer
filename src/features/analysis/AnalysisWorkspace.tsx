import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Columns2,
  Eye,
  EyeOff,
  Filter,
  ListFilter,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import gameplayImage from "@/assets/analysis-gameplay.jpg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  INITIAL_ANALYSIS_EVENTS,
  MANUAL_EVENT_TYPES,
  STARTER_TAGS,
  applyEventFilters,
  formatTimestamp,
  seekTimeForEvent,
  sortAnalysisEvents,
  type AnalysisEvent,
  type AnalysisEventType,
  type EventFilters,
  type QuickFilter,
  type SortDirection,
  type SortKey,
} from "./analysisData";

const VIDEO_DURATION = 224;
const NOTES_KEY = "smash-replay-match-notes";
const LAYOUT_KEY = "smash-replay-workspace-layout";

interface WorkspaceLayout {
  vertical: Record<string, number>;
  review: Record<string, number>;
  lower: Record<string, number>;
  notesVisible: boolean;
  filtersVisible: boolean;
  isSwapped: boolean;
}

const DEFAULT_LAYOUT: WorkspaceLayout = {
  vertical: { video: 34, review: 66 },
  review: { table: 60, utilities: 40 },
  lower: { notes: 45, filters: 55 },
  notesVisible: true,
  filtersVisible: true,
  isSwapped: false,
};

function readStoredLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const stored = window.localStorage.getItem(LAYOUT_KEY);
    if (!stored) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(stored) as Partial<WorkspaceLayout>;
    return {
      ...DEFAULT_LAYOUT,
      ...parsed,
      vertical: parsed.vertical && !Array.isArray(parsed.vertical) ? parsed.vertical : DEFAULT_LAYOUT.vertical,
      review: parsed.review && !Array.isArray(parsed.review) ? parsed.review : DEFAULT_LAYOUT.review,
      lower: parsed.lower && !Array.isArray(parsed.lower) ? parsed.lower : DEFAULT_LAYOUT.lower,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(layout: WorkspaceLayout) {
  if (typeof window !== "undefined") window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

export function AnalysisWorkspace({ onBack }: { onBack?: () => void }) {
  const [events, setEvents] = useState(INITIAL_ANALYSIS_EVENTS);
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedEventId, setSelectedEventId] = useState<string | null>("evt-1");
  const [currentTime, setCurrentTime] = useState(17);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(72);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [notes, setNotes] = useState("");
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isManualEventOpen, setIsManualEventOpen] = useState(false);
  const [manualEventType, setManualEventType] = useState<AnalysisEventType>("Neutral Win");
  const [manualNote, setManualNote] = useState("");
  const [manualTags, setManualTags] = useState<string[]>([]);

  useEffect(() => {
    setLayout(readStoredLayout());
    setNotes(window.localStorage.getItem(NOTES_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setCurrentTime((time) => {
        if (time >= VIDEO_DURATION) {
          setIsPlaying(false);
          return VIDEO_DURATION;
        }
        return time + 1;
      });
    }, 1000 / playbackRate);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackRate]);

  const visibleEvents = useMemo(
    () => sortAnalysisEvents(applyEventFilters(events, filters), sortKey, sortDirection),
    [events, filters, sortDirection, sortKey],
  );

  const setAndSaveLayout = (nextLayout: WorkspaceLayout) => {
    setLayout(nextLayout);
    saveLayout(nextLayout);
  };

  const jumpToEvent = (event: AnalysisEvent) => {
    setCurrentTime(seekTimeForEvent(event.timestamp));
    setSelectedEventId(event.id);
    setIsPlaying(true);
  };

  const updateEvent = (id: string, updates: Partial<AnalysisEvent>) => {
    setEvents((current) => current.map((event) => (event.id === id ? { ...event, ...updates } : event)));
  };

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const addManualEvent = () => {
    const previousTimestamp = [...events].sort((left, right) => right.timestamp - left.timestamp).find((event) => event.timestamp <= currentTime)?.timestamp;
    const event: AnalysisEvent = {
      id: `manual-${Date.now()}`,
      eventType: manualEventType,
      character: null,
      timestamp: Math.floor(currentTime),
      damage: null,
      direction: null,
      tags: manualTags,
      note: manualNote.trim(),
      secondsSincePrevious: previousTimestamp === undefined ? null : Math.max(0, Math.floor(currentTime - previousTimestamp)),
    };
    setEvents((current) => [...current, event]);
    setFilters(DEFAULT_FILTERS);
    setSelectedEventId(event.id);
    setManualNote("");
    setManualTags([]);
    setIsManualEventOpen(false);
  };

  const togglePanel = (panel: "notes" | "filters") => {
    const next = panel === "notes"
      ? { ...layout, notesVisible: !layout.notesVisible }
      : { ...layout, filtersVisible: !layout.filtersVisible };
    setAndSaveLayout(next);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <main className="flex min-h-screen min-w-[1024px] flex-col bg-background text-foreground">
        <WorkspaceHeader
          eventCount={events.length}
          layout={layout}
          onBack={onBack}
          onAddEvent={() => setIsManualEventOpen(true)}
          onToggleNotes={() => togglePanel("notes")}
          onToggleFilters={() => togglePanel("filters")}
          controlsVisible={controlsVisible}
          onToggleControls={() => setControlsVisible((visible) => !visible)}
          onSwap={() => setAndSaveLayout({ ...layout, isSwapped: !layout.isSwapped })}
          onReset={() => setAndSaveLayout(DEFAULT_LAYOUT)}
        />

        <div className="h-[max(1250px,145vh)] shrink-0">
        <ResizablePanelGroup
          key={`vertical-${JSON.stringify(layout.vertical)}`}
          orientation="vertical"
          defaultLayout={layout.vertical}
          onLayoutChanged={(sizes) => setAndSaveLayout({ ...layout, vertical: sizes })}
          className="min-h-0"
        >
          <ResizablePanel id="video" minSize={200}>
            <VideoReviewPanel
              currentTime={currentTime}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              volume={volume}
              onPlayToggle={() => setIsPlaying((playing) => !playing)}
              onSeek={setCurrentTime}
              onVolumeChange={setVolume}
              onPlaybackRateChange={setPlaybackRate}
              controlsVisible={controlsVisible}
            />
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize video and review" />
          <ResizablePanel id="review" minSize={580}>
            <ResizablePanelGroup
              key={`review-${JSON.stringify(layout.review)}-${layout.notesVisible}-${layout.filtersVisible}`}
              orientation="vertical"
              defaultLayout={layout.review}
              onLayoutChanged={(sizes) => setAndSaveLayout({ ...layout, review: sizes })}
            >
              <ResizablePanel id="table" minSize={260}>
              <EventTablePanel
                events={visibleEvents}
                totalCount={events.length}
                selectedEventId={selectedEventId}
                filters={filters}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onFiltersChange={setFilters}
                onSort={changeSort}
                onJump={jumpToEvent}
                onUpdate={updateEvent}
                onDelete={(id) => setEvents((current) => current.filter((event) => event.id !== id))}
                onAddEvent={() => setIsManualEventOpen(true)}
              />
              </ResizablePanel>
              <ResizableHandle withHandle aria-label="Resize event table and lower panels" />
              <ResizablePanel id="utilities" minSize={180}>
                <div className="h-full min-h-0 border-t border-border">
                  {layout.notesVisible && layout.filtersVisible ? (
                    <ResizablePanelGroup
                      key={`lower-${JSON.stringify(layout.lower)}-${layout.isSwapped}`}
                      orientation="horizontal"
                      defaultLayout={layout.lower}
                      onLayoutChanged={(sizes) => setAndSaveLayout({ ...layout, lower: sizes })}
                    >
                      <ResizablePanel id={layout.isSwapped ? "filters" : "notes"} minSize="25%">
                        {layout.isSwapped ? (
                          <FilterPanel filters={filters} events={events} onChange={setFilters} />
                        ) : (
                          <NotesPanel notes={notes} onChange={setNotes} />
                        )}
                      </ResizablePanel>
                      <ResizableHandle withHandle />
                      <ResizablePanel id={layout.isSwapped ? "notes" : "filters"} minSize="30%">
                        {layout.isSwapped ? (
                          <NotesPanel notes={notes} onChange={setNotes} />
                        ) : (
                          <FilterPanel filters={filters} events={events} onChange={setFilters} />
                        )}
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : layout.notesVisible ? (
                    <NotesPanel notes={notes} onChange={setNotes} />
                  ) : (
                    <FilterPanel filters={filters} events={events} onChange={setFilters} />
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
        </div>

        <ManualEventDialog
          open={isManualEventOpen}
          timestamp={currentTime}
          eventType={manualEventType}
          note={manualNote}
          selectedTags={manualTags}
          onOpenChange={setIsManualEventOpen}
          onEventTypeChange={setManualEventType}
          onNoteChange={setManualNote}
          onTagsChange={setManualTags}
          onSave={addManualEvent}
        />
      </main>
    </TooltipProvider>
  );
}

function WorkspaceHeader({ eventCount, layout, controlsVisible, onBack, onAddEvent, onToggleNotes, onToggleFilters, onToggleControls, onSwap, onReset }: {
  eventCount: number;
  layout: WorkspaceLayout;
  controlsVisible: boolean;
  onBack: (() => void) | undefined;
  onAddEvent: () => void;
  onToggleNotes: () => void;
  onToggleFilters: () => void;
  onToggleControls: () => void;
  onSwap: () => void;
  onReset: () => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-4">
        {onBack ? (
          <Button variant="ghost" size="icon" aria-label="Back to import" onClick={onBack}><ArrowLeft /></Button>
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label="Back to import">
            <Link to="/"><ArrowLeft /></Link>
          </Button>
        )}
        <div className="h-6 w-px bg-border" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-sm font-semibold">Mario vs. Pikachu · Battlefield</h1>
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Analysis complete</Badge>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">Grand Finals · Game 3 · {eventCount} review events</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={onAddEvent}><Plus /> Add event</Button>
        <div className="mx-2 h-6 w-px bg-border" />
        <IconTip label={controlsVisible ? "Hide video controls" : "Show video controls"} onClick={onToggleControls}>
          {controlsVisible ? <EyeOff /> : <Eye />}
        </IconTip>
        <IconTip label={layout.notesVisible ? "Hide match notes" : "Show match notes"} onClick={onToggleNotes}>
          {layout.notesVisible ? <EyeOff /> : <Eye />}
        </IconTip>
        <IconTip label={layout.filtersVisible ? "Hide filters" : "Show filters"} onClick={onToggleFilters}>
          <Filter />
        </IconTip>
        <IconTip label="Swap lower panels" onClick={onSwap}><Columns2 /></IconTip>
        <IconTip label="Reset layout" onClick={onReset}><RotateCcw /></IconTip>
      </div>
    </header>
  );
}

function IconTip({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function VideoReviewPanel({ currentTime, isPlaying, playbackRate, volume, controlsVisible, onPlayToggle, onSeek, onVolumeChange, onPlaybackRateChange }: {
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  controlsVisible: boolean;
  onPlayToggle: () => void;
  onSeek: (value: number) => void;
  onVolumeChange: (value: number) => void;
  onPlaybackRateChange: (value: number) => void;
}) {
  const rates = [0.5, 0.75, 1, 1.25, 1.5];
  const playerRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen();
    } catch (error) {
      console.error("Could not change replay fullscreen mode", error);
    }
  };
  return (
    <section ref={playerRef} aria-label="Video player" className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-video-letterbox fullscreen:h-screen">
      <img src={gameplayImage} alt="Replay frame showing two fighters on a tournament stage" width={1920} height={1080} className="block h-full max-h-full w-full max-w-full object-contain" />
      <div className="pointer-events-none absolute inset-0 bg-video-shade" />
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <Badge className="bg-background/85 text-foreground shadow-none">GAME 3</Badge>
        <Badge variant="outline" className="border-primary/40 bg-background/70 text-primary">Battlefield</Badge>
      </div>
      {controlsVisible && <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-12">
        <Slider aria-label="Video timeline" value={[currentTime]} min={0} max={VIDEO_DURATION} step={1} onValueChange={(value) => onSeek(value[0] ?? 0)} />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onPlayToggle} aria-label={isPlaying ? "Pause replay" : "Play replay"} className="bg-background/55 hover:bg-background/80">
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <span data-testid="playhead-time" className="w-24 font-mono text-xs">{formatTimestamp(currentTime)} / {formatTimestamp(VIDEO_DURATION)}</span>
          <Volume2 className="size-4 text-muted-foreground" aria-hidden />
          <Slider aria-label="Volume" className="w-24" value={[volume]} min={0} max={100} onValueChange={(value) => onVolumeChange(value[0] ?? 0)} />
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Playback speed" className="font-mono text-xs">{playbackRate}×</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={String(playbackRate)} onValueChange={(value) => onPlaybackRateChange(Number(value))}>
                  {rates.map((rate) => <DropdownMenuRadioItem key={rate} value={String(rate)}>{rate}×</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen preview" : "Fullscreen preview"}>{isFullscreen ? <Minimize2 /> : <Maximize2 />}</Button>
          </div>
        </div>
      </div>}
    </section>
  );
}

function EventTablePanel({ events, totalCount, selectedEventId, filters, sortKey, sortDirection, onFiltersChange, onSort, onJump, onUpdate, onDelete, onAddEvent }: {
  events: AnalysisEvent[];
  totalCount: number;
  selectedEventId: string | null;
  filters: EventFilters;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onFiltersChange: (filters: EventFilters) => void;
  onSort: (key: SortKey) => void;
  onJump: (event: AnalysisEvent) => void;
  onUpdate: (id: string, updates: Partial<AnalysisEvent>) => void;
  onDelete: (id: string) => void;
  onAddEvent: () => void;
}) {
  return (
    <section aria-label="Analysis event table" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <h2 className="font-display text-sm font-semibold">Detected events</h2>
          <span className="font-mono text-xs text-muted-foreground">{events.length}/{totalCount}</span>
        </div>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search events and notes" value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="Search notes, tags, events…" className="h-8 pl-8 text-xs" />
        </div>
        <Button variant="outline" size="sm" onClick={onAddEvent}><Plus /> Add</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1150px] table-fixed text-xs">
          <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
            <tr className="border-b border-border">
              <SortableHeader label="Event type" sortKey="eventType" currentKey={sortKey} direction={sortDirection} onSort={onSort} className="w-40" />
              <SortableHeader label="Character" sortKey="character" currentKey={sortKey} direction={sortDirection} onSort={onSort} className="w-24" />
              <SortableHeader label="Timestamp" sortKey="timestamp" currentKey={sortKey} direction={sortDirection} onSort={onSort} className="w-28" />
              <SortableHeader label="Damage" sortKey="damage" currentKey={sortKey} direction={sortDirection} onSort={onSort} className="w-20" />
              <th className="w-20 px-3 py-2 text-left font-medium">Direction</th>
              <th className="w-52 px-3 py-2 text-left font-medium">Tags</th>
              <th className="px-3 py-2 text-left font-medium">Note</th>
              <SortableHeader label="Since prev." sortKey="secondsSincePrevious" currentKey={sortKey} direction={sortDirection} onSort={onSort} className="w-24" />
              <th className="w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <EventRow key={event.id} event={event} selected={selectedEventId === event.id} onJump={() => onJump(event)} onUpdate={(updates) => onUpdate(event.id, updates)} onDelete={() => onDelete(event.id)} />
            ))}
          </tbody>
        </table>
        {events.length === 0 && (
          <div className="grid h-40 place-items-center text-center">
            <div><ListFilter className="mx-auto mb-2 size-5 text-primary" /><p className="font-medium">No matching events</p><p className="mt-1 text-xs text-muted-foreground">Adjust or reset the filters to see more moments.</p></div>
          </div>
        )}
      </div>
    </section>
  );
}

function SortableHeader({ label, sortKey, currentKey, direction, onSort, className }: { label: string; sortKey: SortKey; currentKey: SortKey; direction: SortDirection; onSort: (key: SortKey) => void; className?: string }) {
  const active = currentKey === sortKey;
  return (
    <th className={cn("px-2 py-1 text-left font-medium", className)}>
      <Button variant="ghost" size="sm" className={cn("h-7 px-1.5 text-xs text-muted-foreground", active && "text-primary")} onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`}>
        {label}{active ? direction === "asc" ? <ArrowUp /> : <ArrowDown /> : null}
      </Button>
    </th>
  );
}

function EventRow({ event, selected, onJump, onUpdate, onDelete }: { event: AnalysisEvent; selected: boolean; onJump: () => void; onUpdate: (updates: Partial<AnalysisEvent>) => void; onDelete: () => void }) {
  return (
    <tr className={cn("border-b border-border/70 transition-colors hover:bg-secondary/35", selected && "bg-primary/8 shadow-[inset_2px_0_var(--color-primary)]")}>
      <td className="px-3 py-2"><span className={cn("font-medium", event.eventType === "Hit Received" && "text-destructive", event.eventType === "Hit Dealt" && "text-success")}>{event.eventType}</span></td>
      <td className="px-3 py-2 text-muted-foreground">{event.character ?? "—"}</td>
      <td className="px-3 py-2"><Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-primary" onClick={onJump} aria-label={`Jump to ${formatTimestamp(event.timestamp)}`}><Play />{formatTimestamp(event.timestamp)}</Button></td>
      <td className="px-3 py-2 font-mono">{event.damage === null ? "—" : `${event.damage.toFixed(1)}%`}</td>
      <td className="px-3 py-2 text-muted-foreground">{event.direction ?? "—"}</td>
      <td className="px-3 py-2"><InlineTags tags={event.tags} onChange={(tags) => onUpdate({ tags })} /></td>
      <td className="px-3 py-2"><input aria-label={`Edit note at ${formatTimestamp(event.timestamp)}`} value={event.note} onChange={(changeEvent) => onUpdate({ note: changeEvent.target.value })} className="h-7 w-full min-w-40 rounded border border-transparent bg-transparent px-2 text-xs outline-none hover:border-border focus:border-primary focus:bg-input/40" /></td>
      <td className="px-3 py-2 font-mono text-muted-foreground">{event.secondsSincePrevious === null ? "—" : `${event.secondsSincePrevious.toFixed(1)}s`}</td>
      <td className="pr-2"><Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label={`Delete event at ${formatTimestamp(event.timestamp)}`}><Trash2 /></Button></td>
    </tr>
  );
}

function InlineTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <div className="flex flex-wrap gap-1 rounded border border-primary/40 bg-card p-1.5">
      {STARTER_TAGS.map((tag) => (
         <Button key={tag} variant={tags.includes(tag) ? "default" : "ghost"} aria-pressed={tags.includes(tag)} size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => onChange(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}>{tag}</Button>
      ))}
      <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditing(false)} aria-label="Close tag editor"><X /></Button>
    </div>
  ) : (
    <Button variant="ghost" className="h-auto min-h-7 w-full justify-start whitespace-normal px-1 py-1" onClick={() => setEditing(true)} aria-label="Edit tags">
      <span className="flex flex-wrap gap-1">{tags.length ? tags.map((tag) => <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">{tag}</Badge>) : <span className="text-muted-foreground">Add tags</span>}</span>
    </Button>
  );
}

function NotesPanel({ notes, onChange }: { notes: string; onChange: (value: string) => void }) {
  const saveNotes = (value: string) => {
    onChange(value);
    if (typeof window !== "undefined") window.localStorage.setItem(NOTES_KEY, value);
  };
  return (
    <section className="flex h-full min-h-0 flex-col bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="font-display text-sm font-semibold">Match notes</h2><p className="text-[11px] text-muted-foreground">High-level patterns across the set</p></div>
        <span className="text-[10px] text-success">Saved locally</span>
      </div>
      <Textarea aria-label="Match notes" value={notes} onChange={(event) => saveNotes(event.target.value)} placeholder="What patterns are showing up?&#10;&#10;• Panicking in the corner&#10;• Missing kill confirms&#10;• Winning neutral, losing advantage" className="min-h-0 flex-1 resize-none border-border bg-background/45 text-xs leading-5" />
    </section>
  );
}

function FilterPanel({ filters, events, onChange }: { filters: EventFilters; events: AnalysisEvent[]; onChange: (filters: EventFilters) => void }) {
  const quickFilters: { value: QuickFilter; label: string }[] = [
    { value: "received", label: "Hits Received" }, { value: "dealt", label: "Hits Dealt" }, { value: "manual", label: "Manual Events" }, { value: "untagged", label: "Untagged" }, { value: "high-damage", label: "High Damage" },
  ];
  const eventTypes = Array.from(new Set(events.map((event) => event.eventType)));
  const characters = Array.from(new Set(events.map((event) => event.character).filter((character): character is string => Boolean(character))));
  return (
    <section className="h-full min-h-0 overflow-auto bg-card/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="flex items-center gap-2 font-display text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />Filters</h2><p className="text-[11px] text-muted-foreground">Updates the table instantly</p></div>
        <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_FILTERS)} aria-label="Reset filters"><RotateCcw /> Reset</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {quickFilters.map((quick) => <Button key={quick.value} variant={filters.quickFilter === quick.value ? "secondary" : "outline"} size="sm" className="h-7 px-2 text-[11px]" onClick={() => onChange({ ...filters, quickFilter: filters.quickFilter === quick.value ? "all" : quick.value })}>{quick.label}</Button>)}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FilterSelect label="Event type" value={filters.eventType} options={eventTypes} onChange={(value) => onChange({ ...filters, eventType: value })} />
        <FilterSelect label="Character" value={filters.character} options={characters} onChange={(value) => onChange({ ...filters, character: value })} />
        <FilterSelect label="Tag" value={filters.tag} options={STARTER_TAGS} onChange={(value) => onChange({ ...filters, tag: value })} />
        <NumberFilter label="Min damage %" value={filters.minDamage} onChange={(value) => onChange({ ...filters, minDamage: value })} />
        <NumberFilter label="Max damage %" value={filters.maxDamage === 999 ? 50 : filters.maxDamage} onChange={(value) => onChange({ ...filters, maxDamage: value })} />
        <NumberFilter label="Min time since hit" value={filters.minElapsed} onChange={(value) => onChange({ ...filters, minElapsed: value })} />
      </div>
    </section>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="text-[10px] font-medium uppercase text-muted-foreground">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"><option value="all">All</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}

function NumberFilter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-[10px] font-medium uppercase text-muted-foreground">{label}<Input type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-8 text-xs" /></label>;
}

function ManualEventDialog({ open, timestamp, eventType, note, selectedTags, onOpenChange, onEventTypeChange, onNoteChange, onTagsChange, onSave }: {
  open: boolean;
  timestamp: number;
  eventType: AnalysisEventType;
  note: string;
  selectedTags: string[];
  onOpenChange: (open: boolean) => void;
  onEventTypeChange: (eventType: AnalysisEventType) => void;
  onNoteChange: (note: string) => void;
  onTagsChange: (tags: string[]) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-xl">
        <DialogHeader><DialogTitle>Add manual event</DialogTitle><DialogDescription>Capture a meaningful moment at the current playhead.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="text-xs font-medium text-muted-foreground">Timestamp<Input value={formatTimestamp(timestamp)} disabled className="mt-1 font-mono" /></label>
            <label className="text-xs font-medium text-muted-foreground">Event type<select aria-label="Event type" value={eventType} onChange={(event) => onEventTypeChange(event.target.value as AnalysisEventType)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">{MANUAL_EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          </div>
           <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">Tags</legend><div className="flex flex-wrap gap-1.5">{STARTER_TAGS.map((tag) => <Button key={tag} type="button" variant={selectedTags.includes(tag) ? "default" : "outline"} aria-pressed={selectedTags.includes(tag)} size="sm" onClick={() => onTagsChange(selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag])}>{tag}</Button>)}</div></fieldset>
          <label className="text-xs font-medium text-muted-foreground">Event note<Textarea aria-label="Event note" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="What happened, and what should you do next time?" className="mt-1 min-h-24" /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave}>Save event</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}