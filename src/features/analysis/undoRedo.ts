import type { AnalysisEvent } from "./analysisData";

/** Maximum number of undo states retained, per the undo/redo specification. */
export const MAX_UNDO_STATES = 50;

/** The user-created workspace data covered by undo and redo. */
export interface WorkspaceSnapshot {
  events: AnalysisEvent[];
  notes: string;
}

/** Generic undo/redo stacks; used for table data and, separately, for match-notes text. */
export interface UndoHistory<T = WorkspaceSnapshot> {
  undoStack: T[];
  redoStack: T[];
}

export const EMPTY_UNDO_HISTORY: UndoHistory<never> = { undoStack: [], redoStack: [] };

export function createSnapshot(events: AnalysisEvent[], notes: string): WorkspaceSnapshot {
  return { events: events.map((event) => ({ ...event, tags: [...event.tags] })), notes };
}

export function snapshotsEqual(left: WorkspaceSnapshot, right: WorkspaceSnapshot): boolean {
  if (left === right) return true;
  if (left.notes !== right.notes) return false;
  if (left.events.length !== right.events.length) return false;
  return left.events.every((event, index) => {
    const other = right.events[index];
    if (!other) return false;
    return (
      event.id === other.id &&
      event.eventType === other.eventType &&
      event.character === other.character &&
      event.timestamp === other.timestamp &&
      event.damage === other.damage &&
      event.direction === other.direction &&
      event.note === other.note &&
      event.secondsSincePrevious === other.secondsSincePrevious &&
      event.tags.length === other.tags.length &&
      event.tags.every((tag, tagIndex) => tag === other.tags[tagIndex])
    );
  });
}

export function canUndo<T>(history: UndoHistory<T>): boolean {
  return history.undoStack.length > 0;
}

export function canRedo<T>(history: UndoHistory<T>): boolean {
  return history.redoStack.length > 0;
}

/** Records the state that existed before an undoable action and clears the redo stack. */
export function pushUndoState<T>(history: UndoHistory<T>, previous: T): UndoHistory<T> {
  const undoStack = [...history.undoStack, previous];
  return {
    undoStack: undoStack.length > MAX_UNDO_STATES ? undoStack.slice(undoStack.length - MAX_UNDO_STATES) : undoStack,
    redoStack: [],
  };
}

export interface HistoryTransition<T = WorkspaceSnapshot> {
  history: UndoHistory<T>;
  snapshot: T;
}

export function undo<T>(history: UndoHistory<T>, current: T): HistoryTransition<T> | null {
  const snapshot = history.undoStack[history.undoStack.length - 1];
  if (snapshot === undefined) return null;
  return {
    snapshot,
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, current],
    },
  };
}

export function redo<T>(history: UndoHistory<T>, current: T): HistoryTransition<T> | null {
  const snapshot = history.redoStack[history.redoStack.length - 1];
  if (snapshot === undefined) return null;
  return {
    snapshot,
    history: {
      undoStack: [...history.undoStack, current],
      redoStack: history.redoStack.slice(0, -1),
    },
  };
}
