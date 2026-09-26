# Analysis Table Controls

## Goal

Upgrade the existing event table with configurable columns, multi-column sorting, cleaner tag editing, and themed scrolling while preserving the current analysis workflow and dark/light-blue visual style.

## What will be built

- **Reorder columns:** Drag table headers left or right to change their order. Keep the actions column fixed at the right edge so row deletion remains predictable.
- **Resize columns:** Drag a visible boundary on each resizable header to widen or narrow that column. Enforce practical minimum widths so labels and controls remain usable.
- **Hide/show columns:** Add a compact columns menu to  the right of the "Detected events" table header. Users can toggle data columns individually to show or hide that column. Additionally, create an eye icon next to each column name. Clicking on the icon hides that column.
- Move the Add button to the left of the Detected events button.
- **Multi-column sorting:** Clicking a sortable header starts or reverses the primary sort. Shift-clicking adds or updates secondary sorts. Active headers show direction and sort priority (1, 2, and so on); a third click removes that field from the sort.
- **Table preference persistence:** Save column order, widths, visibility, and active sorts in browser storage so the table stays configured after refresh. Invalid or older saved settings will safely fall back to defaults. Pressing the reset layout button also reverts table view back to defeault. 
- **Tag editor dismissal:** Clicking anywhere outside an open tag editor will close it, matching the existing X button while retaining current tags.
- **Themed scrollbars:** Style the table’s vertical and horizontal scrollbars with dark surfaces, subtle borders, and the existing light-blue accent for interaction states.

## Test-first delivery

1. Add failing tests for multi-sort precedence, sort cycling, column visibility, column reorder, column resizing, preference fallback, and outside-click tag dismissal.
2. Extend the typed analysis utilities with column definitions, table preferences, and multi-sort behavior.
3. Build the header drag, resize, visibility menu, and sort-priority indicators into the existing event table.
4. Add the tag editor outside-click behavior and scoped scrollbar styling.
5. Run the focused tests, verify dragging and menus in the desktop preview, and confirm the page has no build or runtime errors.

## Technical details

- Keep all new table logic and tests under `src/features/analysis`.
- Use native pointer/drag interactions and existing design-system controls; no backend or new database work.
- Render each row from the same typed column definitions as the header so reorder, visibility, and widths stay aligned.
- Scope scrollbar styling to the event-table viewport rather than changing every scrollbar in the app.