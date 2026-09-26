import { describe, expect, it } from "vitest";
import {
  applyEventFilters,
  formatTimestamp,
  seekTimeForEvent,
  sortAnalysisEvents,
  cycleSortRules,
  normalizeTablePreferences,
  reorderTableColumns,
  type AnalysisEvent,
} from "./analysisData";

const events: AnalysisEvent[] = [
  {
    id: "late-hit",
    eventType: "Hit Received",
    character: "Mario",
    timestamp: 92,
    damage: 18.4,
    direction: "Up",
    tags: ["Landing", "Air Dodge Read"],
    note: "Drifted into the juggle.",
    secondsSincePrevious: 7.2,
  },
  {
    id: "manual",
    eventType: "Missed Tech Chase",
    character: null,
    timestamp: 45,
    damage: null,
    direction: null,
    tags: [],
    note: "React instead of guessing.",
    secondsSincePrevious: 12.8,
  },
];

describe("analysis data utilities", () => {
  it("sorts events by timestamp in both directions", () => {
    expect(sortAnalysisEvents(events, [{ key: "timestamp", direction: "asc" }]).map((event) => event.id)).toEqual([
      "manual",
      "late-hit",
    ]);
    expect(sortAnalysisEvents(events, [{ key: "timestamp", direction: "desc" }]).map((event) => event.id)).toEqual([
      "late-hit",
      "manual",
    ]);
  });

  it("uses later sort rules to break ties", () => {
    const firstEvent = events[0];
    const secondEvent = events[1];
    if (!firstEvent || !secondEvent) throw new Error("Expected analysis fixtures");
    const tiedEvents = [
      { ...firstEvent, id: "later", eventType: "Hit Dealt" as const, timestamp: 80 },
      { ...firstEvent, id: "earlier", eventType: "Hit Dealt" as const, timestamp: 20 },
      { ...secondEvent, id: "other", eventType: "Neutral Win" as const, timestamp: 10 },
    ];
    expect(sortAnalysisEvents(tiedEvents, [
      { key: "eventType", direction: "asc" },
      { key: "timestamp", direction: "asc" },
    ]).map((event) => event.id)).toEqual(["earlier", "later", "other"]);
  });

  it("cycles a primary sort and adds a shifted secondary sort", () => {
    expect(cycleSortRules([], "timestamp", false)).toEqual([{ key: "timestamp", direction: "asc" }]);
    expect(cycleSortRules([{ key: "timestamp", direction: "asc" }], "timestamp", false)).toEqual([{ key: "timestamp", direction: "desc" }]);
    expect(cycleSortRules([{ key: "timestamp", direction: "desc" }], "timestamp", false)).toEqual([]);
    expect(cycleSortRules([{ key: "timestamp", direction: "asc" }], "damage", true)).toEqual([
      { key: "timestamp", direction: "asc" },
      { key: "damage", direction: "asc" },
    ]);
  });

  it("reorders columns and safely normalizes stored preferences", () => {
    expect(reorderTableColumns(["eventType", "character", "timestamp"], "timestamp", "eventType")).toEqual([
      "timestamp", "eventType", "character",
    ]);
    const normalized = normalizeTablePreferences({
      order: ["note", "not-a-column"],
      widths: { note: 12, eventType: 9999 },
      hidden: ["damage", "timestamp", "not-a-column"],
      sorts: [{ key: "damage", direction: "desc" }, { key: "bad", direction: "asc" }],
    });
    expect(normalized.order[0]).toBe("note");
    expect(normalized.widths.note).toBeGreaterThanOrEqual(180);
    expect(normalized.hidden).toContain("damage");
    expect(normalized.hidden).not.toContain("timestamp");
    expect(normalized.sorts).toEqual([{ key: "damage", direction: "desc" }]);
  });

  it("filters events by quick filter and note search", () => {
    expect(
      applyEventFilters(events, {
        quickFilter: "received",
        query: "juggle",
        eventType: "all",
        character: "all",
        tag: "all",
        minDamage: 0,
        maxDamage: 999,
        minElapsed: 0,
      }).map((event) => event.id),
    ).toEqual(["late-hit"]);
  });

  it("seeks one second before an event without going below zero", () => {
    expect(seekTimeForEvent(92)).toBe(91);
    expect(seekTimeForEvent(0.4)).toBe(0);
    expect(formatTimestamp(92)).toBe("1:32");
  });
});