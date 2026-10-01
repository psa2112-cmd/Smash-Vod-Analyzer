import { describe, expect, it } from "vitest";
import {
  EMPTY_UNDO_HISTORY,
  MAX_UNDO_STATES,
  canRedo,
  canUndo,
  createSnapshot,
  pushUndoState,
  redo,
  snapshotsEqual,
  undo,
  type UndoHistory,
  type WorkspaceSnapshot,
} from "./undoRedo";
import { INITIAL_ANALYSIS_EVENTS } from "./analysisData";

const snapshotWithNotes = (notes: string): WorkspaceSnapshot => createSnapshot(INITIAL_ANALYSIS_EVENTS, notes);

describe("undoRedo", () => {
  it("starts with both stacks empty and disabled", () => {
    expect(canUndo(EMPTY_UNDO_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_UNDO_HISTORY)).toBe(false);
  });

  it("pushes the previous state and clears the redo stack", () => {
    const seeded: UndoHistory = { undoStack: [], redoStack: [snapshotWithNotes("redo me")] };
    const history = pushUndoState(seeded, snapshotWithNotes("before"));
    expect(history.undoStack).toHaveLength(1);
    expect(history.redoStack).toHaveLength(0);
    expect(canUndo(history)).toBe(true);
  });

  it("keeps at most 50 undo states and drops the oldest", () => {
    let history: UndoHistory = EMPTY_UNDO_HISTORY;
    for (let index = 0; index < MAX_UNDO_STATES + 10; index += 1) {
      history = pushUndoState(history, snapshotWithNotes(`state-${index}`));
    }
    expect(history.undoStack).toHaveLength(MAX_UNDO_STATES);
    expect(history.undoStack[0]?.notes).toBe("state-10");
    expect(history.undoStack.at(-1)?.notes).toBe(`state-${MAX_UNDO_STATES + 9}`);
  });

  it("undoes to the previous state and moves the current state onto the redo stack", () => {
    const history = pushUndoState(EMPTY_UNDO_HISTORY, snapshotWithNotes("first"));
    const result = undo(history, snapshotWithNotes("second"));
    expect(result?.snapshot.notes).toBe("first");
    expect(result?.history.undoStack).toHaveLength(0);
    expect(result?.history.redoStack[0]?.notes).toBe("second");
  });

  it("redoes the undone state", () => {
    const history = pushUndoState(EMPTY_UNDO_HISTORY, snapshotWithNotes("first"));
    const undone = undo(history, snapshotWithNotes("second"));
    const redone = redo(undone!.history, undone!.snapshot);
    expect(redone?.snapshot.notes).toBe("second");
    expect(redone?.history.undoStack).toHaveLength(1);
    expect(canRedo(redone!.history)).toBe(false);
  });

  it("returns null when there is nothing to undo or redo", () => {
    expect(undo(EMPTY_UNDO_HISTORY, snapshotWithNotes("only"))).toBeNull();
    expect(redo(EMPTY_UNDO_HISTORY, snapshotWithNotes("only"))).toBeNull();
  });

  it("compares snapshots by analysis data and notes", () => {
    expect(snapshotsEqual(snapshotWithNotes("same"), snapshotWithNotes("same"))).toBe(true);
    expect(snapshotsEqual(snapshotWithNotes("same"), snapshotWithNotes("different"))).toBe(false);
    const edited = createSnapshot(INITIAL_ANALYSIS_EVENTS, "same");
    edited.events[0] = { ...edited.events[0]!, tags: [...edited.events[0]!.tags, "extra"] };
    expect(snapshotsEqual(snapshotWithNotes("same"), edited)).toBe(false);
  });
});
