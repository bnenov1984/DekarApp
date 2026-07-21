import { writable, get } from 'svelte/store';
import type { Point, Shape } from '../../core/domain/types.js';
import type { Measurement, MeasurementId } from '../../core/domain/entities.js';
import {
  editVertex,
  addVertex,
  removeVertex,
  resizeRectangleCorner,
  resizeCircleRadius,
  translateShape,
  type RectangleCorner,
} from '../../core/drawing/drawingEngine.js';
import { findVertexAt, findEdgeAt, findRectangleCornerAt, isNearCircleHandle, hitTestShape } from '../../core/drawing/hitTest.js';
import { snap } from '../../core/drawing/snap.js';
import { editVertexCommand } from '../../application/commands/editVertex.js';
import { addVertexCommand } from '../../application/commands/addVertex.js';
import { removeVertexCommand } from '../../application/commands/removeVertex.js';
import { resizeRectangleCommand } from '../../application/commands/resizeRectangle.js';
import { resizeCircleCommand } from '../../application/commands/resizeCircle.js';
import { translateMeasurementCommand } from '../../application/commands/translateMeasurement.js';
import { activeSurface, executeCommand } from './studioSession.js';
import { snapEnabled } from './drawingSession.js';

// docs/18_DRAWING_ENGINE.md §6 — manipulation of an already-selected Measurement's shape. Every
// shape type gets *something* here (broadened from the original Polygon/Curve/Freehand-only
// vertex editing, per live PO testing): Polygon/Curve/Freehand keep vertex-drag/edge-insert-drag
// exactly as before; Rectangle gets 4 corner-resize handles; Circle gets 1 radius-resize handle;
// every shape type (including Rectangle/Circle/Line) additionally gets whole-shape move by
// dragging the body — hit-tested last, after any more-specific handle, so a corner/vertex/edge
// drag is never shadowed by the broader body-drag hit test.
//
// PO follow-up ("unify object selection and edit state") — there is no separate "vertex-editing"
// mode anymore. `studioSession.ts`'s `selectedMeasurementId` alone decides whether a shape's
// handles are shown/draggable (CanvasStage.svelte); this module only knows about the pointer
// mechanics of an in-progress drag, driven by an explicit `measurementId` the caller already
// knows is selected — it doesn't track "which shape is currently editable" itself, unlike the
// deleted `vertexEditingId`/`enterVertexEditing`. The locked-Measurement gate (entities.ts's own
// contract: "protection from accidental editing") relocates to `pointerDown` below — the sole
// remaining choke point a drag can start from.
//
// Live drag preview calls the Core geometry function directly against the *original*
// (uncommitted) shape on every pointermove — never through the CommandStack — matching 18 §6's
// "an operation that would make the Shape invalid is rejected silently, UI just doesn't allow the
// drop there": an invalid candidate simply leaves `vertexDrag` unchanged (frozen at the last valid
// preview), so nothing invalid is ever visible or committable. Whole-shape move is the one
// exception — a rigid translation can never be invalid, so it always updates, no freeze needed.
// `pointerUp` commits through the real, already-tested Application commands, so only ever a
// position that has already passed validation once (or, for move, always-valid) reaches the
// CommandStack.

const SNAP_TOLERANCE_SURFACE_UNITS = 8; // same constant category as drawingSession/calibrationSession
const VERTEX_HIT_TOLERANCE = 8;
const EDGE_HIT_TOLERANCE = 8;
const MOVE_HIT_TOLERANCE = 8; // only matters for open shapes (Line) — closed shapes hit-test their interior

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

interface CornerDrag {
  readonly kind: 'corner';
  readonly corner: RectangleCorner;
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
}

interface RadiusDrag {
  readonly kind: 'radius';
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
}

interface MoveDrag {
  readonly kind: 'move';
  readonly startPoint: Point;
  readonly dx: number;
  readonly dy: number;
  readonly previewShape: Shape;
}

export type VertexEditDrag = VertexDrag | EdgeDrag | CornerDrag | RadiusDrag | MoveDrag;

export const vertexDrag = writable<VertexEditDrag | null>(null);

/** Which Measurement `vertexDrag` (if any) belongs to — set by `pointerDown`, read internally by
 * `pointerMove`/`pointerUp` so callers don't need to keep re-passing the id every event. Plain
 * module state, not a store — nothing outside this file needs to react to "which id," only to
 * `vertexDrag` itself (the live preview). */
let draggingMeasurementId: MeasurementId | null = null;

