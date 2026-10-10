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
import { findLinkedVertices, findSharedEdges, type VertexRef } from '../../application/sharedVertices.js';
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
  /** PD-024 — Ctrl (Windows/Linux) or ⌘ (macOS) held while a vertex/edge drag starts, or with
   * Alt+click deletion, detaches the gesture: only the selected shape changes, not the neighbours
   * sharing that vertex or edge. */
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
}

/** PD-024 — a neighbour's vertex that moves along with the dragged one, and that neighbour's live
 * preview (CanvasStage draws it as an outline next to the dragged shape's own preview). */
export interface LinkedPreview {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly previewShape: Shape;
}

/** PD-024 — a neighbour sharing the dragged edge, which gains the same new vertex. */
export interface LinkedEdgePreview {
  readonly measurementId: MeasurementId;
  readonly edgeIndex: number;
  readonly previewShape: Shape;
}

interface VertexDrag {
  readonly kind: 'vertex';
  readonly index: number;
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
  /** Fixed at pointerDown for the whole drag; empty when detached or nothing is shared. */
  readonly linkedPreviews: readonly LinkedPreview[];
  readonly detached: boolean;
}

interface EdgeDrag {
  readonly kind: 'edge';
  readonly edgeIndex: number;
  readonly lastValidPosition: Point;
  readonly previewShape: Shape;
  /** Fixed at pointerDown, like VertexDrag's; empty when detached or the edge isn't shared. */
  readonly linkedPreviews: readonly LinkedEdgePreview[];
  readonly detached: boolean;
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

function otherShapes(excludeIds: ReadonlySet<MeasurementId>): Shape[] {
  const surface = get(activeSurface);
  if (!surface) return [];
  return surface.layers.flatMap((l) => l.measurements.filter((m) => !excludeIds.has(m.id)).map((m) => m.shape));
}

/** `excludeIds` — the dragged shape itself plus, for a linked vertex drag (PD-024), every
 * neighbour moving along with it: their committed geometry still has a vertex at the drag's
 * starting point, which would otherwise pull the cursor straight back to where it started. */
function resolveSnap(cursor: Point, modifiers: PointerModifiers, excludeIds: ReadonlySet<MeasurementId>): Point {
  return snap(cursor, {
    otherShapes: otherShapes(excludeIds),
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

/** PD-024 §4 — where several shapes have a point under the press, the *selected* one wins.
 * CanvasStage asks this at mousedown: when the press lands on a handle `pointerDown` would grab on
 * the selected shape (vertex, edge, rectangle corner, circle radius handle), it keeps that shape
 * selected instead of reselecting the topmost hit, so a linked or Ctrl/⌘-detached edit acts on
 * the shape the user is looking at. A press on the body doesn't count: there the user may well
 * mean the shape on top. Same tolerances as `pointerDown`. */
export function grabsSelectedHandle(point: Point, measurementId: MeasurementId): boolean {
  const measurement = findMeasurementEntity(measurementId);
  if (!measurement || measurement.locked || measurement.identity.hidden) return false;
  const shape = measurement.shape;
  if (shape.type === 'polygon' || shape.type === 'curve' || shape.type === 'freehand') {
    return findVertexAt(point, shape, VERTEX_HIT_TOLERANCE) !== null || findEdgeAt(point, shape, EDGE_HIT_TOLERANCE) !== null;
  }
  if (shape.type === 'rectangle') return findRectangleCornerAt(point, shape, VERTEX_HIT_TOLERANCE) !== null;
  if (shape.type === 'circle') return isNearCircleHandle(point, shape, VERTEX_HIT_TOLERANCE);
  return false;
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
      // PD-024 — the neighbours sharing this vertex are moved/deleted with it unless Ctrl/⌘
      // detaches the gesture. A locked neighbour blocks the linked gesture outright (the command
      // would refuse it anyway), the same silent no-op as trying to edit a locked shape.
      const detached = !!(modifiers.ctrlKey || modifiers.metaKey);
      const surface = get(activeSurface);
      const linked = detached || !surface ? [] : findLinkedVertices(surface, measurementId, vertexIndex);
      if (linked.some((ref) => findMeasurementEntity(ref.measurementId)?.locked)) return;

      if (modifiers.altKey) {
        deleteVertex(shape, measurementId, vertexIndex, linked, detached);
        return;
      }
      try {
        const preview = editVertex(shape, vertexIndex, point);
        const linkedPreviews = linked.map((ref) => ({
          ...ref,
          previewShape: editVertex(findMeasurementEntity(ref.measurementId)!.shape, ref.vertexIndex, point),
        }));
        vertexDrag.set({ kind: 'vertex', index: vertexIndex, lastValidPosition: point, previewShape: preview, linkedPreviews, detached });
      } catch {
        // degenerate starting position — don't start a drag
      }
      return;
    }

    const edgeIndex = findEdgeAt(point, shape, EDGE_HIT_TOLERANCE);
    if (edgeIndex !== null) {
      // PD-024 — a shared edge gains the new vertex in every shape that has it; same Ctrl/⌘
      // detach and locked-neighbour rules as the vertex drag above.
      const detached = !!(modifiers.ctrlKey || modifiers.metaKey);
      const surface = get(activeSurface);
      const shared = detached || !surface ? [] : findSharedEdges(surface, measurementId, edgeIndex);
      if (shared.some((ref) => findMeasurementEntity(ref.measurementId)?.locked)) return;
      try {
        const preview = addVertex(shape, edgeIndex, point);
        const linkedPreviews = shared.map((ref) => ({
          ...ref,
          previewShape: addVertex(findMeasurementEntity(ref.measurementId)!.shape, ref.edgeIndex, point),
        }));
        vertexDrag.set({ kind: 'edge', edgeIndex, lastValidPosition: point, previewShape: preview, linkedPreviews, detached });
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

/** Alt+click deletion (15 §13) for a click that never became a drag: CanvasStage only calls
 * `pointerDown` once the pointer crosses the drag threshold, so a still Alt+click reaches the
 * session here instead, at mouseup. Deletes the selected shape's vertex under `point` (and, per
 * PD-024, its linked neighbours') with the same rules as an Alt+drag; anything other than a vertex
 * is ignored. */
export function deleteVertexAt(point: Point, modifiers: PointerModifiers, measurementId: MeasurementId): void {
  const measurement = findMeasurementEntity(measurementId);
  if (!measurement || measurement.locked) return;
  const shape = measurement.shape;
  if (shape.type !== 'polygon' && shape.type !== 'curve' && shape.type !== 'freehand') return;
  const vertexIndex = findVertexAt(point, shape, VERTEX_HIT_TOLERANCE);
  if (vertexIndex === null) return;
  const detached = !!(modifiers.ctrlKey || modifiers.metaKey);
  const surface = get(activeSurface);
  const linked = detached || !surface ? [] : findLinkedVertices(surface, measurementId, vertexIndex);
  if (linked.some((ref) => findMeasurementEntity(ref.measurementId)?.locked)) return;
  deleteVertex(shape, measurementId, vertexIndex, linked, detached);
}

function deleteVertex(shape: Shape, measurementId: MeasurementId, vertexIndex: number, linked: readonly VertexRef[], detached: boolean): void {
  // Every participant must survive the deletion (too few vertices / would self-intersect), or
  // nothing happens — 18 §6 silent rejection, checked here because the command throws.
  const allOk = removeVertex(shape, vertexIndex).ok &&
    linked.every((ref) => removeVertex(findMeasurementEntity(ref.measurementId)!.shape, ref.vertexIndex).ok);
  if (allOk) executeCommand((surface) => removeVertexCommand({ surface, measurementId, vertexIndex, linked: !detached }));
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

  const linkedIds = drag.kind === 'vertex' || drag.kind === 'edge' ? drag.linkedPreviews.map((p) => p.measurementId) : [];
  const snapped = resolveSnap(point, modifiers, new Set([measurementId, ...linkedIds]));

  try {
    if (drag.kind === 'vertex') {
      // Every participant must stay valid, or the whole preview freezes (18 §6 silent rejection) —
      // the command applies the same all-or-nothing rule at commit.
      const preview = editVertex(shape, drag.index, snapped);
      const linkedPreviews = drag.linkedPreviews.map((linked) => ({
        ...linked,
        previewShape: editVertex(findMeasurementEntity(linked.measurementId)!.shape, linked.vertexIndex, snapped),
      }));
      vertexDrag.set({ ...drag, lastValidPosition: snapped, previewShape: preview, linkedPreviews });
    } else if (drag.kind === 'edge') {
      const preview = addVertex(shape, drag.edgeIndex, snapped);
      const linkedPreviews = drag.linkedPreviews.map((linked) => ({
        ...linked,
        previewShape: addVertex(findMeasurementEntity(linked.measurementId)!.shape, linked.edgeIndex, snapped),
      }));
      vertexDrag.set({ ...drag, lastValidPosition: snapped, previewShape: preview, linkedPreviews });
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
      editVertexCommand({ surface, measurementId, vertexIndex: drag.index, newPosition: drag.lastValidPosition, linked: !drag.detached }),
    );
  } else if (drag.kind === 'edge') {
    executeCommand((surface) =>
      addVertexCommand({ surface, measurementId, edgeIndex: drag.edgeIndex, position: drag.lastValidPosition, linked: !drag.detached }),
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
      deleteVertexAt,
      grabsSelectedHandle,
      pointerMove,
      pointerUp,
      get,
    },
  });
}
