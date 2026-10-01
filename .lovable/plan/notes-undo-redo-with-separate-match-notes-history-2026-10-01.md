# Notes undo/redo with separate match-notes history

## Behavior
- **Main undo list:** row adds, edits, and deletes, tags, and row notes. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z use this list whenever the cursor is **not** in the match notes box. This includes while typing in a row note.
- **Match notes undo list (separate):** only works while the cursor is in the match notes box. There, Ctrl+Z and Ctrl+Shift+Z undo or redo only match-notes text. Pressing Ctrl+Z outside the box never changes match notes.
- **Google Docs-style chunks (both lists):** one undo step covers about one word or typing burst, not one letter. A new step starts when you:
  - pause for 0.33 seconds,
  - finish a word (type a space, punctuation, or Enter after a letter),
  - click away, or
  - switch to a different note box.
- **Rules for both lists:** a 50-step limit (oldest steps are dropped), and a new edit clears redo.
- **Unsaved indicator:** compares rows plus match notes against the last save. Undoing either list back to the saved version clears "Unsaved changes".
- **When the match-notes list resets:** opening a project resets it. Saving does not.

## Technical details
- `undoRedo.ts`: make the stack helpers generic (`UndoHistory<T>`, `pushUndoState<T>`, `undo<T>`, `redo<T>`). The existing tests keep passing.
- New `textUndoChunking.ts` with pure helpers: `isWordBoundary(prev, next)` and `TEXT_COMMIT_PAUSE_MS = 330`, with unit tests.
- `AnalysisWorkspace.tsx`:
  - Main history snapshots keep `events` only. Notes are already excluded from restore, so drop them from the compare as well.
  - Add `notesHistory: UndoHistory<string>` with its own baseline, pause timer, and word-boundary commit.
  - Row notes switch to the 330 ms pause plus word-boundary commit.
  - Hotkeys: if focus is in the match notes textarea, `preventDefault`, commit the pending chunk, then undo or redo on `notesHistory`. In a row-note input, commit the pending chunk, then use the main history. Other inputs (search, dialog) keep the browser's own undo.
- Tests, written first: match-notes undo works only while focused, Ctrl+Z outside the box leaves match notes unchanged, word chunking and pause commit (fake timers), Ctrl+Z inside a row note undoes the row-note chunk, and undoing to the saved version clears "Unsaved changes".
