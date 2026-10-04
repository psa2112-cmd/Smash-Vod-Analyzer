import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Columns2,
  Eye,
  EyeOff,
  FilePlus,
  Filter,
  FolderOpen,
  GripVertical,
  History,
  Keyboard,
  ListFilter,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  VideoOff,
  Volume2,
  X,
} from "lucide-react";
import { formatTimestampInput, navigateTagGrid, parseCharacterInput, parseDamageInput, parseTimestampInput, readGridPositions } from "./inlineEditing";
import gameplayImage from "@/assets/analysis-gameplay.jpg";
import type { ReactNode } from "react";
import { ReplayMediaPlayer, type SeekRequest } from "./ReplayMediaPlayer";
import { resolvePlaybackSource, resolvePlaybackSourceAsync } from "./playbackSource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FILTERS,
  DEFAULT_TABLE_PREFERENCES,
  INITIAL_ANALYSIS_EVENTS,
  MANUAL_EVENT_TYPES,
  ALL_EVENT_TYPES,
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
import {
  PROJECT_FILE_EXTENSION,
  addRecentProject,
  createProjectFile,
  loadRecentProjects,
  redownloadVideo,
  saveRecentProjects,
  type ProjectReplayInfo,
  type RecentProject,
  type VodProjectFile,
} from "./projectFile";
import {
  AUTOSAVE_INTERVAL_MS,
  NOTIFICATION_DURATION_MS,
  SAMPLE_VIDEO_PATH,
  hasNativeOpenPicker,
  isVideoAvailable,
  takePendingReplay,
  takePendingProject,
  openProjectText,
  openProjectWithPicker,
  openStoredProject,
  saveProject,
  useCloseInterceptor,
  type OpenProjectResult,
  type ProjectHandle,
} from "./storageAdapter";
import {
  EMPTY_UNDO_HISTORY,
  createSnapshot,
  pushUndoState,
  redo,
  snapshotsEqual,
  undo,
  type UndoHistory,
  type WorkspaceSnapshot,
} from "./undoRedo";
import { TEXT_COMMIT_PAUSE_MS, isWordBoundary } from "./textUndoChunking";

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

const DEFAULT_REPLAY: ProjectReplayInfo = { videoPath: SAMPLE_VIDEO_PATH, title: "Mario vs. Pikachu · Battlefield" };

export interface BlockedNavigation { proceed: () => void; cancel: () => void }
interface PendingAction { proceed: () => void; cancel?: () => void }

export interface AnalysisWorkspaceProps {
  onBack?: () => void;
  onUnsavedChange?: (unsavedChangesPresent: boolean) => void;
  blockedNavigation?: BlockedNavigation | null;
}

