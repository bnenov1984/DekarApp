import { writable, get } from 'svelte/store';
import type { MeasurementId } from '../../core/domain/entities.js';
import { exceedsDragThreshold } from '../interaction/dragThreshold.js';

// PO request (vertex label drag, grilling session 2026-11-18) — same drag-lifecycle shape as
// labelDragSession.ts (a live-preview store the caller, CanvasStage.svelte, reads to override a
// label's displayed position while dragging, committed via a real Application command only on
// pointerUp). Differs from that module in exactly one way: the boundary isn't "stay inside the
// polygon" (meaningless here — vertex labels exist on every shape type, not just Polygon) but a
// fixed circular radius around the vertex's own point. And unlike that module's "freeze at the
// last valid position" rule, a candidate past the radius is *clamped* onto the circle's edge in
// the cursor's current direction (grilling decision) — the label keeps tracking the cursor
// smoothly around the rim instead of sticking wherever it first touched the limit, which is the
// more natural feel for a round boundary specifically.

/** Fixed screen-pixel radius, divided by the viewport's zoom scale by the caller — same "screen-
 * pixel constant, scale-converted" convention as every other size constraint in this codebase
 * (sceneRenderer.ts's `vertexHandleRadius`, CanvasStage.svelte's hit-test tolerances). Generous
 * enough to actually clear something underneath, not just nudge a few px. */
export const VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX = 48;

export interface VertexLabelDrag {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly dx: number;
  readonly dy: number;
}

export const vertexLabelDrag = writable<VertexLabelDrag | null>(null);

interface DragState {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startDx: number;
  readonly startDy: number;
  moved: boolean;
}

let drag: DragState | null = null;

/** `clientX`/`clientY` are the mousedown's screen coordinates; `currentOffset` is already known
 * to the caller (CanvasStage.svelte, from the same data the label was positioned with). */
export function pointerDown(
  measurementId: MeasurementId,
  vertexIndex: number,
  clientX: number,
  clientY: number,
  currentOffset: { readonly dx: number; readonly dy: number } | undefined,
): void {
  drag = {
    measurementId,
    vertexIndex,
    startClientX: clientX,
    startClientY: clientY,
    startDx: currentOffset?.dx ?? 0,
    startDy: currentOffset?.dy ?? 0,
    moved: false,
  };
  vertexLabelDrag.set({ measurementId, vertexIndex, dx: drag.startDx, dy: drag.startDy });
}

/** `scale` converts a screen-pixel delta to a Surface-space (world) delta, same convention as
 * every other zoom-aware drag in this codebase. Unlike labelDragSession's polygon check, the
 * vertex's own anchor point never needs re-fetching mid-drag — it's fixed for the duration of this
 * one gesture, same as the centroid is for that module. */
export function pointerMove(clientX: number, clientY: number, scale: number): void {
  if (!drag) return;
  if (exceedsDragThreshold(drag.startClientX, drag.startClientY, clientX, clientY)) drag.moved = true;

  const worldDx = (clientX - drag.startClientX) / scale;
  const worldDy = (clientY - drag.startClientY) / scale;
  let candidateDx = drag.startDx + worldDx;
  let candidateDy = drag.startDy + worldDy;

  const maxWorldRadius = VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX / scale;
  const dist = Math.hypot(candidateDx, candidateDy);
  if (dist > maxWorldRadius && dist > 0) {
    const factor = maxWorldRadius / dist;
    candidateDx *= factor;
    candidateDy *= factor;
  }

  vertexLabelDrag.set({ measurementId: drag.measurementId, vertexIndex: drag.vertexIndex, dx: candidateDx, dy: candidateDy });
}

/** Returns the final `{measurementId, vertexIndex, dx, dy}` to commit, or `null` if nothing
 * should be committed (never started, or never crossed the drag threshold — a plain click stays
 * a no-op, same convention labelDragSession.ts documents). Always clears the live preview. */
export function pointerUp(): {
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly dx: number;
  readonly dy: number;
} | null {
  const current = get(vertexLabelDrag);
  const moved = drag?.moved ?? false;
  const measurementId = drag?.measurementId;
  const vertexIndex = drag?.vertexIndex;
  vertexLabelDrag.set(null);
  drag = null;
  if (!moved || !current || current.measurementId !== measurementId || current.vertexIndex !== vertexIndex) return null;
  return { measurementId: current.measurementId, vertexIndex: current.vertexIndex, dx: current.dx, dy: current.dy };
}

/** Cancels an in-progress drag with no commit — same "Escape/deselect/tool-switch discards a live
 * preview" convention as labelDragSession.ts's own cancelDrag(). */
export function cancelDrag(): void {
  vertexLabelDrag.set(null);
  drag = null;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowVertexLabelDragDev: { vertexLabelDrag, pointerDown, pointerMove, pointerUp, cancelDrag, get },
  });
}
