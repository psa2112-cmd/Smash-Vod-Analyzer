import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Columns2,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
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
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  DEFAULT_TABLE_PREFERENCES,
  INITIAL_ANALYSIS_EVENTS,
  MANUAL_EVENT_TYPES,
  STARTER_TAGS,
  TABLE_COLUMNS,
  applyEventFilters,
  cycleSortRules,
  normalizeTablePreferences,
  reorderTableColumns,
  formatTimestamp,
  seekTimeForEvent,
  sortAnalysisEvents,
  type AnalysisEvent,
  type AnalysisEventType,
  type EventFilters,
  type QuickFilter,
  type SortRule,
  type SortKey,
  type TableColumnDefinition,
  type TableColumnId,
  type TablePreferences,
} from "./analysisData";

const VIDEO_DURATION = 224;
const NOTES_KEY = "smash-replay-match-notes";
const LAYOUT_KEY = "smash-replay-workspace-layout";
const TABLE_PREFERENCES_KEY = "smash-replay-table-preferences";

interface WorkspaceLayout {
  vertical: Record<string, number>;
  review: Record<string, number>;
  lower: Record<string, number>;
  notesVisible: boolean;
  filtersVisible: boolean;
  isSwapped: boolean;
}

const DEFAULT_LAYOUT: WorkspaceLayout = {
  vertical: { video: 24, review: 76 },
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

function readStoredTablePreferences(): TablePreferences {
  if (typeof window === "undefined") return DEFAULT_TABLE_PREFERENCES;
  try {
    const stored = window.localStorage.getItem(TABLE_PREFERENCES_KEY);
    return stored ? normalizeTablePreferences(JSON.parse(stored)) : DEFAULT_TABLE_PREFERENCES;
  } catch {
    return DEFAULT_TABLE_PREFERENCES;
  }
}

function saveTablePreferences(preferences: TablePreferences) {
  if (typeof window !== "undefined") window.localStorage.setItem(TABLE_PREFERENCES_KEY, JSON.stringify(preferences));
}

const FRAME_SECONDS = 1 / 60;
const VERTICAL_HANDLE_CLASS = "group h-2 w-full cursor-row-resize bg-border/40 transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/70 focus-visible:bg-primary/60 after:hidden";

export function AnalysisWorkspace({ onBack }: { onBack?: () => void }) {
  const [events, setEvents] = useState(INITIAL_ANALYSIS_EVENTS);
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
  const [tablePreferences, setTablePreferences] = useState(DEFAULT_TABLE_PREFERENCES);
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
    setTablePreferences(readStoredTablePreferences());
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

  const hotkeyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  hotkeyHandlerRef.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTyping = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (isTyping || isManualEventOpen || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey) {
      const ctrlActions: Record<string, () => void> = {
        m: () => setControlsVisible((visible) => !visible),
        ",": () => togglePanel("notes"),
        ".": () => togglePanel("filters"),
      };
      const action = ctrlActions[key];
      if (!action) return;
      event.preventDefault();
      action();
      return;
    }
    const seekOffsets: Record<string, number> = { j: -FRAME_SECONDS, k: FRAME_SECONDS, u: -1, i: 1, "7": -5, "8": 5 };
    if (key === " ") {
      event.preventDefault();
      setIsPlaying((playing) => !playing);
    } else if (key in seekOffsets) {
      event.preventDefault();
      const offset = seekOffsets[key] ?? 0;
      setCurrentTime((time) => Math.min(VIDEO_DURATION, Math.max(0, time + offset)));
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => hotkeyHandlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleEvents = useMemo(
    () => sortAnalysisEvents(applyEventFilters(events, filters), tablePreferences.sorts),
    [events, filters, tablePreferences.sorts],
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

  const setAndSaveTablePreferences = (nextPreferences: TablePreferences) => {
    setTablePreferences(nextPreferences);
    saveTablePreferences(nextPreferences);
  };

  const changeSort = (key: SortKey, additive: boolean) => {
    setAndSaveTablePreferences({ ...tablePreferences, sorts: cycleSortRules(tablePreferences.sorts, key, additive) });
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
           onReset={() => {
             setAndSaveLayout(DEFAULT_LAYOUT);
             setAndSaveTablePreferences(DEFAULT_TABLE_PREFERENCES);
           }}
        />

        <div className="h-[calc(min(50vh,640px)/0.24)] shrink-0">
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
          <ResizableHandle aria-label="Resize video and review" className={VERTICAL_HANDLE_CLASS}><span aria-hidden className="h-1 w-12 rounded-full bg-muted-foreground/50 group-hover:bg-primary-foreground/70" /></ResizableHandle>
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
                 tablePreferences={tablePreferences}
                 onTablePreferencesChange={setAndSaveTablePreferences}
                onFiltersChange={setFilters}
                onSort={changeSort}
                onJump={jumpToEvent}
                onUpdate={updateEvent}
                onDelete={(id) => setEvents((current) => current.filter((event) => event.id !== id))}
                onAddEvent={() => setIsManualEventOpen(true)}
              />
              </ResizablePanel>
              <ResizableHandle aria-label="Resize event table and lower panels" className={VERTICAL_HANDLE_CLASS}><span aria-hidden className="h-1 w-12 rounded-full bg-muted-foreground/50 group-hover:bg-primary-foreground/70" /></ResizableHandle>
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
      <img src={gameplayImage} alt="Replay frame showing two fighters on a tournament stage" width={1920} height={1080} className="block aspect-video h-full w-auto max-w-full object-contain" />
      <button type="button" onClick={onPlayToggle} aria-label="Toggle playback from video" className="absolute inset-0 cursor-pointer focus-visible:outline-none" />
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

function EventTablePanel({ events, totalCount, selectedEventId, filters, tablePreferences, onTablePreferencesChange, onFiltersChange, onSort, onJump, onUpdate, onDelete, onAddEvent }: {
  events: AnalysisEvent[];
  totalCount: number;
  selectedEventId: string | null;
  filters: EventFilters;
  tablePreferences: TablePreferences;
  onTablePreferencesChange: (preferences: TablePreferences) => void;
  onFiltersChange: (filters: EventFilters) => void;
  onSort: (key: SortKey, additive: boolean) => void;
  onJump: (event: AnalysisEvent) => void;
  onUpdate: (id: string, updates: Partial<AnalysisEvent>) => void;
  onDelete: (id: string) => void;
  onAddEvent: () => void;
}) {
  const [draggedColumnId, setDraggedColumnId] = useState<TableColumnId | null>(null);
  const orderedColumns = tablePreferences.order
    .map((id) => TABLE_COLUMNS.find((column) => column.id === id))
    .filter((column): column is TableColumnDefinition => Boolean(column));
  const visibleColumns = orderedColumns.filter((column) => !tablePreferences.hidden.includes(column.id));
  const tableWidth = visibleColumns.reduce((total, column) => total + tablePreferences.widths[column.id], 0) + 48;

  const toggleColumn = (columnId: TableColumnId) => {
    const hidden = tablePreferences.hidden.includes(columnId)
      ? tablePreferences.hidden.filter((id) => id !== columnId)
      : [...tablePreferences.hidden, columnId];
    onTablePreferencesChange({ ...tablePreferences, hidden });
  };

  const resizeColumn = (column: TableColumnDefinition, startX: number) => {
    const startWidth = tablePreferences.widths[column.id];
    const onPointerMove = (event: PointerEvent) => {
      const width = Math.min(800, Math.max(column.minWidth, startWidth + event.clientX - startX));
      onTablePreferencesChange({ ...tablePreferences, widths: { ...tablePreferences.widths, [column.id]: width } });
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
  };

  return (
    <section aria-label="Analysis event table" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button variant="outline" size="sm" onClick={onAddEvent}><Plus /> Add</Button>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <h2 className="font-display text-sm font-semibold">Detected events</h2>
          <span className="font-mono text-xs text-muted-foreground">{events.length}/{totalCount}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Choose visible columns"><Columns2 /> Columns</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orderedColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!tablePreferences.hidden.includes(column.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => toggleColumn(column.id)}
              >{column.label}</DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search events and notes" value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="Search notes, tags, events…" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      <div className="analysis-table-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="table-fixed text-xs" style={{ width: tableWidth }}>
          <colgroup>
            {visibleColumns.map((column) => <col key={column.id} style={{ width: tablePreferences.widths[column.id] }} />)}
            <col className="w-12" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
            <tr className="border-b border-border">
              {visibleColumns.map((column) => (
                <TableHeader
                  key={column.id}
                  column={column}
                  sorts={tablePreferences.sorts}
                  onSort={onSort}
                  onHide={() => toggleColumn(column.id)}
                  onResize={(startX) => resizeColumn(column, startX)}
                  onDragStart={() => setDraggedColumnId(column.id)}
                  onDrop={() => {
                    if (draggedColumnId) onTablePreferencesChange({ ...tablePreferences, order: reorderTableColumns(tablePreferences.order, draggedColumnId, column.id) });
                    setDraggedColumnId(null);
                  }}
                />
              ))}
              <th className="w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
               <EventRow key={event.id} event={event} columns={visibleColumns} selected={selectedEventId === event.id} onJump={() => onJump(event)} onUpdate={(updates) => onUpdate(event.id, updates)} onDelete={() => onDelete(event.id)} />
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

function TableHeader({ column, sorts, onSort, onHide, onResize, onDragStart, onDrop }: {
  column: TableColumnDefinition;
  sorts: SortRule[];
  onSort: (key: SortKey, additive: boolean) => void;
  onHide: () => void;
  onResize: (startX: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const sortIndex = column.sortKey ? sorts.findIndex((sort) => sort.key === column.sortKey) : -1;
  const activeSort = sortIndex >= 0 ? sorts[sortIndex] : undefined;
  return (
    <th
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); onDrop(); }}
      className="group/header relative px-1 py-1 text-left font-medium"
      aria-label={column.label}
    >
      <div className="flex min-w-0 items-center">
        <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden />
        {column.sortKey ? (
          <Button variant="ghost" size="sm" className={cn("h-7 min-w-0 flex-1 justify-start px-1 text-xs text-muted-foreground", activeSort && "text-primary")} onClick={(event) => onSort(column.sortKey as SortKey, event.shiftKey)} aria-label={`Sort by ${column.label}`}>
            <span className="truncate">{column.label}</span>{activeSort ? activeSort.direction === "asc" ? <ArrowUp /> : <ArrowDown /> : null}{activeSort && <span className="font-mono text-[9px]">{sortIndex + 1}</span>}
          </Button>
        ) : <span className="min-w-0 flex-1 truncate px-1.5">{column.label}</span>}
        <Button variant="ghost" size="icon" className="size-6 shrink-0 opacity-55 hover:opacity-100" onClick={onHide} aria-label={`Hide ${column.label} column`}><EyeOff /></Button>
      </div>
      <div role="separator" aria-label={`Resize ${column.label} column`} aria-orientation="vertical" className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-primary/50" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onResize(event.clientX); }} />
    </th>
  );
}

function EventRow({ event, columns, selected, onJump, onUpdate, onDelete }: { event: AnalysisEvent; columns: TableColumnDefinition[]; selected: boolean; onJump: () => void; onUpdate: (updates: Partial<AnalysisEvent>) => void; onDelete: () => void }) {
  const cellForColumn = (columnId: TableColumnId) => {
    switch (columnId) {
      case "eventType": return <span className={cn("font-medium", event.eventType === "Hit Received" && "text-destructive", event.eventType === "Hit Dealt" && "text-success")}>{event.eventType}</span>;
      case "character": return <span className="text-muted-foreground">{event.character ?? "—"}</span>;
      case "timestamp": return <Button variant="ghost" size="sm" className="h-7 px-2 font-mono text-primary" onClick={onJump} aria-label={`Jump to ${formatTimestamp(event.timestamp)}`}><Play />{formatTimestamp(event.timestamp)}</Button>;
      case "damage": return <span className="font-mono">{event.damage === null ? "—" : `${event.damage.toFixed(1)}%`}</span>;
      case "direction": return <span className="text-muted-foreground">{event.direction ?? "—"}</span>;
      case "tags": return <InlineTags tags={event.tags} onChange={(tags) => onUpdate({ tags })} />;
      case "note": return <input aria-label={`Edit note at ${formatTimestamp(event.timestamp)}`} value={event.note} onChange={(changeEvent) => onUpdate({ note: changeEvent.target.value })} className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-2 text-xs outline-none hover:border-border focus:border-primary focus:bg-input/40" />;
      case "secondsSincePrevious": return <span className="font-mono text-muted-foreground">{event.secondsSincePrevious === null ? "—" : `${event.secondsSincePrevious.toFixed(1)}s`}</span>;
    }
  };
  return (
    <tr className={cn("border-b border-border/70 transition-colors hover:bg-secondary/35", selected && "bg-primary/8 shadow-[inset_2px_0_var(--color-primary)]")}>
      {columns.map((column) => <td key={column.id} className="overflow-hidden px-3 py-2 align-middle">{cellForColumn(column.id)}</td>)}
      <td className="pr-2"><Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label={`Delete event at ${formatTimestamp(event.timestamp)}`}><Trash2 /></Button></td>
    </tr>
  );
}

function InlineTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!editorRef.current?.contains(event.target as Node)) setEditing(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [editing]);
  return editing ? (
    <div ref={editorRef} className="flex flex-wrap gap-1 rounded border border-primary/40 bg-card p-1.5">
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