export function AnalysisWorkspace({ onBack, onUnsavedChange, blockedNavigation = null }: AnalysisWorkspaceProps) {
  const [events, setEvents] = useState(INITIAL_ANALYSIS_EVENTS);
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS);
  const [tablePreferences, setTablePreferences] = useState(DEFAULT_TABLE_PREFERENCES);
  const [selectedEventId, setSelectedEventId] = useState<string | null>("evt-1");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(72);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [notes, setNotes] = useState("");
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isManualEventOpen, setIsManualEventOpenState] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const wasPlayingBeforeManualEventRef = useRef(false);
  /** Pauses playback while the add-event screen is open and restores the prior play state on close. */
  const setIsManualEventOpen = (shouldOpen: boolean) => {
    if (shouldOpen === isManualEventOpen) return;
    if (shouldOpen) {
      wasPlayingBeforeManualEventRef.current = isPlaying;
      setIsPlaying(false);
    } else {
      if (wasPlayingBeforeManualEventRef.current) setIsPlaying(true);
      wasPlayingBeforeManualEventRef.current = false;
    }
    setIsManualEventOpenState(shouldOpen);
  };
  const [manualEventType, setManualEventType] = useState<AnalysisEventType>("Neutral Win");
  const [manualNote, setManualNote] = useState("");
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [replay, setReplay] = useState<ProjectReplayInfo>(DEFAULT_REPLAY);
  const [projectHandle, setProjectHandle] = useState<ProjectHandle | null>(null);
  const [unsavedChangesPresent, setUnsavedChangesState] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isVideoMissing, setIsVideoMissing] = useState(false);
  const [videoDuration, setVideoDuration] = useState(VIDEO_DURATION);
  const [seekRequest, setSeekRequest] = useState<SeekRequest>({ time: 0, id: 0 });
  // Start with what we can resolve right away, then let the desktop app upgrade it to a file on disk.
  const [playbackSource, setPlaybackSource] = useState(() => resolvePlaybackSource(replay));
  useEffect(() => {
    let cancelled = false;
    setPlaybackSource(resolvePlaybackSource(replay));
    void resolvePlaybackSourceAsync(replay).then((source) => { if (!cancelled) setPlaybackSource(source); });
    return () => { cancelled = true; };
  }, [replay]);
  /** Moves the playhead and tells the active media player to jump there. */
  const seekTo = (time: number) => {
    const clamped = Math.min(videoDuration, Math.max(0, time));
    setCurrentTime(clamped);
    setSeekRequest((request) => ({ time: clamped, id: request.id + 1 }));
  };
  const [isSaving, setIsSaving] = useState(false);
  const unsavedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Histories live in refs so a pending text chunk can be committed and undone in one keystroke.
  const historyRef = useRef<UndoHistory>(EMPTY_UNDO_HISTORY);
  const notesHistoryRef = useRef<UndoHistory<string>>(EMPTY_UNDO_HISTORY);
  const notesBaselineRef = useRef<string | null>(null);
  const notesCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchNotesRef = useRef<HTMLTextAreaElement | null>(null);
  const dataRef = useRef<WorkspaceSnapshot>(createSnapshot(events, notes));
  dataRef.current = { events, notes };
  const savedSnapshotRef = useRef<WorkspaceSnapshot>(createSnapshot(events, notes));
  const textEditBaselineRef = useRef<WorkspaceSnapshot | null>(null);

  const setUnsavedChangesPresent = (value: boolean) => {
    unsavedRef.current = value;
    setUnsavedChangesState(value);
    onUnsavedChange?.(value);
  };

  /** Records the state that existed before an undoable change to analysis data or notes. */
  const recordUndoState = (previous?: WorkspaceSnapshot) => {
    const snapshot = previous ?? createSnapshot(dataRef.current.events, dataRef.current.notes);
    historyRef.current = pushUndoState(historyRef.current, snapshot);
  };

  const markSavedPoint = () => {
    savedSnapshotRef.current = createSnapshot(dataRef.current.events, dataRef.current.notes);
    setUnsavedChangesPresent(false);
  };

  useEffect(() => {
    setLayout(readStoredLayout());
    setTablePreferences(readStoredTablePreferences());
    const storedNotes = window.localStorage.getItem(NOTES_KEY) ?? "";
    setNotes(storedNotes);
    savedSnapshotRef.current = createSnapshot(INITIAL_ANALYSIS_EVENTS, storedNotes);
    setRecentProjects(loadRecentProjects());
  }, []);

  // The Unsaved Changes indicator always reflects a comparison with the last saved version,
  // so undo and redo move it back and forth automatically.
  useEffect(() => {
    const value = !snapshotsEqual({ events, notes }, savedSnapshotRef.current);
    if (value !== unsavedRef.current) setUnsavedChangesPresent(value);
  }, [events, notes]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), NOTIFICATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notification]);

  
  useEffect(() => {
    const pendingProject = takePendingProject();
    if (pendingProject) {
      handleOpenResult(openStoredProject(pendingProject.filePath, pendingProject.id));
      return;
    }
    const pendingReplay = takePendingReplay();
    if (pendingReplay) {
      setReplay(pendingReplay);
      
      // Start at 0, or at the start of a trimmed clip if one was specified:
      const startTime = pendingReplay.clipRange?.startSeconds ?? 0;
      setCurrentTime(startTime);
      setSeekRequest({ time: startTime, id: 1 });
      
      // Clear the pre-selected sample event:
      setSelectedEventId(null);
    }
  }, []);


  useEffect(() => {
    let isCancelled = false;
    setVideoDuration(VIDEO_DURATION);
    if (playbackSource) { setIsVideoMissing(false); return; }
    void (async () => {
      const isAvailable = await isVideoAvailable(replay.videoPath);
      const isRecovered = isAvailable || (replay.originalUrl ? await redownloadVideo(replay.originalUrl, replay.clipRange) : false);
      if (!isCancelled) setIsVideoMissing(!isRecovered);
    })();
    return () => { isCancelled = true; };
  }, [replay, playbackSource]);

  const rememberRecentProject = (handle: ProjectHandle) => {
    const next = addRecentProject(loadRecentProjects(), { ...handle, lastOpenedDate: new Date().toISOString() });
    saveRecentProjects(next);
    setRecentProjects(next);
  };

  const buildSnapshot = () => createProjectFile({
    replay,
    events,
    sorts: tablePreferences.sorts,
    filters,
    columnPreferences: tablePreferences,
    notes,
    session: { currentTimestamp: currentTime, selectedRowId: selectedEventId },
  });

  const saveWorkspace = async (kind: "manual" | "auto"): Promise<boolean> => {
    setIsSaving(true);
    try {
      const handle = await saveProject(buildSnapshot(), projectHandle);
      if (!handle) return false;
      setProjectHandle(handle);
      rememberRecentProject(handle);
      markSavedPoint();
      setProjectError(null);
      setNotification(kind === "auto" ? "Automatically Saved" : "Saved Successfully");
      return true;
    } catch (error) {
      console.error("[AnalysisWorkspace] save failed", error);
      setProjectError("The project could not be saved. Check that the file is still available and try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const autosaveRef = useRef<() => void>(() => undefined);
  autosaveRef.current = () => {
    if (projectHandle && unsavedRef.current) void saveWorkspace("auto");
  };
  useEffect(() => {
    const timer = window.setInterval(() => autosaveRef.current(), AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const applyProject = (project: VodProjectFile, handle: ProjectHandle) => {
    console.info("[AnalysisWorkspace] project loaded", { filePath: handle.filePath, events: project.table.events.length });
    setEvents(project.table.events);
    setFilters(project.table.filters);
    setTablePreferences({ ...project.table.columnPreferences, sorts: project.table.sorts });
    setNotes(project.notes);
    setCurrentTime(project.session.currentTimestamp);
    setSelectedEventId(project.session.selectedRowId);
    setIsPlaying(false);
    setReplay(project.replay);
    setProjectHandle(handle);
    rememberRecentProject(handle);
    // Opening a project is not undoable, so the history starts fresh at the loaded version.
    historyRef.current = EMPTY_UNDO_HISTORY;
    notesHistoryRef.current = EMPTY_UNDO_HISTORY;
    notesBaselineRef.current = null;
    textEditBaselineRef.current = null;
    savedSnapshotRef.current = createSnapshot(project.table.events, project.notes);
    setUnsavedChangesPresent(false);
    setProjectError(null);
  };

  const handleOpenResult = (result: OpenProjectResult | null) => {
    if (!result) return;
    if (!result.ok) setProjectError(result.error);
    else applyProject(result.project, result.handle);
  };

  const requestAction = (proceed: () => void, cancel?: () => void) => {
    if (unsavedRef.current) setPendingAction({ proceed, ...(cancel ? { cancel } : {}) });
    else proceed();
  };

  useEffect(() => {
    if (blockedNavigation) setPendingAction({ proceed: blockedNavigation.proceed, cancel: blockedNavigation.cancel });
  }, [blockedNavigation]);

  useCloseInterceptor(unsavedChangesPresent, () => requestAction(() => window.desktopBridge?.confirmClose?.()));

  const confirmSave = async () => {
    const action = pendingAction;
    if (!action) return;
    if (await saveWorkspace("manual")) {
      setPendingAction(null);
      action.proceed();
    }
  };
  const confirmDiscard = () => {
    const action = pendingAction;
    setPendingAction(null);
    setUnsavedChangesPresent(false);
    action?.proceed();
  };
  const confirmCancel = () => {
    pendingAction?.cancel?.();
    setPendingAction(null);
  };

  const analyzeNewReplay = () => requestAction(() => (onBack ? onBack() : window.location.assign("/")));
  const openProject = () => requestAction(() => {
    if (hasNativeOpenPicker()) void openProjectWithPicker().then(handleOpenResult);
    else fileInputRef.current?.click();
  });
  const openRecentProject = (project: RecentProject) => requestAction(() => handleOpenResult(openStoredProject(project.filePath, project.id)));
  const onProjectFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      handleOpenResult(openProjectText(await file.text(), file.name));
    } catch (error) {
      console.error("[AnalysisWorkspace] reading project file failed", error);
      setProjectError("The project file could not be read. Try choosing it again.");
    }
  };

  // Sample replay only: simulate playback. Real sources report time from the media player.
  useEffect(() => {
    if (!isPlaying || playbackSource) return;
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
  }, [isPlaying, playbackRate, playbackSource]);

  const applySnapshot = (snapshot: WorkspaceSnapshot) => {
    // Match notes are excluded from global history; only table data is restored.
    dataRef.current = { events: snapshot.events, notes: dataRef.current.notes };
    setEvents(snapshot.events);
  };

  const performUndo = () => {
    commitTextEdit();
    const result = undo(historyRef.current, createSnapshot(dataRef.current.events, dataRef.current.notes));
    if (!result) return;
    textEditBaselineRef.current = null;
    historyRef.current = result.history;
    applySnapshot(result.snapshot);
  };

  const performRedo = () => {
    commitTextEdit();
    const result = redo(historyRef.current, createSnapshot(dataRef.current.events, dataRef.current.notes));
    if (!result) return;
    textEditBaselineRef.current = null;
    historyRef.current = result.history;
    applySnapshot(result.snapshot);
  };

  /** A cell editing session: Escape rewinds both the row data and the undo stack to this point. */
  const cellSessionRef = useRef<{ history: UndoHistory; snapshot: WorkspaceSnapshot } | null>(null);
  const beginCellSession = () => {
    cellSessionRef.current = { history: historyRef.current, snapshot: createSnapshot(dataRef.current.events, dataRef.current.notes) };
  };
  const endCellSession = (discard: boolean) => {
    const session = cellSessionRef.current;
    cellSessionRef.current = null;
    if (!discard || !session) return;
    textEditBaselineRef.current = null;
    historyRef.current = session.history;
    applySnapshot(session.snapshot);
  };

  const hotkeyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  hotkeyHandlerRef.current = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveWorkspace("manual");
      return;
    }
    const target = event.target as HTMLElement | null;
    const isTyping = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const isUndoKey = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z";
    if (isUndoKey && target === matchNotesRef.current) {
      // Inside match notes, only the separate match-notes history is affected.
      event.preventDefault();
      if (event.shiftKey) redoNotes();
      else undoNotes();
      return;
    }
    const isRowNote = !!target?.dataset["rowNote"];
    // Other text fields (search, dialogs) keep the browser's own text undo.
    if (isUndoKey && (!isTyping || isRowNote)) {
      event.preventDefault();
      if (event.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "e" && !isManualEventOpen) {
      event.preventDefault();
      setIsManualEventOpen(true);
      return;
    }
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
    } else if (key === "p" && !event.shiftKey) {
      // Seek to the selected row through the same jump used by timestamp clicks.
      const selectedEvent = events.find((item) => item.id === selectedEventId);
      if (!selectedEvent) return;
      event.preventDefault();
      jumpToEvent(selectedEvent);
    } else if (key in seekOffsets) {
      event.preventDefault();
      const offset = seekOffsets[key] ?? 0;
      seekTo(currentTime + offset);
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
    seekTo(seekTimeForEvent(event.timestamp));
    setSelectedEventId(event.id);
    setIsPlaying(true);
  };

  /** `mode: "text"` defers the undo entry to the blur commit so typing keeps one history state. */
  const updateEvent = (id: string, updates: Partial<AnalysisEvent>, mode: "action" | "text" = "action") => {
    if (mode === "action") recordUndoState();
    else beginTextEdit();
    const nextEvents = dataRef.current.events.map((event) => (event.id === id ? { ...event, ...updates } : event));
    const previousNote = dataRef.current.events.find((event) => event.id === id)?.note ?? "";
    dataRef.current = { ...dataRef.current, events: nextEvents };
    setEvents(nextEvents);
    if (mode !== "text") return;
    if (textCommitTimerRef.current) clearTimeout(textCommitTimerRef.current);
    if (updates.note !== undefined && isWordBoundary(previousNote, updates.note)) commitTextEdit();
    else textCommitTimerRef.current = setTimeout(() => commitTextEdit(), TEXT_COMMIT_PAUSE_MS);
  };

  const textCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Match notes have their own history, separate from table data. */
  const commitNotesEdit = () => {
    if (notesCommitTimerRef.current) { clearTimeout(notesCommitTimerRef.current); notesCommitTimerRef.current = null; }
    const baseline = notesBaselineRef.current;
    notesBaselineRef.current = null;
    if (baseline === null || baseline === dataRef.current.notes) return;
    notesHistoryRef.current = pushUndoState(notesHistoryRef.current, baseline);
  };

  const changeNotes = (value: string) => {
    const previous = dataRef.current.notes;
    if (notesBaselineRef.current === null) notesBaselineRef.current = previous;
    dataRef.current = { ...dataRef.current, notes: value };
    setNotes(value);
    if (notesCommitTimerRef.current) clearTimeout(notesCommitTimerRef.current);
    if (isWordBoundary(previous, value)) commitNotesEdit();
    else notesCommitTimerRef.current = setTimeout(commitNotesEdit, TEXT_COMMIT_PAUSE_MS);
  };

  const applyNotes = (value: string) => {
    dataRef.current = { ...dataRef.current, notes: value };
    setNotes(value);
    if (typeof window !== "undefined") window.localStorage.setItem(NOTES_KEY, value);
  };

  const undoNotes = () => {
    commitNotesEdit();
    const result = undo(notesHistoryRef.current, dataRef.current.notes);
    if (!result) return;
    notesHistoryRef.current = result.history;
    applyNotes(result.snapshot);
  };

  const redoNotes = () => {
    commitNotesEdit();
    const result = redo(notesHistoryRef.current, dataRef.current.notes);
    if (!result) return;
    notesHistoryRef.current = result.history;
    applyNotes(result.snapshot);
  };

  const beginTextEdit = () => {
    if (!textEditBaselineRef.current) {
      textEditBaselineRef.current = createSnapshot(dataRef.current.events, dataRef.current.notes);
    }
  };

  const commitTextEdit = () => {
    if (textCommitTimerRef.current) { clearTimeout(textCommitTimerRef.current); textCommitTimerRef.current = null; }
    const baseline = textEditBaselineRef.current;
    textEditBaselineRef.current = null;
    if (!baseline) return;
    if (snapshotsEqual(baseline, { events: dataRef.current.events, notes: baseline.notes })) return;
    recordUndoState(baseline);
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
      tags: manualTags,
      note: manualNote.trim(),
      secondsSincePrevious: previousTimestamp === undefined ? null : Math.max(0, Math.floor(currentTime - previousTimestamp)),
    };
    recordUndoState();
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
          title={replay.title}
          unsavedChangesPresent={unsavedChangesPresent}
          notification={notification}
          fileMenu={{
            recentProjects,
            onSave: () => void saveWorkspace("manual"),
            onAnalyzeNew: analyzeNewReplay,
            onOpen: openProject,
            onOpenRecent: openRecentProject,
          }}
          onBack={analyzeNewReplay}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
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
        {projectError && (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-sm text-destructive-foreground">
            <span>{projectError}</span>
            <Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={() => setProjectError(null)}><X /></Button>
          </div>
        )}

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
              duration={videoDuration}
              media={playbackSource ? (
                <ReplayMediaPlayer
                  source={playbackSource}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  volume={volume}
                  seekRequest={seekRequest}
                  onTimeUpdate={setCurrentTime}
                  onDurationChange={(duration) => { if (Number.isFinite(duration) && duration > 0) setVideoDuration(duration); }}
                  onEnded={() => setIsPlaying(false)}
                  onError={(message) => { setIsPlaying(false); setProjectError(message); }}
                />
              ) : null}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              volume={volume}
              replay={replay}
              isVideoMissing={isVideoMissing}
              onPlayToggle={() => setIsPlaying((playing) => !playing)}
              onSeek={seekTo}
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
                onDelete={(id) => {
                  recordUndoState();
                  setEvents((current) => current.filter((event) => event.id !== id));
                }}
                onAddEvent={() => setIsManualEventOpen(true)}
                onBeginTextEdit={beginTextEdit}
                onCommitTextEdit={commitTextEdit}
                onSelectRow={setSelectedEventId}
                onBeginCellSession={beginCellSession}
                onEndCellSession={endCellSession}
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
                          <NotesPanel notes={notes} onChange={changeNotes} onCommit={commitNotesEdit} textareaRef={matchNotesRef} />
                        )}
                      </ResizablePanel>
                      <ResizableHandle withHandle />
                      <ResizablePanel id={layout.isSwapped ? "notes" : "filters"} minSize="30%">
                        {layout.isSwapped ? (
                          <NotesPanel notes={notes} onChange={changeNotes} onCommit={commitNotesEdit} textareaRef={matchNotesRef} />
                        ) : (
                          <FilterPanel filters={filters} events={events} onChange={setFilters} />
                        )}
                      </ResizablePanel>
                    </ResizablePanelGroup>
                  ) : layout.notesVisible ? (
                    <NotesPanel notes={notes} onChange={changeNotes} onCommit={commitNotesEdit} textareaRef={matchNotesRef} />
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
        <ShortcutsDialog open={isShortcutsOpen} onOpenChange={setIsShortcutsOpen} />
        <UnsavedChangesDialog
          open={pendingAction !== null}
          isSaving={isSaving}
          onSave={() => void confirmSave()}
          onDiscard={confirmDiscard}
          onCancel={confirmCancel}
        />
        <input ref={fileInputRef} type="file" accept={`${PROJECT_FILE_EXTENSION},application/json`} className="hidden" aria-label="Open project file" data-testid="project-file-input" onChange={(event) => void onProjectFileChosen(event)} />
      </main>
    </TooltipProvider>
  );
}

