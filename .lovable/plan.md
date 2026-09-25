# Analysis Workspace

## Goal
Build the `/analyze` review workspace in the approved dark, light-blue visual style. This page will use realistic front-end demo data only; replay processing and permanent cloud storage remain out of scope until the complete front-end flow is approved.

## What will be built
- A dense desktop-first workspace with a compact replay header and clear analysis status.
- A video review panel with functional play/pause, seeking, volume, timeline, playback speed, and timestamp jumps using a bundled demo video state/fallback rather than a backend feed.
- A sortable, searchable event table containing event type, character hit, timestamp, damage, hit direction, tags, note, and elapsed time.
- Event interactions: select a row, jump to one second before its timestamp, edit tags/notes inline, delete an event, and add a manual event at the current playhead.
- Match notes with automatic local saving and a visible saved state.
- Quick and advanced table filters, including event type, damage range, character, tags, elapsed time, and note search, plus reset.
- Resizable video/table/utility areas, hide/show notes and filters, swap the lower panels, and reset the layout.
- Browser-local persistence for notes and layout preferences so the workspace survives refreshes without adding a backend.
- Purposeful empty states for no matching events and missing values.
- Home-page handoff: clicking **Analyze Replay** will open `/analyze` after the existing preparation state.

## Test-first delivery
1. Add failing tests for sorting/filtering, timestamp seeking, manual-event creation, note editing, and layout controls.
2. Implement typed mock event data and pure table utilities.
3. Build the video, event table, notes, filters, and layout controls as focused components.
4. Assemble the `/analyze` page and connect the home page.
5. Run the focused tests, verify the page in the preview at desktop width, and check the current build status.

## Technical details
- Use the existing shadcn controls, Lucide icons, semantic color tokens, and `react-resizable-panels` package.
- Keep event state and layout preferences in the browser for this front-end milestone.
- Add unique `/analyze` title, description, Open Graph, and Twitter metadata.
- Keep the route desktop-first as required by the PRD; no mobile layout will be added in this module.
