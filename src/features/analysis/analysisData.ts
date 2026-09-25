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
  direction: string | null;
  tags: string[];
  note: string;
  secondsSincePrevious: number | null;
}

export type SortKey = "eventType" | "character" | "timestamp" | "damage" | "secondsSincePrevious";
export type SortDirection = "asc" | "desc";
export type QuickFilter = "all" | "received" | "dealt" | "manual" | "untagged" | "high-damage";

export interface EventFilters {
  quickFilter: QuickFilter;
  query: string;
  eventType: string;
  character: string;
  tag: string;
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
];

export const INITIAL_ANALYSIS_EVENTS: AnalysisEvent[] = [
  { id: "evt-1", eventType: "Hit Dealt", character: "Mario", timestamp: 18, damage: 7.2, direction: "Right", tags: ["Neutral"], note: "Whiff punished the landing aerial.", secondsSincePrevious: null },
  { id: "evt-2", eventType: "Hit Received", character: "Pikachu", timestamp: 32, damage: 12.1, direction: "Up", tags: ["Disadvantage", "Juggling"], note: "Double jumped too early.", secondsSincePrevious: 14 },
  { id: "evt-3", eventType: "Hit Dealt", character: "Mario", timestamp: 49, damage: 14.4, direction: "Left", tags: ["Ledgetrap"], note: "Covered neutral get-up on reaction.", secondsSincePrevious: 17 },
  { id: "evt-4", eventType: "Hit Received", character: "Pikachu", timestamp: 67, damage: 18.6, direction: "Right", tags: ["Landing", "Air Dodge Read"], note: "Predictable air dodge toward center.", secondsSincePrevious: 18 },
  { id: "evt-5", eventType: "Missed Tech Chase", character: null, timestamp: 82, damage: null, direction: null, tags: ["Tech Chase"], note: "Committed to roll in before confirming.", secondsSincePrevious: 15 },
  { id: "evt-6", eventType: "Hit Dealt", character: "Mario", timestamp: 103, damage: 9.5, direction: "Down", tags: ["Advantage"], note: "Kept the platform extension simple.", secondsSincePrevious: 21 },
  { id: "evt-7", eventType: "Hit Received", character: "Pikachu", timestamp: 126, damage: 21.3, direction: "Left", tags: [], note: "Missed the ledge snap.", secondsSincePrevious: 23 },
  { id: "evt-8", eventType: "Successful Recovery", character: null, timestamp: 151, damage: null, direction: null, tags: ["Edgeguard"], note: "Mixed timing with a low recovery.", secondsSincePrevious: 25 },
  { id: "evt-9", eventType: "Hit Dealt", character: "Mario", timestamp: 176, damage: 16.8, direction: "Up", tags: ["Roll Read"], note: "Waited and caught roll from ledge.", secondsSincePrevious: 25 },
  { id: "evt-10", eventType: "Neutral Loss", character: null, timestamp: 198, damage: null, direction: null, tags: ["Neutral"], note: "Approached from the same jump height.", secondsSincePrevious: 22 },
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

export function sortAnalysisEvents(events: AnalysisEvent[], key: SortKey, direction: SortDirection): AnalysisEvent[] {
  return [...events].sort((left, right) => {
    const leftValue = comparableValue(left, key);
    const rightValue = comparableValue(right, key);
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return direction === "asc" ? comparison : -comparison;
  });
}

export function applyEventFilters(events: AnalysisEvent[], filters: EventFilters): AnalysisEvent[] {
  const query = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    const quickMatch =
      filters.quickFilter === "all" ||
      (filters.quickFilter === "received" && event.eventType === "Hit Received") ||
      (filters.quickFilter === "dealt" && event.eventType === "Hit Dealt") ||
      (filters.quickFilter === "manual" && !["Hit Received", "Hit Dealt"].includes(event.eventType)) ||
      (filters.quickFilter === "untagged" && event.tags.length === 0) ||
      (filters.quickFilter === "high-damage" && (event.damage ?? 0) >= 15);
    const queryMatch = !query || [event.eventType, event.character ?? "", event.note, ...event.tags].join(" ").toLowerCase().includes(query);
    return quickMatch && queryMatch &&
      (filters.eventType === "all" || event.eventType === filters.eventType) &&
      (filters.character === "all" || event.character === filters.character) &&
      (filters.tag === "all" || event.tags.includes(filters.tag)) &&
      (event.damage === null || (event.damage >= filters.minDamage && event.damage <= filters.maxDamage)) &&
      (event.secondsSincePrevious === null || event.secondsSincePrevious >= filters.minElapsed);
  });
}