interface FileMenuActions {
  recentProjects: RecentProject[];
  onSave: () => void;
  onAnalyzeNew: () => void;
  onOpen: () => void;
  onOpenRecent: (project: RecentProject) => void;
}

function FileMenu({ recentProjects, onSave, onAnalyzeNew, onOpen, onOpenRecent }: FileMenuActions) {
  const shortcut = typeof navigator !== "undefined" && /mac/i.test(navigator.platform) ? "⌘S" : "Ctrl+S";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="File menu">File</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={onSave}><Save /> Save<DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAnalyzeNew}><FilePlus /> Analyze New Replay</DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpen}><FolderOpen /> Open</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><History /> Recently Opened</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {recentProjects.length === 0 ? (
              <DropdownMenuItem disabled>No recent projects</DropdownMenuItem>
            ) : recentProjects.map((project) => (
              <DropdownMenuItem key={project.id} onSelect={() => onOpenRecent(project)} className="flex-col items-start gap-0">
                <span className="text-sm">{project.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{project.filePath}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UnsavedChangesDialog({ open, isSaving, onSave, onDiscard, onCancel }: { open: boolean; isSaving: boolean; onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>You have unsaved changes. Save before continuing?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={onDiscard}>Don't Save</Button>
          <Button onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ShortcutSection {
  title: string;
  shortcuts: { description: string; keys: string[] }[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Video Playback",
    shortcuts: [
      { description: "Play / Pause", keys: ["Space"] },
      { description: "Step backward 1 frame", keys: ["J"] },
      { description: "Step forward 1 frame", keys: ["K"] },
      { description: "Rewind 1 second", keys: ["U"] },
      { description: "Forward 1 second", keys: ["I"] },
      { description: "Rewind 5 seconds", keys: ["7"] },
      { description: "Forward 5 seconds", keys: ["8"] },
      { description: "Jump video to selected event", keys: ["P"] },
    ],
  },
  {
    title: "Workspace Panels",
    shortcuts: [
      { description: "Toggle video controls", keys: ["Ctrl", "M"] },
      { description: "Toggle match notes", keys: ["Ctrl", ","] },
      { description: "Toggle filters", keys: ["Ctrl", "."] },
    ],
  },
  {
    title: "Table & Editing",
    shortcuts: [
      { description: "Add manual event", keys: ["Ctrl", "E"] },
      { description: "Undo change", keys: ["Ctrl", "Z"] },
      { description: "Redo change", keys: ["Ctrl", "Shift", "Z"] },
      { description: "Multi-column sort", keys: ["Shift", "Click Header"] },
      { description: "Save project", keys: ["Ctrl", "S"] },
    ],
  },
  {
    title: "Manual Event Dialog",
    shortcuts: [
      { description: "Save event", keys: ["Ctrl", "Enter"] },
      { description: "Navigate tags", keys: ["Arrow Keys"] },
      { description: "Toggle selected tag", keys: ["Shift", "Space"] },
      { description: "Cancel / Close", keys: ["Esc"] },
    ],
  },
];

function ShortcutKeys({ keys }: { keys: string[] }) {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground"
        >
          {key === "Ctrl" && isMac ? "⌘" : key}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Quick reference for playback, workspace panels, and editing</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SHORTCUT_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-notice">{section.title}</h3>
              <ul className="space-y-2">
                {section.shortcuts.map((shortcut) => (
                  <li key={shortcut.description} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 text-foreground/90">{shortcut.description}</span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceHeader({ eventCount, layout, controlsVisible, title, unsavedChangesPresent, notification, fileMenu, onBack, onOpenShortcuts, onAddEvent, onToggleNotes, onToggleFilters, onToggleControls, onSwap, onReset }: {
  eventCount: number;
  layout: WorkspaceLayout;
  controlsVisible: boolean;
  title: string;
  unsavedChangesPresent: boolean;
  notification: string | null;
  fileMenu: FileMenuActions;
  onBack: () => void;
  onOpenShortcuts: () => void;
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
        <Button variant="ghost" size="icon" aria-label="Back to import" onClick={onBack}><ArrowLeft /></Button>
        <FileMenu {...fileMenu} />
        <Button variant="ghost" size="sm" onClick={onOpenShortcuts} aria-label="Open keyboard shortcuts" className="gap-1.5 text-xs">
          <Keyboard className="size-3.5 text-muted-foreground" />
          Hotkeys
        </Button>
        <div className="h-6 w-px bg-border" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-sm font-semibold">{title}</h1>
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Analysis complete</Badge>
            {unsavedChangesPresent && <span className="text-[11px] text-muted-foreground">• Unsaved changes</span>}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">{eventCount} review events</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {notification && (
          <div role="status" className="mr-2 flex items-center gap-1.5 rounded-md bg-notice px-3 py-1 text-xs font-semibold text-notice-foreground animate-in fade-in">
            <Check className="size-3.5" aria-hidden /> {notification}
          </div>
        )}
        <Button size="sm" onClick={onAddEvent} title="Add event (Ctrl+E / Cmd+E)"><Plus /> Add event</Button>
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

function VideoReviewPanel({ currentTime, duration, media, isPlaying, playbackRate, volume, controlsVisible, replay, isVideoMissing, onPlayToggle, onSeek, onVolumeChange, onPlaybackRateChange }: {
  currentTime: number;
  duration: number;
  /** Real replay stream; falls back to the sample still frame when absent. */
  media: ReactNode | null;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  controlsVisible: boolean;
  replay: ProjectReplayInfo;
  isVideoMissing: boolean;
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
      {isVideoMissing ? (
        <div role="status" className="flex aspect-video h-full max-w-full flex-col items-center justify-center gap-2 border border-dashed border-border bg-card/60 p-6 text-center">
          <VideoOff className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-display text-lg font-semibold">No Video Found</p>
          <p className="max-w-md break-all font-mono text-xs text-muted-foreground">Missing file: {replay.videoPath || "not set"}</p>
          {replay.originalUrl && <p className="max-w-md break-all font-mono text-xs text-muted-foreground">Original URL: {replay.originalUrl}</p>}
          <p className="text-xs text-muted-foreground">Events, tags, filters, and notes are still available for review.</p>
        </div>
      ) : (
        <>
          {media ?? <img src={gameplayImage} alt="Replay frame showing two fighters on a tournament stage" width={1920} height={1080} className="block aspect-video h-full w-auto max-w-full object-contain" />}
          <button type="button" onClick={onPlayToggle} aria-label="Toggle playback from video" className="absolute inset-0 cursor-pointer focus-visible:outline-none" />
          <div className="pointer-events-none absolute inset-0 bg-video-shade" />
        </>
      )}
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <Badge className="bg-background/85 text-foreground shadow-none">GAME 3</Badge>
        <Badge variant="outline" className="border-primary/40 bg-background/70 text-primary">Battlefield</Badge>
      </div>
      {controlsVisible && <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 pt-12">
        <Slider aria-label="Video timeline" value={[currentTime]} min={0} max={duration} step={1} onValueChange={(value) => onSeek(value[0] ?? 0)} />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onPlayToggle} aria-label={isPlaying ? "Pause replay" : "Play replay"} className="bg-background/55 hover:bg-background/80">
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <span data-testid="playhead-time" className="w-24 font-mono text-xs">{formatTimestamp(Math.floor(currentTime))} / {formatTimestamp(Math.floor(duration))}</span>
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

function EventTablePanel({ events, totalCount, selectedEventId, filters, tablePreferences, onTablePreferencesChange, onFiltersChange, onSort, onJump, onUpdate, onDelete, onAddEvent, onBeginTextEdit, onCommitTextEdit, onSelectRow, onBeginCellSession, onEndCellSession }: {
  events: AnalysisEvent[];
  totalCount: number;
  selectedEventId: string | null;
  filters: EventFilters;
  tablePreferences: TablePreferences;
  onTablePreferencesChange: (preferences: TablePreferences) => void;
  onFiltersChange: (filters: EventFilters) => void;
  onSort: (key: SortKey, additive: boolean) => void;
  onJump: (event: AnalysisEvent) => void;
  onUpdate: (id: string, updates: Partial<AnalysisEvent>, mode?: "action" | "text") => void;
  onDelete: (id: string) => void;
  onBeginTextEdit: () => void;
  onCommitTextEdit: () => void;
  onAddEvent: () => void;
  onSelectRow: (id: string) => void;
  onBeginCellSession: () => void;
  onEndCellSession: (discard: boolean) => void;
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

  // Excel-style active cell: one selected cell; editing state applies to it.
  const [activeCell, setActiveCell] = useState<{ rowId: string; columnId: TableColumnId } | null>(null);
  const [isCellEditing, setIsCellEditing] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const focusCell = (rowId: string, columnId: TableColumnId) => {
    requestAnimationFrame(() => {
      const element = cellRefs.current.get(`${rowId}:${columnId}`);
      if (!element) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };
  const handleCellFocus = (rowId: string, columnId: TableColumnId, isCellItself: boolean) => {
    setActiveCell({ rowId, columnId });
    onSelectRow(rowId);
    if (isCellItself) setIsCellEditing(false);
    else if (columnId === "note" || columnId === "eventType") { setIsCellEditing(true); onBeginCellSession(); }
  };
  const endCellEdit = (refocusCell: boolean) => {
    setIsCellEditing(false);
    onEndCellSession(false);
    if (refocusCell && activeCell) focusCell(activeCell.rowId, activeCell.columnId);
  };
  /** Escape in a cell: drop the edit and rewind the undo stack to the state from before it opened. */
  const cancelCellEdit = () => {
    setIsCellEditing(false);
    onEndCellSession(true);
    if (activeCell) focusCell(activeCell.rowId, activeCell.columnId);
  };
  const handleCellKeyDown = (keyEvent: React.KeyboardEvent<HTMLTableCellElement>, rowId: string, columnId: TableColumnId) => {
    if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey) return;
    const rowIndex = events.findIndex((event) => event.id === rowId);
    const columnIndex = visibleColumns.findIndex((column) => column.id === columnId);
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const move = moves[keyEvent.key];
    if (move) {
      keyEvent.preventDefault();
      const nextRow = events[Math.min(events.length - 1, Math.max(0, rowIndex + move[0]))];
      const nextColumn = visibleColumns[Math.min(visibleColumns.length - 1, Math.max(0, columnIndex + move[1]))];
      if (!nextRow || !nextColumn) return;
      setActiveCell({ rowId: nextRow.id, columnId: nextColumn.id });
      onSelectRow(nextRow.id);
      focusCell(nextRow.id, nextColumn.id);
    } else if (keyEvent.key === "Enter" && columnId !== "secondsSincePrevious") {
      keyEvent.preventDefault();
      setIsCellEditing(true);
      onBeginCellSession();
    }
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
      <div className="min-h-0 flex-1 overflow-auto">
        <datalist id="character-suggestions">{CHARACTER_SUGGESTIONS.map((name) => <option key={name} value={name} />)}</datalist>
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
                  onResize={(startX) => resizeColumn(column, startX)}
                  onDragStart={() => setDraggedColumnId(column.id)}
                  onDrop={() => {
                    if (draggedColumnId) onTablePreferencesChange({ ...tablePreferences, order: reorderTableColumns(tablePreferences.order, draggedColumnId, column.id) });
                    setDraggedColumnId(null);
                  }}
                  tagsFilter={filters.selectedTags ?? []}
                  onTagsFilterChange={(tags) => onFiltersChange({ ...filters, selectedTags: tags })}
                />
              ))}
              <th className="w-12"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const isActiveRow = activeCell?.rowId === event.id;
              return (
                <EventRow key={event.id} event={event} columns={visibleColumns} selected={selectedEventId === event.id} onJump={() => onJump(event)} onUpdate={(updates, mode) => onUpdate(event.id, updates, mode)} onDelete={() => onDelete(event.id)} onBeginTextEdit={onBeginTextEdit} onCommitTextEdit={onCommitTextEdit}
                  activeColumnId={isActiveRow ? activeCell.columnId : null}
                  isEditing={isActiveRow && isCellEditing}
                  registerCell={(columnId, element) => { if (element) cellRefs.current.set(`${event.id}:${columnId}`, element); else cellRefs.current.delete(`${event.id}:${columnId}`); }}
                  onCellFocus={(columnId, isCellItself) => handleCellFocus(event.id, columnId, isCellItself)}
                  onCellKeyDown={(keyEvent, columnId) => handleCellKeyDown(keyEvent, event.id, columnId)}
                  onStartEdit={(columnId) => { setActiveCell({ rowId: event.id, columnId }); setIsCellEditing(true); onBeginCellSession(); onSelectRow(event.id); }}
                  onEndEdit={endCellEdit}
                  onCancelCellEdit={cancelCellEdit}
                />
              );
            })}
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

function TableHeader({ column, sorts, onSort, onResize, onDragStart, onDrop, tagsFilter, onTagsFilterChange }: {
  column: TableColumnDefinition;
  sorts: SortRule[];
  onSort: (key: SortKey, additive: boolean) => void;
  onResize: (startX: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
  tagsFilter: string[];
  onTagsFilterChange: (tags: string[]) => void;
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
        {column.id === "tags" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Filter by tags"
                className={cn("h-7 min-w-0 flex-1 justify-start px-1 text-xs text-muted-foreground", tagsFilter.length > 0 && "text-primary")}
              >
                <span className="truncate">{column.label}</span>
                {tagsFilter.length > 0 && <span className="font-mono text-[9px]">{tagsFilter.length}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 border-border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Show events tagged with</p>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_TAGS.map((tag) => (
                  <Button
                    key={tag}
                    type="button"
                    variant={tagsFilter.includes(tag) ? "default" : "outline"}
                    aria-pressed={tagsFilter.includes(tag)}
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => onTagsFilterChange(tagsFilter.includes(tag) ? tagsFilter.filter((t) => t !== tag) : [...tagsFilter, tag])}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
              {tagsFilter.length > 0 && (
                <Button variant="ghost" size="sm" className="mt-2 h-6 px-1.5 text-[10px]" onClick={() => onTagsFilterChange([])}>
                  <X /> Clear
                </Button>
              )}
            </PopoverContent>
          </Popover>
        ) : column.sortKey ? (
          <Button variant="ghost" size="sm" className={cn("h-7 min-w-0 flex-1 justify-start px-1 text-xs text-muted-foreground", activeSort && "text-primary")} onClick={(event) => onSort(column.sortKey as SortKey, event.shiftKey)} aria-label={`Sort by ${column.label}`}>
            <span className="truncate">{column.label}</span>{activeSort ? activeSort.direction === "asc" ? <ArrowUp /> : <ArrowDown /> : null}{activeSort && <span className="font-mono text-[9px]">{sortIndex + 1}</span>}
          </Button>
        ) : <span className="min-w-0 flex-1 truncate px-1.5">{column.label}</span>}
      </div>
      <div role="separator" aria-label={`Resize ${column.label} column`} aria-orientation="vertical" className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none hover:bg-primary/50" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onResize(event.clientX); }} />
    </th>
  );
}

const CHARACTER_SUGGESTIONS = ["Mario", "Pikachu", "Fox", "Falco", "Marth", "Lucina", "Joker", "Steve", "Sonic", "Cloud", "Pyra/Mythra", "Roy", "Wolf", "Snake", "Peach", "Palutena", "Inkling", "Mr. Game & Watch"];

/** Controlled click-to-edit text cell: Enter/blur commits, Escape cancels. */
function InlineTextCell({ display, initialValue, label, listId, inputClassName, editing, onStartEdit, onEndEdit, onCommit }: { display: React.ReactNode; initialValue: string; label: string; listId?: string; inputClassName?: string; editing: boolean; onStartEdit: () => void; onEndEdit: (refocusCell: boolean) => void; onCommit: (value: string) => void }) {
  if (!editing) {
    return <button type="button" aria-label={`Edit ${label}`} onClick={onStartEdit} className="w-full min-w-0 truncate rounded border border-transparent px-2 py-1 text-left hover:border-border">{display}</button>;
  }
  return <InlineTextEditor initialValue={initialValue} label={label} listId={listId} inputClassName={inputClassName} onEndEdit={onEndEdit} onCommit={onCommit} />;
}

function InlineTextEditor({ initialValue, label, listId, inputClassName, onEndEdit, onCommit }: { initialValue: string; label: string; listId?: string | undefined; inputClassName?: string | undefined; onEndEdit: (refocusCell: boolean) => void; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(initialValue);
  const finishedRef = useRef(false);
  const finish = (commit: boolean, refocusCell: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (commit && draft !== initialValue) onCommit(draft);
    onEndEdit(refocusCell);
  };
  return (
    <input autoFocus aria-label={label} list={listId} value={draft} onChange={(changeEvent) => setDraft(changeEvent.target.value)} onBlur={() => finish(true, false)}
      onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter") { keyEvent.preventDefault(); finish(true, true); } else if (keyEvent.key === "Escape") { keyEvent.preventDefault(); finish(false, true); } }}
      className={cn("h-7 w-full min-w-0 rounded border border-primary bg-input/40 px-2 text-xs outline-none", inputClassName)} />
  );
}

/** Focus-driven editors (select, note input): grab focus when the cell enters edit mode. */
function useFocusWhenEditing<T extends HTMLElement>(editing: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (editing && document.activeElement !== ref.current) ref.current?.focus();
  }, [editing]);
  return ref;
}

interface CellEditingProps {
  activeColumnId: TableColumnId | null;
  isEditing: boolean;
  registerCell: (columnId: TableColumnId, element: HTMLTableCellElement | null) => void;
  onCellFocus: (columnId: TableColumnId, isCellItself: boolean) => void;
  onCellKeyDown: (keyEvent: React.KeyboardEvent<HTMLTableCellElement>, columnId: TableColumnId) => void;
  onStartEdit: (columnId: TableColumnId) => void;
  onEndEdit: (refocusCell: boolean) => void;
  onCancelCellEdit: () => void;
}

function EventRow({ event, columns, selected, onJump, onUpdate, onDelete, onBeginTextEdit, onCommitTextEdit, activeColumnId, isEditing, registerCell, onCellFocus, onCellKeyDown, onStartEdit, onEndEdit, onCancelCellEdit }: { event: AnalysisEvent; columns: TableColumnDefinition[]; selected: boolean; onJump: () => void; onUpdate: (updates: Partial<AnalysisEvent>, mode?: "action" | "text") => void; onDelete: () => void; onBeginTextEdit: () => void; onCommitTextEdit: () => void } & CellEditingProps) {
  const isCellEditing = (columnId: TableColumnId) => isEditing && activeColumnId === columnId;
  const selectRef = useFocusWhenEditing<HTMLSelectElement>(isCellEditing("eventType"));
  const noteRef = useFocusWhenEditing<HTMLInputElement>(isCellEditing("note"));
  const originalEventTypeRef = useRef(event.eventType);
  const originalNoteRef = useRef(event.note);
  const textCellProps = (columnId: TableColumnId) => ({ editing: isCellEditing(columnId), onStartEdit: () => onStartEdit(columnId), onEndEdit });
  const cellForColumn = (columnId: TableColumnId) => {
    switch (columnId) {
      case "eventType": return (
        <select ref={selectRef} aria-label={`Event type at ${formatTimestamp(event.timestamp)}`} value={event.eventType} onChange={(changeEvent) => onUpdate({ eventType: changeEvent.target.value as AnalysisEventType })}
          onFocus={() => { originalEventTypeRef.current = event.eventType; }}
          onBlur={() => onEndEdit(false)}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") { keyEvent.preventDefault(); onEndEdit(true); }
            else if (keyEvent.key === "Escape") { keyEvent.preventDefault(); if (event.eventType !== originalEventTypeRef.current) onUpdate({ eventType: originalEventTypeRef.current }); onEndEdit(true); }
          }}
          className={cn("h-7 w-full min-w-0 cursor-pointer rounded border border-transparent bg-transparent px-1 text-xs font-medium outline-none hover:border-border focus:border-primary", event.eventType === "Hit Received" && "text-destructive", event.eventType === "Hit Dealt" && "text-success")}>
          {ALL_EVENT_TYPES.map((type) => <option key={type} value={type} className="bg-card text-foreground">{type}</option>)}
        </select>
      );
      case "character": return <InlineTextCell {...textCellProps("character")} label={`character at ${formatTimestamp(event.timestamp)}`} listId="character-suggestions" initialValue={event.character ?? ""} display={<span className="text-muted-foreground">{event.character ?? "—"}</span>} onCommit={(value) => onUpdate({ character: parseCharacterInput(value) })} />;
      case "timestamp": return (
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-primary" onClick={onJump} aria-label={`Jump to ${formatTimestamp(event.timestamp)}`}><Play /></Button>
          <InlineTextCell {...textCellProps("timestamp")} label={`timestamp at ${formatTimestamp(event.timestamp)}`} inputClassName="font-mono" initialValue={formatTimestampInput(event.timestamp)} display={<span className="font-mono text-primary">{formatTimestamp(event.timestamp)}</span>} onCommit={(value) => { const seconds = parseTimestampInput(value); if (seconds !== null) onUpdate({ timestamp: seconds }); }} />
        </div>
      );
      case "damage": return <InlineTextCell {...textCellProps("damage")} label={`damage at ${formatTimestamp(event.timestamp)}`} inputClassName="font-mono" initialValue={event.damage === null ? "" : event.damage.toFixed(1)} display={<span className="font-mono">{event.damage === null ? "—" : `${event.damage.toFixed(1)}%`}</span>} onCommit={(value) => onUpdate({ damage: parseDamageInput(value) })} />;
      case "tags": return <InlineTags tags={event.tags} editing={isCellEditing("tags")} onStartEdit={() => onStartEdit("tags")} onEndEdit={onEndEdit} onCancel={onCancelCellEdit} onChange={(tags) => onUpdate({ tags })} />;
      case "note": return <input ref={noteRef} aria-label={`Edit note at ${formatTimestamp(event.timestamp)}`} value={event.note} data-row-note="true"
        onFocus={() => { originalNoteRef.current = event.note; onBeginTextEdit(); }}
        onBlur={() => { onCommitTextEdit(); onEndEdit(false); }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === "Enter") { keyEvent.preventDefault(); onEndEdit(true); }
          else if (keyEvent.key === "Escape") { keyEvent.preventDefault(); if (event.note !== originalNoteRef.current) onUpdate({ note: originalNoteRef.current }, "text"); onEndEdit(true); }
        }}
        onChange={(changeEvent) => onUpdate({ note: changeEvent.target.value }, "text")} className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-2 text-xs outline-none hover:border-border focus:border-primary focus:bg-input/40" />;
      case "secondsSincePrevious": return <span className="font-mono text-muted-foreground">{event.secondsSincePrevious === null ? "—" : `${event.secondsSincePrevious.toFixed(1)}s`}</span>;
    }
  };
  return (
    <tr className={cn("border-b border-border/70 transition-colors hover:bg-secondary/35", selected && "bg-primary/8 shadow-[inset_2px_0_var(--color-primary)]")}>
      {columns.map((column) => {
        const isActiveCell = activeColumnId === column.id;
        return (
          <td key={column.id} ref={(element) => registerCell(column.id, element)} tabIndex={isActiveCell ? 0 : -1} aria-selected={isActiveCell}
            onFocus={(focusEvent) => onCellFocus(column.id, focusEvent.target === focusEvent.currentTarget)}
            onKeyDown={(keyEvent) => { if (keyEvent.target === keyEvent.currentTarget) onCellKeyDown(keyEvent, column.id); }}
            className={cn("overflow-hidden px-3 py-2 align-middle outline-none", isActiveCell && "rounded-sm ring-2 ring-inset ring-primary")}>
            {cellForColumn(column.id)}
          </td>
        );
      })}
      <td className="pr-2"><Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={onDelete} aria-label={`Delete event at ${formatTimestamp(event.timestamp)}`}><Trash2 /></Button></td>
    </tr>
  );
}

/** Table tagger: arrows navigate (shared with Add Event), Shift toggles the focused tag, Enter saves, Escape discards. */
function InlineTags({ tags, editing, onStartEdit, onEndEdit, onCancel, onChange }: { tags: string[]; editing: boolean; onStartEdit: () => void; onEndEdit: (refocusCell: boolean) => void; onCancel: () => void; onChange: (tags: string[]) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const tagRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!editing) return;
    tagRefs.current[0]?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!editorRef.current?.contains(event.target as Node)) onEndEdit(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const toggleTag = (index: number) => {
    const tag = STARTER_TAGS[index];
    if (!tag) return;
    onChange(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]);
  };
  const onTagKeyDown = (keyEvent: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Toggle on the press itself so the tag flips with no perceptible delay.
    if (keyEvent.key === "Shift") {
      if (!keyEvent.repeat) toggleTag(index);
      return;
    }
    const result = navigateTagGrid(keyEvent.key, readGridPositions(tagRefs.current.slice(0, STARTER_TAGS.length)), index);
    if (result === null) return;
    keyEvent.preventDefault();
    if (typeof result === "number") tagRefs.current[result]?.focus();
  };
  return editing ? (
    <div ref={editorRef} className="flex flex-wrap gap-1 rounded border border-primary/40 bg-card p-1.5"
      onKeyDown={(keyEvent) => {
        // Space belongs to playback, so it must never activate a tag button.
        if (keyEvent.key === " ") { keyEvent.preventDefault(); return; }
        if (keyEvent.key === "Enter") { keyEvent.preventDefault(); keyEvent.stopPropagation(); onEndEdit(true); }
        else if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); onCancel(); }
      }}>
      {STARTER_TAGS.map((tag, index) => (
        <Button key={tag} ref={(element) => { tagRefs.current[index] = element; }} onKeyDown={(keyEvent) => onTagKeyDown(keyEvent, index)} variant={tags.includes(tag) ? "default" : "ghost"} aria-pressed={tags.includes(tag)} size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => toggleTag(index)}>{tag}</Button>
      ))}
      <Button variant="ghost" size="icon" className="size-6" onClick={() => onEndEdit(true)} aria-label="Close tag editor"><X /></Button>
    </div>
  ) : (
    <Button variant="ghost" className="h-auto min-h-7 w-full justify-start whitespace-normal px-1 py-1" onClick={onStartEdit} aria-label="Edit tags">
      <span className="flex flex-wrap gap-1">{tags.length ? tags.map((tag) => <Badge key={tag} variant="secondary" className="px-1.5 py-0 text-[10px]">{tag}</Badge>) : <span className="text-muted-foreground">Add tags</span>}</span>
    </Button>
  );
}

function NotesPanel({ notes, onChange, onCommit, textareaRef }: { notes: string; onChange: (value: string) => void; onCommit: () => void; textareaRef: Ref<HTMLTextAreaElement> }) {
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
      <Textarea ref={textareaRef} aria-label="Match notes" value={notes} onBlur={onCommit} onChange={(event) => saveNotes(event.target.value)} placeholder="What patterns are showing up?&#10;&#10;• Panicking in the corner&#10;• Missing kill confirms&#10;• Winning neutral, losing advantage" className="min-h-0 flex-1 resize-none border-border bg-background/45 text-xs leading-5" />
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
  const eventTypeRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const tagRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusTag = (index: number) => tagRefs.current[index]?.focus();
  const toggleTag = (index: number) => {
    const tag = STARTER_TAGS[index];
    if (!tag) return;
    onTagsChange(selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag]);
  };
  const onTagKeyDown = (keyEvent: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    // Toggle on the press itself so the tag flips with no perceptible delay.
    if (keyEvent.key === "Shift") {
      if (!keyEvent.repeat) toggleTag(index);
      return;
    }
    const result = navigateTagGrid(keyEvent.key, readGridPositions(tagRefs.current), index);
    if (result === null) return;
    keyEvent.preventDefault();
    if (result === "before") eventTypeRef.current?.focus();
    else if (result === "after") noteRef.current?.focus();
    else focusTag(result);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card max-w-xl" onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" && (keyEvent.ctrlKey || keyEvent.metaKey)) { keyEvent.preventDefault(); onSave(); } }}>
        <DialogHeader><DialogTitle>Add manual event</DialogTitle><DialogDescription>Capture a meaningful moment at the current playhead.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="text-xs font-medium text-muted-foreground">Timestamp<Input value={formatTimestamp(timestamp)} disabled className="mt-1 font-mono" /></label>
            <div className="text-xs font-medium text-muted-foreground"><span id="manual-event-type-label">Event type</span><EventTypeListbox triggerRef={eventTypeRef} value={eventType} onChange={onEventTypeChange} onArrowDownWhenClosed={() => focusTag(0)} /></div>
          </div>
           <fieldset><legend className="mb-2 text-xs font-medium text-muted-foreground">Tags</legend><div className="flex flex-wrap gap-1.5">{STARTER_TAGS.map((tag, index) => <Button key={tag} ref={(element) => { tagRefs.current[index] = element; }} onKeyDown={(keyEvent) => onTagKeyDown(keyEvent, index)} type="button" variant={selectedTags.includes(tag) ? "default" : "outline"} aria-pressed={selectedTags.includes(tag)} size="sm" onClick={() => toggleTag(index)}>{tag}</Button>)}</div></fieldset>
          <label className="text-xs font-medium text-muted-foreground">Event note<Textarea ref={noteRef} aria-label="Event note" value={note} onChange={(event) => onNoteChange(event.target.value)} onKeyDown={(keyEvent) => { const target = keyEvent.currentTarget; if (keyEvent.key === "ArrowUp" && target.selectionStart === 0 && target.selectionEnd === 0) { keyEvent.preventDefault(); focusTag(STARTER_TAGS.length - 1); } }} placeholder="What happened, and what should you do next time?" className="mt-1 min-h-24" /></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSave} title="Ctrl+Enter / Cmd+Enter">Save event</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
