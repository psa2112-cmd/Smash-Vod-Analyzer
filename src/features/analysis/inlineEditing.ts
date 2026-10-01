/** Parses strict mm:ss input (e.g. "02:15" or "2:15") into total seconds; null when invalid. */
export function parseTimestampInput(value: string): number | null {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Formats seconds as zero-padded mm:ss for the inline editor. */
export function formatTimestampInput(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** Parses damage input, tolerating a trailing %. Empty, invalid or negative values mean "no damage". */
export function parseDamageInput(value: string): number | null {
  const cleaned = value.trim().replace(/%$/, "").trim();
  if (cleaned === "") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10) / 10 : null;
}

/** Normalizes character text; blank clears the value. */
export function parseCharacterInput(value: string): string | null {
  const trimmed = value.trim().slice(0, 60);
  return trimmed === "" ? null : trimmed;
}

export interface GridItemPosition { top: number; left: number }
export type GridNavigationResult = number | "before" | "after";

const ROW_TOLERANCE = 4;

function groupRows(positions: GridItemPosition[]): number[][] {
  const rows: number[][] = [];
  positions
    .map((position, index) => ({ position, index }))
    .sort((a, b) => a.position.top - b.position.top || a.position.left - b.position.left)
    .forEach(({ position, index }) => {
      const row = rows.find((candidate) => Math.abs((positions[candidate[0]!]?.top ?? 0) - position.top) <= ROW_TOLERANCE);
      if (row) row.push(index);
      else rows.push([index]);
    });
  return rows.map((row) => row.sort((a, b) => (positions[a]?.left ?? 0) - (positions[b]?.left ?? 0)));
}

/** Left: previous tag (wraps). */
export function handleArrowLeft(current: number, count: number): number {
  return (current - 1 + count) % count;
}

/** Right: next tag (wraps). */
export function handleArrowRight(current: number, count: number): number {
  return (current + 1) % count;
}

function verticalMove(positions: GridItemPosition[], current: number, step: 1 | -1): GridNavigationResult {
  const rows = groupRows(positions);
  const rowIndex = rows.findIndex((row) => row.includes(current));
  const targetRow = rows[rowIndex + step];
  if (!targetRow) return step === 1 ? "after" : "before";
  const left = positions[current]?.left ?? 0;
  return targetRow.reduce((best, index) =>
    Math.abs((positions[index]?.left ?? 0) - left) < Math.abs((positions[best]?.left ?? 0) - left) ? index : best, targetRow[0]!);
}

/** Up: tag in the row above; "before" from the top row (focus Event type). */
export function handleArrowUp(positions: GridItemPosition[], current: number): GridNavigationResult {
  return verticalMove(positions, current, -1);
}

/** Down: tag in the row below; "after" from the bottom row (focus Event note). */
export function handleArrowDown(positions: GridItemPosition[], current: number): GridNavigationResult {
  return verticalMove(positions, current, 1);
}
