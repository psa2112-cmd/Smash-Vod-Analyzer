// The fixed choices for the three multi-select columns. An empty list means "(blank)".
export const GAMESTATE_OPTIONS = ["Combo", "Juggle", "Recovery", "Edgeguard", "Ledgetrap", "Corner Pressure", "Techchase", "Shield Pressure", "Anti-air"] as const;
export const POSITION_OPTIONS = ["Neutral", "Advantage", "Disadvantage", "Scramble"] as const;
export const TAG_OPTIONS = ["Successful", "Failed", "Even", "Good", "Bad", "Kill", "Flag", "Auto-populated"] as const;

export interface AnalysisEvent {
  id: string;
  gamestate: string[];
  position: string[];
  character: string | null;
  timestamp: number;
  damage: number | null;
  tags: string[];
  note: string;
  secondsSincePrevious: number | null;
}

export type SortKey = "character" | "timestamp" | "damage" | "secondsSincePrevious";
export type SortDirection = "asc" | "desc";
export interface SortRule { key: SortKey; direction: SortDirection }
export type TableColumnId =
  | "timestamp"
  | "gamestate"
  | "position"
  | "tags"
  | "note"
  | "damage"
  | "character"
  | "secondsSincePrevious";
export interface TableColumnDefinition {
  id: TableColumnId;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortKey?: SortKey;
}
export interface TablePreferences {
  order: TableColumnId[];
  widths: Record<TableColumnId, number>;
  hidden: TableColumnId[];
  sorts: SortRule[];
}
export type QuickFilter = "all" | "untagged" | "high-damage";

export const TABLE_COLUMNS: TableColumnDefinition[] = [
  { id: "timestamp", label: "Timestamp", defaultWidth: 128, minWidth: 90, sortKey: "timestamp" },
  { id: "gamestate", label: "Gamestate", defaultWidth: 250, minWidth: 90 },
  { id: "position", label: "My position", defaultWidth: 90, minWidth: 90 },
  { id: "tags", label: "Tags", defaultWidth: 90, minWidth: 90 },
  { id: "note", label: "Note", defaultWidth: 360, minWidth: 90 },
  { id: "damage", label: "Damage", defaultWidth: 96, minWidth: 82, sortKey: "damage" },
  { id: "character", label: "Character", defaultWidth: 112, minWidth: 90, sortKey: "character" },
  { id: "secondsSincePrevious", label: "Since prev.", defaultWidth: 112, minWidth: 90, sortKey: "secondsSincePrevious" },
];

export const DEFAULT_TABLE_PREFERENCES: TablePreferences = {
  order: TABLE_COLUMNS.map((column) => column.id),
  widths: Object.fromEntries(TABLE_COLUMNS.map((column) => [column.id, column.defaultWidth])) as Record<TableColumnId, number>,
  hidden: [],
  sorts: [{ key: "timestamp", direction: "asc" }],
};

export interface EventFilters {
  quickFilter: QuickFilter;
  query: string;
  character: string;
  tag: string;
  gamestateFilter?: string[];
  positionFilter?: string[];
  selectedTags?: string[];
  minDamage: number;
  maxDamage: number;
  minElapsed: number;
}

export const DEFAULT_FILTERS: EventFilters = {
  quickFilter: "all",
  query: "",
  character: "all",
  tag: "all",
  gamestateFilter: [],
  positionFilter: [],
  selectedTags: [],
  minDamage: 0,
  maxDamage: 999,
  minElapsed: 0,
};

/** The columns that share the multi-select chip editor and header filter. */
export type MultiSelectField = "gamestate" | "position" | "tags";
export interface MultiSelectFieldConfig {
  label: string;
  options: readonly string[];
  filterKey: "gamestateFilter" | "positionFilter" | "selectedTags";
  placeholder: string;
}
export const MULTI_SELECT_FIELDS: Record<MultiSelectField, MultiSelectFieldConfig> = {
  gamestate: { label: "Gamestate", options: GAMESTATE_OPTIONS, filterKey: "gamestateFilter", placeholder: "Select gamestate" },
  position: { label: "My position", options: POSITION_OPTIONS, filterKey: "positionFilter", placeholder: "Select position" },
  tags: { label: "Tags", options: TAG_OPTIONS, filterKey: "selectedTags", placeholder: "Add tags" },
};
export const MULTI_SELECT_FIELD_IDS = Object.keys(MULTI_SELECT_FIELDS) as MultiSelectField[];
export function isMultiSelectField(id: string): id is MultiSelectField {
  return id in MULTI_SELECT_FIELDS;
}

/** Adds the option if missing, removes it if present. */
export function toggleOption(values: string[], option: string): string[] {
  return values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
}

export const INITIAL_ANALYSIS_EVENTS: AnalysisEvent[] = [];

