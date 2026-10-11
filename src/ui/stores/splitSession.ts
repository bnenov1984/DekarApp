import { writable, get } from 'svelte/store';
import type { Point, PolygonShape } from '../../core/domain/types.js';
import type { MeasurementId } from '../../core/domain/entities.js';
import { canSplit, split } from '../../core/drawing/split.js';
import { splitIntoParts, type SplitDistribution } from '../../core/drawing/splitParts.js';
import { splitCommand } from '../../application/commands/split.js';
import { splitIntoPartsCommand } from '../../application/commands/splitIntoParts.js';
import { activeSurface, executeCommand } from './studioSession.js';
import { setTool } from './drawingSession.js';

// docs/18_DRAWING_ENGINE.md §5 (PD-009) + docs/15_UX_SPECIFICATION.md §5 F7 — Split, triggered by
// the already-reserved `X` shortcut (15 §13) on a selected Polygon. Click-to-place points build
// the splitting (poly)line, same points-list mechanic as Polygon/Freehand in drawingSession.ts;
// `canSplit`/`split` (already fully tested, split.ts) drive both the live dual-area ghost preview
// and the commit gate — this module never duplicates that geometry, only calls it.
//
// Deliberately no snap: snapping to the polygon's own vertices would make it easy to reproduce
// ISS-001 (split line touching an existing vertex, PARKED by PO) far more often than an
// unassisted click would — skipped entirely rather than provoking a parked edge case.

export const splittingId = writable<MeasurementId | null>(null);
export const splitLinePoints = writable<Point[]>([]);
export const splitCursor = writable<Point | null>(null);

// PO request ("Redesign and fix Split functionality") — the new primary Split workflow: pick a
// part count + distribution from a small inline config under the Split button, then a single
// "Split polygon" click computes everything (core/drawing/splitParts.ts) with no canvas
// interaction at all. Kept as separate stores/state from `splittingId` above (which now serves
// only the retained, explicitly-labeled "Manual split" line-draw mode) so the two flows can never
// be confused with each other or accidentally active at the same time (`openSplitConfig`/
// `startSplit` each close the other).
export const splitConfigOpen = writable<MeasurementId | null>(null);
export const splitPartsCount = writable(2);
export const splitDistribution = writable<SplitDistribution>('equal');
/** Set by `confirmSplitParts()` when `splitIntoParts` returns `'NO_VALID_CUT'` (or an invalid
 * count) — a plain inline message for the config UI, cleared on the next config open/attempt. */
export const splitPartsError = writable<string | null>(null);

function newId(): string {
  return crypto.randomUUID();
}

function polygonShape(measurementId: MeasurementId): PolygonShape | null {
  const surface = get(activeSurface);
  if (!surface) return null;
  for (const layer of surface.layers) {
    const found = layer.measurements.find((m) => m.id === measurementId);
    if (found) return !found.locked && found.shape.type === 'polygon' ? found.shape : null;
  }
  return null;
}

/** `X` keypress entry point (Studio.svelte). Returns `false` (no-op) for non-Polygon shapes —
 * `splitCommand` only supports Polygon (18 §5), mirrors `vertexEditSession.enterVertexEditing`'s
 * same-shape contract — and for a locked Measurement (entities.ts's own contract, same
 * "protection from accidental editing" `enterVertexEditing` itself refuses on). */
export function startSplit(measurementId: MeasurementId): boolean {
  if (!polygonShape(measurementId)) return false;
  splitConfigOpen.set(null); // mutually exclusive with the Equal/Random config UI
  splittingId.set(measurementId);
  splitLinePoints.set([]);
  splitCursor.set(null);
  return true;
}

export function cancelSplit(): void {
  splittingId.set(null);
  splitLinePoints.set([]);
  splitCursor.set(null);
}

export function pointerDown(point: Point): void {
  if (!get(splittingId)) return;
  splitLinePoints.update((points) => [...points, point]);
}

export function pointerMove(point: Point): void {
  if (!get(splittingId)) return;
  splitCursor.set(point);
}

