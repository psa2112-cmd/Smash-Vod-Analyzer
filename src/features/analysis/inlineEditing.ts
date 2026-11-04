import { formatTimestamp } from "./analysisData";
import type { KeyboardEvent } from "react";

/** Keep time boxes free of letters, spaces and punctuation other than colons. */
export function sanitizeTimestampInput(value: string): string {
  return value.replace(/[^\d:]/g, "");
}

const WASD_TO_ARROW: Record<string, string> = { w: "ArrowUp", a: "ArrowLeft", s: "ArrowDown", d: "ArrowRight" };

/** Translate gaming keys to arrows; all other keys stay unchanged. */
export function toArrowKey(key: string): string {
  return WASD_TO_ARROW[key.toLowerCase()] ?? key;
}

/** A typed letter cannot trigger the browser's normal arrow action, so move its caret ourselves. */
export function handleTimestampArrowKey(event: KeyboardEvent<HTMLInputElement>): string {
  if (event.ctrlKey || event.metaKey || event.altKey) return event.key;
  const key = toArrowKey(event.key);
  if (key === event.key) return key;
  event.preventDefault();
  const input = event.currentTarget;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;
  const backwards = input.selectionDirection === "backward";
  const caret = backwards ? start : end;
  const next = key === "ArrowUp" ? 0 : key === "ArrowDown" ? input.value.length
    : key === "ArrowLeft" ? Math.max(0, (event.shiftKey ? caret : start) - (event.shiftKey || start === end ? 1 : 0))
    : Math.min(input.value.length, (event.shiftKey ? caret : end) + (event.shiftKey || start === end ? 1 : 0));
  if (event.shiftKey) {
    const anchor = backwards ? end : start;
    input.setSelectionRange(Math.min(anchor, next), Math.max(anchor, next), next < anchor ? "backward" : "forward");
  } else input.setSelectionRange(next, next);
  return key;
}

/**
 * Reads typed digits from right to left: the last 2 are seconds, the 2 before are minutes,
 * anything left over is hours. Colons are ignored, so "1:23" and "123" mean the same thing.
 * Returns null when there are no digits at all.
 */
function readTimestampDigits(input: string): number | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  const seconds = Number(digits.slice(-2));
  const minutes = Number(digits.slice(-4, -2) || "0");
  const hours = Number(digits.slice(0, -4) || "0");
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(totalSeconds) ? totalSeconds : null;
}

/** Turns typed digits into a tidy time like "0:01", "1:23", "12:34" or "1:23:45". Empty becomes "0:00". */
export function formatTimestampString(input: string): string {
  // Read the typed digits as seconds, then hand off to the one shared formatter.
  return formatTimestamp(readTimestampDigits(input) ?? 0);
}

/** Tidies a typed time using digits read right to left. Returns empty string when input is empty. */
export function formatTimestampInput(raw: string): string {
  return raw.trim() === "" ? "" : formatTimestampString(raw);
}

/** Converts any typed time (with or without colons) into total seconds; null when nothing was typed. */
export function parseTimestampInput(value: string): number | null {
  return readTimestampDigits(value);
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

/** Shared arrow-key navigation for tag grids (Add Event tagger and table tagger); null for non-arrow keys. */
export function navigateTagGrid(key: string, positions: GridItemPosition[], current: number): GridNavigationResult | null {
  const count = positions.length;
  const lowerKey = key.toLowerCase();
  if (key === "ArrowLeft" || lowerKey === "a") return handleArrowLeft(current, count);
  if (key === "ArrowRight" || lowerKey === "d") return handleArrowRight(current, count);
  if (key === "ArrowUp" || lowerKey === "w") return handleArrowUp(positions, current);
  if (key === "ArrowDown" || lowerKey === "s") return handleArrowDown(positions, current);
  return null;
}

/** Reads offset positions of rendered tag buttons for grid navigation. */
export function readGridPositions(elements: (HTMLElement | null)[]): GridItemPosition[] {
  return elements.map((element) => ({ top: element?.offsetTop ?? 0, left: element?.offsetLeft ?? 0 }));
}
