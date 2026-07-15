import { writable, get } from 'svelte/store';
import type { Point, PolygonShape } from '../../core/domain/types.js';
import type { MeasurementId } from '../../core/domain/entities.js';
import { canSplit, split } from '../../core/drawing/split.js';
import { splitCommand } from '../../application/commands/split.js';
import { activeSurface, executeCommand } from './studioSession.js';

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

function newId(): string {
  return crypto.randomUUID();
}

function polygonShape(measurementId: MeasurementId): PolygonShape | null {
  const surface = get(activeSurface);
  if (!surface) return null;
  for (const layer of surface.layers) {
    const found = layer.measurements.find((m) => m.id === measurementId);
    if (found) return found.shape.type === 'polygon' ? found.shape : null;
  }
  return null;
}

/** `X` keypress entry point (Studio.svelte). Returns `false` (no-op) for non-Polygon shapes —
 * `splitCommand` only supports Polygon (18 §5), mirrors `vertexEditSession.enterVertexEditing`'s
 * same-shape contract. */
export function startSplit(measurementId: MeasurementId): boolean {
  if (!polygonShape(measurementId)) return false;
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
      get,
    },
  });
}
