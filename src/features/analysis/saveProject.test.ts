import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProject } from "./storageAdapter";
import { createProjectFile } from "./projectFile";
import { DEFAULT_FILTERS, DEFAULT_TABLE_PREFERENCES } from "./analysisData";

const project = () => createProjectFile({
  replay: { videoPath: "", title: "Match" },
  events: [],
  sorts: [],
  filters: DEFAULT_FILTERS,
  columnPreferences: DEFAULT_TABLE_PREFERENCES,
  notes: "",
  session: { currentTimestamp: 0, selectedRowId: null },
});

describe("saveProject overwrite rules", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns overwrite_failed without downloading when the existing file cannot be written over", async () => {
    const createObjectURL = vi.fn(() => "blob:test");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const result = await saveProject(project(), { id: "p1", name: "match", filePath: "match.vodproject" });
    expect(result).toEqual({ ok: false, reason: "overwrite_failed", suggestedName: "match.vodproject" });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("downloads a new copy when saving as a new file in a browser without a save window", async () => {
    const createObjectURL = vi.fn(() => "blob:test");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const result = await saveProject(project(), { id: "p1", name: "match", filePath: "match.vodproject" }, { forceSaveAs: true });
    expect(result.ok).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
