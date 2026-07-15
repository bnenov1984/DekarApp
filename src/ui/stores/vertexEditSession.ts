import { writable, get } from 'svelte/store';
import type { Point, Shape } from '../../core/domain/types.js';
import type { MeasurementId } from '../../core/domain/entities.js';
import { editVertex, addVertex, removeVertex } from '../../core/drawing/drawingEngine.js';
import { findVertexAt, findEdgeAt } from '../../core/drawing/hitTest.js';
import { snap } from '../../core/drawing/snap.js';
import { editVertexCommand } from '../../application/commands/editVertex.js';
import { addVertexCommand } from '../../application/commands/addVertex.js';
import { removeVertexCommand } from '../../application/commands/removeVertex.js';
import { activeSurface, executeCommand, selectMeasurement } from './studioSession.js';
import { snapEnabled } from './drawingSession.js';

// docs/18_DRAWING_ENGINE.md §6 — vertex editing on an already-committed Polygon/Curve/Freehand
// (Rectangle/Circle/Line have no editable point list, same restriction hitTest.ts's
// `findVertexAt`/`findEdgeAt` enforce). Entered via double-click (CanvasStage.svelte), exited via
// Esc or deselection.
//
// Live drag preview calls `editVertex`/`addVertex` directly against the *original* (uncommitted)
// shape on every pointermove — never through the CommandStack — matching 18 §6's "an operation
// that would make the Shape invalid is rejected silently, UI just doesn't allow the drop there":
// an invalid candidate simply leaves `vertexDrag` unchanged (frozen at the last valid preview),
// so nothing invalid is ever visible or committable. `pointerUp` commits `lastValidPosition`
// through the real `editVertexCommand`/`addVertexCommand` (already tested), so only ever a
// position that has already passed validation once reaches the CommandStack.

const SNAP_TOLERANCE_SURFACE_UNITS = 8; // same constant category as drawingSession/calibrationSession
const VERTEX_HIT_TOLERANCE = 8;
const EDGE_HIT_TOLERANCE = 8;

interface PointerModifiers {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

interface VertexDrag {
  readonly kind: 'vertex';
  readonly index: number;
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
}

interface EdgeDrag {
  readonly kind: 'edge';
  readonly edgeIndex: number;
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
}

export type VertexEditDrag = VertexDrag | EdgeDrag;

export const vertexEditingId = writable<MeasurementId | null>(null);
export const vertexDrag = writable<VertexEditDrag | null>(null);

function measurementShape(measurementId: MeasurementId): Shape | null {
  const surface = get(activeSurface);
  if (!surface) return null;
  for (const layer of surface.layers) {
    const found = layer.measurements.find((m) => m.id === measurementId);
    if (found) return found.shape;
  }
  return null;
}

function otherShapes(excludeId: MeasurementId): Shape[] {
  const surface = get(activeSurface);
  if (!surface) return [];
  return surface.layers.flatMap((l) => l.measurements.filter((m) => m.id !== excludeId).map((m) => m.shape));
}

function resolveSnap(cursor: Point, modifiers: PointerModifiers, excludeId: MeasurementId): Point {
  return snap(cursor, {
    otherShapes: otherShapes(excludeId),
    toleranceSurfaceUnits: SNAP_TOLERANCE_SURFACE_UNITS,
    snapEnabled: get(snapEnabled) && !modifiers.altKey,
    angleConstraintHeld: modifiers.shiftKey,
  }).position;
}

/** 15 §14.4 double-click entry point. Returns `false` (no-op) for shape types with no editable
 * point list — the caller (CanvasStage) doesn't need to duplicate that check. */
export function enterVertexEditing(measurementId: MeasurementId): boolean {
  const shape = measurementShape(measurementId);
  if (!shape) return false;
  if (shape.type !== 'polygon' && shape.type !== 'curve' && shape.type !== 'freehand') return false;

  selectMeasurement(measurementId);
  vertexEditingId.set(measurementId);
  vertexDrag.set(null);
  return true;
}

export function exitVertexEditing(): void {
  vertexEditingId.set(null);
  vertexDrag.set(null);
}

export function pointerDown(point: Point, modifiers: PointerModifiers): void {
  const measurementId = get(vertexEditingId);
  if (!measurementId) return;
  const shape = measurementShape(measurementId);
  if (!shape) return;

  const vertexIndex = findVertexAt(point, shape, VERTEX_HIT_TOLERANCE);
  if (vertexIndex !== null) {
    if (modifiers.altKey) {
      const result = removeVertex(shape, vertexIndex);
      if (result.ok) {
        executeCommand((surface) => removeVertexCommand({ surface, measurementId, vertexIndex }));
      }
      // result.ok === false (too few vertices / would self-intersect) — 18 §6 silent rejection,
      // no command pushed.
      return;
    }
    try {
      const preview = editVertex(shape, vertexIndex, point);
      vertexDrag.set({ kind: 'vertex', index: vertexIndex, lastValidPosition: point, previewShape: preview });
    } catch {
      // degenerate starting position — don't start a drag
    }
    return;
  }

  const edgeIndex = findEdgeAt(point, shape, EDGE_HIT_TOLERANCE);
  if (edgeIndex !== null) {
    try {
      const preview = addVertex(shape, edgeIndex, point);
      vertexDrag.set({ kind: 'edge', edgeIndex, lastValidPosition: point, previewShape: preview });
    } catch {
      // ignore — same silent-rejection pattern
    }
  }
}

export function pointerMove(point: Point, modifiers: PointerModifiers): void {
  const measurementId = get(vertexEditingId);
  const drag = get(vertexDrag);
  if (!measurementId || !drag) return;
  const shape = measurementShape(measurementId);
  if (!shape) return;

  const snapped = resolveSnap(point, modifiers, measurementId);

  try {
    const preview =
      drag.kind === 'vertex' ? editVertex(shape, drag.index, snapped) : addVertex(shape, drag.edgeIndex, snapped);
    vertexDrag.set({ ...drag, lastValidPosition: snapped, previewShape: preview });
  } catch {
    // invalid candidate (would self-intersect) — freeze at the last valid preview, don't update
  }
}

export function pointerUp(): void {
  const measurementId = get(vertexEditingId);
  const drag = get(vertexDrag);
  vertexDrag.set(null);
  if (!measurementId || !drag) return;

  if (drag.kind === 'vertex') {
    executeCommand((surface) =>
      editVertexCommand({ surface, measurementId, vertexIndex: drag.index, newPosition: drag.lastValidPosition }),
    );
  } else {
    executeCommand((surface) =>
      addVertexCommand({ surface, measurementId, edgeIndex: drag.edgeIndex, position: drag.lastValidPosition }),
    );
  }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowVertexEditDev: {
      vertexEditingId,
      vertexDrag,
      enterVertexEditing,
      exitVertexEditing,
      pointerDown,
      pointerMove,
      pointerUp,
      get,
    },
  });
}