/** Keyboard-friendly event type picker: Enter toggles the list, arrows change the type while open, ArrowDown leaves when closed. */
function EventTypeListbox({ triggerRef, value, onChange, onArrowDownWhenClosed }: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  value: AnalysisEventType;
  onChange: (type: AnalysisEventType) => void;
  onArrowDownWhenClosed: () => void;
}) {
  const [isListOpen, setIsListOpen] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const currentIndex = Math.max(0, MANUAL_EVENT_TYPES.indexOf(value));
  const step = (offset: number) => {
    const nextIndex = Math.min(MANUAL_EVENT_TYPES.length - 1, Math.max(0, currentIndex + offset));
    const nextType = MANUAL_EVENT_TYPES[nextIndex];
    if (nextType) onChange(nextType);
  };
  // Keep the highlighted option visible: once it passes the vertical midpoint of
  // the list, scroll so it sits at the midpoint, revealing the upcoming options.
  useEffect(() => {
    if (!isListOpen) return;
    const list = listRef.current;
    const active = list?.querySelector<HTMLLIElement>('[aria-selected="true"]');
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const optionOffset = activeRect.top - listRect.top + list.scrollTop;
    const midpoint = list.clientHeight / 2;
    if (optionOffset - list.scrollTop > midpoint) {
      list.scrollTop = optionOffset - midpoint;
    } else if (optionOffset < list.scrollTop + midpoint) {
      list.scrollTop = Math.max(0, optionOffset - midpoint);
    }
  }, [isListOpen, value]);
  const onKeyDown = (keyEvent: React.KeyboardEvent<HTMLButtonElement>) => {
    if (keyEvent.key === "Enter" && !keyEvent.ctrlKey && !keyEvent.metaKey) {
      keyEvent.preventDefault();
      setIsListOpen((open) => !open);
    } else if (keyEvent.key === "Escape" && isListOpen) {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      setIsListOpen(false);
    } else if (keyEvent.key === "ArrowDown") {
      keyEvent.preventDefault();
      if (isListOpen) step(1);
      else onArrowDownWhenClosed();
    } else if (keyEvent.key === "ArrowUp" && isListOpen) {
      keyEvent.preventDefault();
      step(-1);
    }
  };
  return (
    <div className="relative mt-1">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby="manual-event-type-label"
        aria-label="Event type"
        aria-expanded={isListOpen}
        aria-controls="manual-event-type-list"
        onClick={() => setIsListOpen((open) => !open)}
        onKeyDown={onKeyDown}
        onBlur={() => setIsListOpen(false)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
      >
        <span>{value}</span><span aria-hidden="true" className="text-muted-foreground">▾</span>
      </button>
      {isListOpen && (
        <ul ref={listRef} id="manual-event-type-list" role="listbox" aria-label="Event types" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md">
          {MANUAL_EVENT_TYPES.map((type) => (
            <li
              key={type}
              role="option"
              aria-selected={type === value}
              onMouseDown={(mouseEvent) => { mouseEvent.preventDefault(); onChange(type); setIsListOpen(false); }}
              className={cn("cursor-pointer px-3 py-1.5", type === value ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {type}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
