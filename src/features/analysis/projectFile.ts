import {
  normalizeTablePreferences,
  type AnalysisEvent,
  type EventFilters,
  type SortRule,
  type TablePreferences,
} from "./analysisData";
import type { ClipRange } from "@/features/replay-import/replaySource";

export const PROJECT_SCHEMA_VERSION = "1.0.0";
export const PROJECT_FILE_EXTENSION = ".vodproject";
export const RECENT_PROJECTS_KEY = "smash-replay-recent-projects";
export const MAX_RECENT_PROJECTS = 5;

export type ProjectClipRange = ClipRange;
export interface ProjectReplayInfo { videoPath: string; title: string; originalUrl?: string; clipRange?: ProjectClipRange }
export interface ProjectSessionState { currentTimestamp: number; selectedRowId: string | null }
export interface ProjectTableState {
  events: AnalysisEvent[];
  sorts: SortRule[];
  filters: EventFilters;
  columnPreferences: TablePreferences;
}
export interface VodProjectFile {
  version: typeof PROJECT_SCHEMA_VERSION;
  replay: ProjectReplayInfo;
  table: ProjectTableState;
  notes: string;
  session: ProjectSessionState;
}
export interface CreateProjectInput extends ProjectTableState {
  replay: ProjectReplayInfo;
  notes: string;
  session: ProjectSessionState;
}
export type ParseProjectResult = { ok: true; project: VodProjectFile } | { ok: false; error: string };

export interface RecentProject { id: string; name: string; filePath: string; lastOpenedDate: string }

export function createProjectFile(input: CreateProjectInput): VodProjectFile {
  return {
    version: PROJECT_SCHEMA_VERSION,
    replay: { ...input.replay, ...(input.replay.clipRange ? { clipRange: { ...input.replay.clipRange } } : {}) },
    table: {
      events: input.events.map((event) => ({ ...event, tags: [...event.tags] })),
      sorts: input.sorts.map((sort) => ({ ...sort })),
      filters: { ...input.filters, selectedTags: [...(input.filters.selectedTags ?? [])] },
      columnPreferences: input.columnPreferences,
    },
    notes: input.notes,
    session: { ...input.session },
  };
}

export function serializeProjectFile(project: VodProjectFile): string {
  return JSON.stringify(project, null, 2);
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value);
const isNullableString = (value: unknown) => value === null || typeof value === "string";
const isNullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));

function isAnalysisEvent(value: unknown): value is AnalysisEvent {
  if (!isObject(value)) return false;
  return typeof value["id"] === "string" &&
    typeof value["eventType"] === "string" &&
    isNullableString(value["character"]) &&
    typeof value["timestamp"] === "number" && Number.isFinite(value["timestamp"]) &&
    isNullableNumber(value["damage"]) &&
    Array.isArray(value["tags"]) && value["tags"].every((tag) => typeof tag === "string") &&
    typeof value["note"] === "string" &&
    isNullableNumber(value["secondsSincePrevious"]);
}

