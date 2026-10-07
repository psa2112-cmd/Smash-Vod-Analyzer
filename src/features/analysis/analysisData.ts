export type AnalysisEventType =
  | "Hit Dealt"
  | "Hit Received"
  | "Successful Recovery"
  | "Missed Recovery"
  | "Missed Tech Chase"
  | "Missed Edgeguard"
  | "Neutral Win"
  | "Neutral Loss"
  | "Adaptation"
  | "Conditioning"
  | "Custom Event";

export interface AnalysisEvent {
  id: string;
  eventType: AnalysisEventType;
  character: string | null;
  timestamp: number;
  damage: number | null;
  tags: string[];
  note: string;
  secondsSincePrevious: number | null;
}

export type SortKey = "eventType" | "character" | "timestamp" | "damage" | "secondsSincePrevious";
export type SortDirection = "asc" | "desc";
export interface SortRule { key: SortKey; direction: SortDirection }
export type TableColumnId = "eventType" | "character" | "timestamp" | "damage" | "tags" | "note" | "secondsSincePrevious";
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
export type QuickFilter = "all" | "received" | "dealt" | "manual" | "untagged" | "high-damage";

export const TABLE_COLUMNS: TableColumnDefinition[] = [
  { id: "eventType", label: "Event type", defaultWidth: 160, minWidth: 120, sortKey: "eventType" },
  { id: "character", label: "Character", defaultWidth: 112, minWidth: 90, sortKey: "character" },
  { id: "timestamp", label: "Timestamp", defaultWidth: 128, minWidth: 112, sortKey: "timestamp" },
  { id: "damage", label: "Damage", defaultWidth: 96, minWidth: 82, sortKey: "damage" },
  { id: "tags", label: "Tags", defaultWidth: 224, minWidth: 150 },
  { id: "note", label: "Note", defaultWidth: 360, minWidth: 180 },
  { id: "secondsSincePrevious", label: "Since prev.", defaultWidth: 112, minWidth: 96, sortKey: "secondsSincePrevious" },
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
  eventType: string;
  character: string;
  tag: string;
  selectedTags?: string[];
  minDamage: number;
  maxDamage: number;
  minElapsed: number;
}

export const DEFAULT_FILTERS: EventFilters = {
  quickFilter: "all",
  query: "",
  eventType: "all",
  character: "all",
  tag: "all",
  selectedTags: [],
  minDamage: 0,
  maxDamage: 999,
  minElapsed: 0,
};

export const MANUAL_EVENT_TYPES: AnalysisEventType[] = [
  "Successful Recovery",
  "Missed Recovery",
  "Missed Tech Chase",
  "Missed Edgeguard",
  "Neutral Win",
  "Neutral Loss",
  "Adaptation",
  "Conditioning",
  "Custom Event",
];

export const ALL_EVENT_TYPES: AnalysisEventType[] = ["Hit Dealt", "Hit Received", ...MANUAL_EVENT_TYPES];

export const STARTER_TAGS = [
  "Landing",
  "Juggling",
  "Ledgetrap",
  "Edgeguard",
  "Air Dodge Read",
  "Tech Chase",
  "Roll Read",
  "Neutral",
  "Advantage",
  "Disadvantage",
  "Successful",
  "Unsuccessful",
];

export const INITIAL_ANALYSIS_EVENTS: AnalysisEvent[] = [
  { id: "evt-1", eventType: "Hit Dealt", character: "Mario", timestamp: 18, damage: 7.2, tags: ["Neutral"], note: "Whiff punished the landing aerial.", secondsSincePrevious: null },
  { id: "evt-2", eventType: "Hit Received", character: "Pikachu", timestamp: 32, damage: 12.1, tags: ["Disadvantage", "Juggling"], note: "Double jumped too early.", secondsSincePrevious: 14 },
  { id: "evt-3", eventType: "Hit Dealt", character: "Mario", timestamp: 49, damage: 14.4, tags: ["Ledgetrap"], note: "Covered neutral get-up on reaction.", secondsSincePrevious: 17 },
  { id: "evt-4", eventType: "Hit Received", character: "Pikachu", timestamp: 67, damage: 18.6, tags: ["Landing", "Air Dodge Read"], note: "Predictable air dodge toward center.", secondsSincePrevious: 18 },
  { id: "evt-5", eventType: "Missed Tech Chase", character: null, timestamp: 82, damage: null, tags: ["Tech Chase"], note: "Committed to roll in before confirming.", secondsSincePrevious: 15 },
  { id: "evt-6", eventType: "Hit Dealt", character: "Mario", timestamp: 103, damage: 9.5, tags: ["Advantage"], note: "Kept the platform extension simple.", secondsSincePrevious: 21 },
  { id: "evt-7", eventType: "Hit Received", character: "Pikachu", timestamp: 126, damage: 21.3, tags: [], note: "Missed the ledge snap.", secondsSincePrevious: 23 },
  { id: "evt-8", eventType: "Successful Recovery", character: null, timestamp: 151, damage: null, tags: ["Edgeguard"], note: "Mixed timing with a low recovery.", secondsSincePrevious: 25 },
  { id: "evt-9", eventType: "Hit Dealt", character: "Mario", timestamp: 176, damage: 16.8, tags: ["Roll Read"], note: "Waited and caught roll from ledge.", secondsSincePrevious: 25 },
  { id: "evt-10", eventType: "Neutral Loss", character: null, timestamp: 198, damage: null, tags: ["Neutral"], note: "Approached from the same jump height.", secondsSincePrevious: 22 },
];

export function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
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
  const selectedTags = filters.selectedTags ?? [];
  return events.filter((event) => {
    const quickMatch =
      filters.quickFilter === "all" ||
      (filters.quickFilter === "received" && event.eventType === "Hit Received") ||
      (filters.quickFilter === "dealt" && event.eventType === "Hit Dealt") ||
      (filters.quickFilter === "manual" && !["Hit Received", "Hit Dealt"].includes(event.eventType)) ||
      (filters.quickFilter === "untagged" && event.tags.length === 0) ||
      (filters.quickFilter === "high-damage" && (event.damage ?? 0) >= 15);
    const queryMatch = !query || [event.eventType, event.character ?? "", event.note, ...event.tags].join(" ").toLowerCase().includes(query);
    const tagsColumnMatch = selectedTags.length === 0 || selectedTags.every((tag) => event.tags.includes(tag));
    return quickMatch && queryMatch && tagsColumnMatch &&
      (filters.eventType === "all" || event.eventType === filters.eventType) &&
      (filters.character === "all" || event.character === filters.character) &&
      (filters.tag === "all" || event.tags.includes(filters.tag)) &&
      (event.damage === null || (event.damage >= filters.minDamage && event.damage <= filters.maxDamage)) &&
      (event.secondsSincePrevious === null || event.secondsSincePrevious >= filters.minElapsed);
  });
}