function findMeasurementEntity(measurementId: MeasurementId): Measurement | null {
  const surface = get(activeSurface);
  if (!surface) return null;
  for (const layer of surface.layers) {
    const found = layer.measurements.find((m) => m.id === measurementId);
    if (found) return found;
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

/** Clears any in-progress drag preview without committing it (Escape, deselection, switching
 * tools) — the numeric-input counterpart to a pointerUp that never happens. Safe to call even
 * when nothing is dragging. */
export function cancelDrag(): void {
  vertexDrag.set(null);
  draggingMeasurementId = null;
}

/** 21 §6.3's single click-to-edit entry point (CanvasStage.svelte) — `measurementId` is whichever
 * shape is already selected (`studioSession.ts`'s `selectedMeasurementId`); this only decides
 * whether the pointer landed on a handle/edge/vertex/body of *that* shape and, if so, starts the
 * matching drag preview. Refused for a locked Measurement (entities.ts's own contract, "protection
 * from accidental editing") — the sole choke point a drag can start from now that there's no
 * separate "enter edit mode" step. */
export function pointerDown(point: Point, modifiers: PointerModifiers, measurementId: MeasurementId): void {
  const measurement = findMeasurementEntity(measurementId);
  if (!measurement || measurement.locked) return;
  const shape = measurement.shape;
  draggingMeasurementId = measurementId;

  if (shape.type === 'polygon' || shape.type === 'curve' || shape.type === 'freehand') {
    const vertexIndex = findVertexAt(point, shape, VERTEX_HIT_TOLERANCE);
    if (vertexIndex !== null) {
      if (modifiers.altKey) {
        const result = removeVertex(shape, vertexIndex);
        if (result.ok) executeCommand((surface) => removeVertexCommand({ surface, measurementId, vertexIndex }));
        // result.ok === false (too few vertices / would self-intersect) — 18 §6 silent rejection.
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
      return;
    }

    if (hitTestShape(point, shape, MOVE_HIT_TOLERANCE)) {
      vertexDrag.set({ kind: 'move', startPoint: point, dx: 0, dy: 0, previewShape: shape });
    }
    return;
  }

  if (shape.type === 'rectangle') {
    const corner = findRectangleCornerAt(point, shape, VERTEX_HIT_TOLERANCE);
    if (corner !== null) {
      try {
        const preview = resizeRectangleCorner(shape, corner, point);
        vertexDrag.set({ kind: 'corner', corner, lastValidPosition: point, previewShape: preview });
      } catch {
        // degenerate starting drag — don't start it
      }
      return;
    }
    if (hitTestShape(point, shape, MOVE_HIT_TOLERANCE)) {
      vertexDrag.set({ kind: 'move', startPoint: point, dx: 0, dy: 0, previewShape: shape });
    }
    return;
  }

  if (shape.type === 'circle') {
    if (isNearCircleHandle(point, shape, VERTEX_HIT_TOLERANCE)) {
      try {
        const preview = resizeCircleRadius(shape, point);
        vertexDrag.set({ kind: 'radius', lastValidPosition: point, previewShape: preview });
      } catch {
        // degenerate (zero-radius) starting drag — don't start it
      }
      return;
    }
    if (hitTestShape(point, shape, MOVE_HIT_TOLERANCE)) {
      vertexDrag.set({ kind: 'move', startPoint: point, dx: 0, dy: 0, previewShape: shape });
    }
    return;
  }

  // Line — no resize handles requested this slice, whole-shape move only.
  if (hitTestShape(point, shape, MOVE_HIT_TOLERANCE)) {
    vertexDrag.set({ kind: 'move', startPoint: point, dx: 0, dy: 0, previewShape: shape });
  }
}

export function pointerMove(point: Point, modifiers: PointerModifiers): void {
  const measurementId = draggingMeasurementId;
  const drag = get(vertexDrag);
  if (!measurementId || !drag) return;
  const shape = findMeasurementEntity(measurementId)?.shape;
  if (!shape) return;

  if (drag.kind === 'move') {
    // Always valid (rigid transform) — no freeze/reject logic needed, unlike every other kind.
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    vertexDrag.set({ kind: 'move', startPoint: drag.startPoint, dx, dy, previewShape: translateShape(shape, dx, dy) });
    return;
  }

  const snapped = resolveSnap(point, modifiers, measurementId);

  try {
    if (drag.kind === 'vertex') {
      const preview = editVertex(shape, drag.index, snapped);
      vertexDrag.set({ kind: 'vertex', index: drag.index, lastValidPosition: snapped, previewShape: preview });
    } else if (drag.kind === 'edge') {
      const preview = addVertex(shape, drag.edgeIndex, snapped);
      vertexDrag.set({ kind: 'edge', edgeIndex: drag.edgeIndex, lastValidPosition: snapped, previewShape: preview });
    } else if (drag.kind === 'corner') {
      if (shape.type !== 'rectangle') return;
      const preview = resizeRectangleCorner(shape, drag.corner, snapped);
      vertexDrag.set({ kind: 'corner', corner: drag.corner, lastValidPosition: snapped, previewShape: preview });
    } else {
      if (shape.type !== 'circle') return;
      const preview = resizeCircleRadius(shape, snapped);
      vertexDrag.set({ kind: 'radius', lastValidPosition: snapped, previewShape: preview });
    }
  } catch {
    // invalid candidate — freeze at the last valid preview, don't update
  }
}

export function pointerUp(): void {
  const measurementId = draggingMeasurementId;
  const drag = get(vertexDrag);
  vertexDrag.set(null);
  draggingMeasurementId = null;
  if (!measurementId || !drag) return;

  if (drag.kind === 'vertex') {
    executeCommand((surface) =>
      editVertexCommand({ surface, measurementId, vertexIndex: drag.index, newPosition: drag.lastValidPosition }),
    );
  } else if (drag.kind === 'edge') {
    executeCommand((surface) =>
      addVertexCommand({ surface, measurementId, edgeIndex: drag.edgeIndex, position: drag.lastValidPosition }),
    );
  } else if (drag.kind === 'corner') {
    executeCommand((surface) =>
      resizeRectangleCommand({ surface, measurementId, corner: drag.corner, newPosition: drag.lastValidPosition }),
    );
  } else if (drag.kind === 'radius') {
    executeCommand((surface) => resizeCircleCommand({ surface, measurementId, newEdgePosition: drag.lastValidPosition }));
  } else if (drag.dx !== 0 || drag.dy !== 0) {
    // 'move' — only commit if it actually moved (a click-without-drag stays a no-op, same
    // "degenerate draw discarded silently" pattern as drawingSession.ts's drag-based tools).
    executeCommand((surface) => translateMeasurementCommand({ surface, measurementId, dx: drag.dx, dy: drag.dy }));
  }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowVertexEditDev: {
      vertexDrag,
      cancelDrag,
      pointerDown,
      pointerMove,
      pointerUp,
      get,
    },
  });
}
