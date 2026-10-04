<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project architecture

- Keep replay-analysis UI, typed event data, and tests together under `src/features/analysis`; this isolates the core review workflow for testing and rollback.
- Keep analysis resizing in nested vertical/horizontal panels inside a fixed-height, page-scrollable workspace; this lets the video retain its aspect ratio while the table and notes remain independently resizable.
- Drive analysis-table headers and cells from shared typed column definitions; this keeps column order, width, visibility, and persistence synchronized.
- Route all project file I/O through `src/features/analysis/storageAdapter.ts`; it swaps native file pickers for a local workspace store in preview.
- Keep inline-edit parsing and tag-grid arrow navigation as pure helpers in `src/features/analysis/inlineEditing.ts`; this keeps them unit-testable apart from the UI.
- Capture the undo history and snapshot when a table cell editor opens and rewind to both when it is cancelled; this keeps discarded cell edits out of the undo stack.
- Video folder at ~/Videos/SmashReplayAnalyzer is defined in storageAdapter.ts; home page hands off imported replays through session storage so the analysis page can pick them up.
- Route all desktop (Tauri) capabilities through `src/features/desktop/desktopBridge.ts`, with browser fallbacks when a bridge method is missing; this keeps the app runnable in browser preview and tests.