export function formatTimestamp(totalSeconds: number): string {
  // The one shared time formatter: under an hour shows "m:ss", an hour or more shows "h:mm:ss".
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function seekTimeForEvent(timestamp: number): number {
  return Math.max(0, timestamp - 1);
}

function comparableValue(event: AnalysisEvent, key: SortKey): string | number {
  const value = event[key];
  if (value === null) return Number.POSITIVE_INFINITY;
  return value;
}

export function sortAnalysisEvents(events: AnalysisEvent[], sorts: SortRule[]): AnalysisEvent[] {
  return [...events].sort((left, right) => {
    for (const sort of sorts) {
      const leftValue = comparableValue(left, sort.key);
      const rightValue = comparableValue(right, sort.key);
      const comparison = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison;
    }
    return 0;
  });
}

export function cycleSortRules(sorts: SortRule[], key: SortKey, additive: boolean): SortRule[] {
  const existing = sorts.find((sort) => sort.key === key);
  const nextDirection = !existing ? "asc" : existing.direction === "asc" ? "desc" : null;
  if (!additive) return nextDirection ? [{ key, direction: nextDirection }] : [];
  const withoutKey = sorts.filter((sort) => sort.key !== key);
  return nextDirection ? [...withoutKey, { key, direction: nextDirection }] : withoutKey;
}

export function reorderTableColumns(order: TableColumnId[], draggedId: TableColumnId, targetId: TableColumnId): TableColumnId[] {
  if (draggedId === targetId || !order.includes(draggedId) || !order.includes(targetId)) return order;
  const nextOrder = order.filter((id) => id !== draggedId);
  nextOrder.splice(nextOrder.indexOf(targetId), 0, draggedId);
  return nextOrder;
}

export function normalizeTablePreferences(value: unknown): TablePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_TABLE_PREFERENCES;
  const stored = value as { order?: unknown; widths?: unknown; hidden?: unknown; sorts?: unknown };
  const validIds = new Set<TableColumnId>(TABLE_COLUMNS.map((column) => column.id));
  const storedOrder = Array.isArray(stored.order) ? stored.order.filter((id): id is TableColumnId => typeof id === "string" && validIds.has(id as TableColumnId)) : [];
  const order = [...new Set([...storedOrder, ...DEFAULT_TABLE_PREFERENCES.order])];
  const storedWidths = stored.widths && typeof stored.widths === "object" && !Array.isArray(stored.widths) ? stored.widths as Record<string, unknown> : {};
  const widths = Object.fromEntries(TABLE_COLUMNS.map((column) => {
    const width = storedWidths[column.id];
    return [column.id, typeof width === "number" && Number.isFinite(width) ? Math.min(800, Math.max(column.minWidth, width)) : column.defaultWidth];
  })) as Record<TableColumnId, number>;
  const hidden = Array.isArray(stored.hidden) ? stored.hidden.filter((id): id is TableColumnId => typeof id === "string" && validIds.has(id as TableColumnId)) : [];
  const validSortKeys = new Set<SortKey>(TABLE_COLUMNS.flatMap((column) => column.sortKey ? [column.sortKey] : []));
  const sorts = Array.isArray(stored.sorts) ? stored.sorts.filter((sort): sort is SortRule => {
    if (!sort || typeof sort !== "object") return false;
    const candidate = sort as { key?: unknown; direction?: unknown };
    return typeof candidate.key === "string" && validSortKeys.has(candidate.key as SortKey) && (candidate.direction === "asc" || candidate.direction === "desc");
  }) : DEFAULT_TABLE_PREFERENCES.sorts;
  return { order, widths, hidden: [...new Set(hidden)], sorts };
}

export function applyEventFilters(events: AnalysisEvent[], filters: EventFilters): AnalysisEvent[] {
  const query = filters.query.trim().toLowerCase();
  // Each multi-select column filter keeps rows that contain every chosen option.
  const matchesAll = (values: string[], required: string[] | undefined) => !required?.length || required.every((option) => values.includes(option));
  return events.filter((event) => {
    const quickMatch =
      filters.quickFilter === "all" ||
      (filters.quickFilter === "untagged" && event.tags.length === 0) ||
      (filters.quickFilter === "high-damage" && (event.damage ?? 0) >= 15);
    const queryMatch = !query || [...event.gamestate, ...event.position, event.character ?? "", event.note, ...event.tags].join(" ").toLowerCase().includes(query);
    return quickMatch && queryMatch &&
      matchesAll(event.gamestate, filters.gamestateFilter) &&
      matchesAll(event.position, filters.positionFilter) &&
      matchesAll(event.tags, filters.selectedTags) &&
      (filters.character === "all" || event.character === filters.character) &&
      (filters.tag === "all" || event.tags.includes(filters.tag)) &&
      (event.damage === null || (event.damage >= filters.minDamage && event.damage <= filters.maxDamage)) &&
      (event.secondsSincePrevious === null || event.secondsSincePrevious >= filters.minElapsed);
  });
}