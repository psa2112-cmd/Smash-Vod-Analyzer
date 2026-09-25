import { describe, expect, it } from "vitest";
import {
  applyEventFilters,
  formatTimestamp,
  seekTimeForEvent,
  sortAnalysisEvents,
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
    expect(sortAnalysisEvents(events, "timestamp", "asc").map((event) => event.id)).toEqual([
      "manual",
      "late-hit",
    ]);
    expect(sortAnalysisEvents(events, "timestamp", "desc").map((event) => event.id)).toEqual([
      "late-hit",
      "manual",
    ]);
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