/** 15 §2.2 / W1 (Photoshop layout, 2026-10-11) — whether the tool bar's Split slot is enabled:
 * the selection is an unlocked Polygon (`startSplit`'s own contract) and nothing is being split
 * yet. The slot is disabled, never hidden, when this is false. */
export function canStartSplit(measurementId: MeasurementId | null): boolean {
  return measurementId !== null && get(splittingId) === null && polygonShape(measurementId) !== null;
}

/** The tool bar's Split slot — the same manual line split as the `X` key. A second click cancels
 * the split in progress, like clicking an active tool again. Starting leaves any armed drawing
 * tool, since a split line and a drawing tool can't both take the canvas clicks. */
export function toggleSplitTool(selectedId: MeasurementId | null): void {
  if (get(splittingId) !== null) {
    cancelSplit();
    return;
  }
  if (selectedId === null || !canStartSplit(selectedId)) return;
  setTool(null);
  startSplit(selectedId);
}

/** 15 §5 F7 step 4 — `Enter` confirms. Silently a no-op if the line doesn't cross the boundary
 * exactly twice yet (same "gate, don't error" pattern as Polygon/Line closing, drawingSession.ts). */
export function confirmSplit(): void {
  const measurementId = get(splittingId);
  if (!measurementId) return;
  const shape = polygonShape(measurementId);
  if (!shape) return;

  const points = get(splitLinePoints);
  if (!canSplit(shape, points)) return;

  const result = split(shape, points);
  if (!result.ok) return; // defensive — canSplit already guarantees this, never expected to fire

  const childIds: readonly [string, string] = [newId(), newId()];
  executeCommand((surface) =>
    splitCommand({ surface, parentMeasurementId: measurementId, splitLine: points, childIds }),
  );
  cancelSplit();
}

/** Opens the Equal/Random config UI for `measurementId` (PropertyPanel's Split button) — mutually
 * exclusive with the "Manual split" line-draw mode above. Resets the count/distribution/error to
 * sane defaults every time it's (re)opened, so a leftover error from a previous attempt or a
 * stale count from a different Measurement never lingers. */
export function openSplitConfig(measurementId: MeasurementId): boolean {
  if (!polygonShape(measurementId)) return false;
  cancelSplit(); // mutually exclusive with the manual line-draw mode
  splitConfigOpen.set(measurementId);
  splitPartsCount.set(2);
  splitDistribution.set('equal');
  splitPartsError.set(null);
  return true;
}

export function closeSplitConfig(): void {
  splitConfigOpen.set(null);
  splitPartsError.set(null);
}

/** The config UI's "Split polygon" action — computes the N child shapes (core/drawing/
 * splitParts.ts) from the live current count/distribution and, on success, persists them via
 * `splitIntoPartsCommand` as one atomic undo step. No canvas interaction of any kind: everything
 * needed is already in the config stores. Leaves `splitPartsError` set (and the config panel
 * open) on failure so the user sees why and can adjust the count/distribution and retry. */
export function confirmSplitParts(): void {
  const measurementId = get(splitConfigOpen);
  if (!measurementId) return;
  const shape = polygonShape(measurementId);
  if (!shape) {
    splitPartsError.set('This shape can no longer be split.');
    return;
  }

  const count = get(splitPartsCount);
  const distribution = get(splitDistribution);
  const result = splitIntoParts(shape, count, distribution);
  if (!result.ok) {
    splitPartsError.set(
      result.reason === 'INVALID_COUNT'
        ? 'Number of parts must be a whole number between 2 and 24.'
        : "Couldn't find a valid way to split this shape into that many parts — try a different count or distribution.",
    );
    return;
  }

  const childIds = result.value.map(() => newId());
  executeCommand((surface) =>
    splitIntoPartsCommand({ surface, parentMeasurementId: measurementId, childShapes: result.value, childIds }),
  );
  closeSplitConfig();
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowSplitDev: {
      splittingId,
      splitLinePoints,
      splitCursor,
      startSplit,
      cancelSplit,
      pointerDown,
      pointerMove,
      confirmSplit,
      splitConfigOpen,
      splitPartsCount,
      splitDistribution,
      splitPartsError,
      openSplitConfig,
      closeSplitConfig,
      confirmSplitParts,
      get,
    },
  });
}