function isClipRange(value: unknown): value is ProjectClipRange {
  if (!isObject(value) || typeof value["isFullVideo"] !== "boolean") return false;
  return ["startTimestamp", "endTimestamp"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
    ["startSeconds", "endSeconds"].every((key) => value[key] === undefined || (typeof value[key] === "number" && Number.isFinite(value[key])));
}

function isSortRule(value: unknown): value is SortRule {
  return isObject(value) && typeof value["key"] === "string" && (value["direction"] === "asc" || value["direction"] === "desc");
}

function isFilters(value: unknown): value is EventFilters {
  if (!isObject(value)) return false;
  return ["quickFilter", "query", "eventType", "character", "tag"].every((key) => typeof value[key] === "string") &&
    ["minDamage", "maxDamage", "minElapsed"].every((key) => typeof value[key] === "number") &&
    (value["selectedTags"] === undefined || (Array.isArray(value["selectedTags"]) && value["selectedTags"].every((tag) => typeof tag === "string")));
}

const fail = (error: string): ParseProjectResult => {
  console.warn("[projectFile] parse failed:", error);
  return { ok: false, error };
};

export function parseProjectFile(text: string): ParseProjectResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("This project file could not be read. It may be damaged or not a .vodproject file.");
  }
  if (!isObject(data)) return fail("This project file could not be read. It may be damaged or not a .vodproject file.");
  const version = data["version"];
  if (typeof version !== "string" || version.split(".")[0] !== PROJECT_SCHEMA_VERSION.split(".")[0]) {
    return fail(`This project was saved with an unsupported version (${String(version ?? "unknown")}).`);
  }
  const { replay, table, notes, session } = data;
  if (!isObject(replay) || typeof replay["videoPath"] !== "string" || typeof replay["title"] !== "string" ||
    (replay["originalUrl"] !== undefined && typeof replay["originalUrl"] !== "string") ||
    (replay["clipRange"] !== undefined && !isClipRange(replay["clipRange"]))) {
    return fail("The project is missing its replay information.");
  }
  if (!isObject(table) || !Array.isArray(table["events"]) || !Array.isArray(table["sorts"])) {
    return fail("The project is missing its event table.");
  }
  if (!table["events"].every(isAnalysisEvent)) return fail("Some events in this project are damaged.");
  if (!table["sorts"].every(isSortRule)) return fail("The saved table sorting is damaged.");
  if (!isFilters(table["filters"])) return fail("The saved table filters are damaged.");
  if (typeof notes !== "string") return fail("The project's match notes are damaged.");
  if (!isObject(session) || typeof session["currentTimestamp"] !== "number" || !isNullableString(session["selectedRowId"])) {
    return fail("The project's session information is damaged.");
  }
  const originalUrl = replay["originalUrl"] as string | undefined;
  const clipRange = replay["clipRange"] as ProjectClipRange | undefined;
  const project = createProjectFile({
    replay: { videoPath: replay["videoPath"], title: replay["title"], ...(originalUrl !== undefined ? { originalUrl } : {}), ...(clipRange ? { clipRange } : {}) },
    events: table["events"],
    sorts: table["sorts"],
    filters: table["filters"],
    columnPreferences: normalizeTablePreferences(table["columnPreferences"]),
    notes,
    session: { currentTimestamp: Math.max(0, session["currentTimestamp"]), selectedRowId: session["selectedRowId"] as string | null },
  });
  return { ok: true, project };
}

export function addRecentProject(list: RecentProject[], entry: RecentProject): RecentProject[] {
  return [entry, ...list.filter((item) => item.id !== entry.id && item.filePath !== entry.filePath)].slice(0, MAX_RECENT_PROJECTS);
}

function isRecentProject(value: unknown): value is RecentProject {
  return isObject(value) && ["id", "name", "filePath", "lastOpenedDate"].every((key) => typeof value[key] === "string");
}

export function loadRecentProjects(): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecentProject).slice(0, MAX_RECENT_PROJECTS) : [];
  } catch {
    console.warn("[projectFile] recent projects storage was unreadable; resetting");
    return [];
  }
}

export function saveRecentProjects(list: RecentProject[]): void {
  window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(list.slice(0, MAX_RECENT_PROJECTS)));
}

/**
 * Downloads a project's replay again from its original link (desktop app only).
 * Returns the new file path on disk, or null when downloading isn't possible
 * (browser preview) or the download failed.
 */
export async function redownloadVideo(
  url: string,
  clipRange?: ProjectClipRange,
  onProgress: (percent: number) => void = () => undefined,
): Promise<string | null> {
  // Loaded lazily: storageAdapter imports this file, so a static import would be circular.
  const { canDownloadVideos, downloadReplayVideo } = await import("./storageAdapter");
  if (!canDownloadVideos()) {
    console.info("[projectFile] redownloadVideo skipped: downloads need the desktop app", { url });
    return null;
  }
  try {
    console.info("[projectFile] redownloadVideo start", { url, clipRange });
    const filePath = await downloadReplayVideo(url, clipRange ?? { isFullVideo: true }, onProgress);
    console.info("[projectFile] redownloadVideo complete", { filePath });
    return filePath;
  } catch (error) {
    console.error("[projectFile] redownloadVideo failed", error);
    return null;
  }
}
