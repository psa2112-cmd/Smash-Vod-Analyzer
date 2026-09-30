import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_FILTERS, DEFAULT_TABLE_PREFERENCES, INITIAL_ANALYSIS_EVENTS } from "./analysisData";
import {
  PROJECT_SCHEMA_VERSION,
  addRecentProject,
  createProjectFile,
  loadRecentProjects,
  parseProjectFile,
  redownloadVideo,
  saveRecentProjects,
  serializeProjectFile,
  type RecentProject,
} from "./projectFile";

const sampleProject = () =>
  createProjectFile({
    replay: { videoPath: "C:/vods/set1.mp4", title: "Set 1", originalUrl: "https://youtu.be/abc" },
    events: INITIAL_ANALYSIS_EVENTS,
    sorts: [{ key: "timestamp", direction: "asc" }],
    filters: DEFAULT_FILTERS,
    columnPreferences: DEFAULT_TABLE_PREFERENCES,
    notes: "Stop jumping.",
    session: { currentTimestamp: 42, selectedRowId: "evt-2" },
  });

const recent = (index: number): RecentProject => ({
  id: `p${index}`, name: `Project ${index}`, filePath: `/p${index}.vodproject`, lastOpenedDate: new Date(2026, 0, index).toISOString(),
});

describe("project file", () => {
  it("round-trips a project through serialization", () => {
    const project = sampleProject();
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION);
    const result = parseProjectFile(serializeProjectFile(project));
    expect(result).toEqual({ ok: true, project });
  });

  it("rejects malformed JSON with a friendly message", () => {
    const result = parseProjectFile("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/could not be read/i);
  });

  it("rejects incompatible versions", () => {
    const raw = JSON.parse(serializeProjectFile(sampleProject())) as Record<string, unknown>;
    raw["version"] = "2.0.0";
    const result = parseProjectFile(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version/i);
  });

  it("rejects missing required keys and bad event data", () => {
    const raw = JSON.parse(serializeProjectFile(sampleProject())) as { replay?: unknown; table: { events: unknown[] } };
    delete raw.replay;
    expect(parseProjectFile(JSON.stringify(raw)).ok).toBe(false);
    const raw2 = JSON.parse(serializeProjectFile(sampleProject())) as { table: { events: unknown[] } };
    raw2.table.events = [{ id: 5 }];
    expect(parseProjectFile(JSON.stringify(raw2)).ok).toBe(false);
  });
});

describe("recently opened registry", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps newest first, dedupes, and trims to 5", () => {
    let list: RecentProject[] = [];
    for (let i = 1; i <= 6; i += 1) list = addRecentProject(list, recent(i));
    expect(list).toHaveLength(5);
    expect(list[0]?.id).toBe("p6");
    expect(list.some((item) => item.id === "p1")).toBe(false);
    list = addRecentProject(list, { ...recent(3), lastOpenedDate: "2026-09-30T00:00:00.000Z" });
    expect(list[0]?.id).toBe("p3");
    expect(list).toHaveLength(5);
  });

  it("persists and ignores corrupt storage", () => {
    saveRecentProjects([recent(1)]);
    expect(loadRecentProjects()).toEqual([recent(1)]);
    window.localStorage.setItem("smash-replay-recent-projects", "garbage");
    expect(loadRecentProjects()).toEqual([]);
  });
});

describe("redownloadVideo stub", () => {
  it("returns false", async () => {
    await expect(redownloadVideo("https://youtu.be/abc")).resolves.toBe(false);
  });
});
