import { writable, get } from 'svelte/store';
import type { MeasurementId } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { pointInPolygon } from '../../core/drawing/hitTest.js';
import { exceedsDragThreshold } from '../interaction/dragThreshold.js';

// PO request (draggable polygon labels) — same drag-lifecycle shape as imageResizeSession.ts/
// vertexEditSession.ts: a live-preview store the caller (CanvasStage.svelte) reads to override a
// chip's displayed position while dragging, committed via a real Application command only on
// pointerUp. "An invalid candidate simply leaves the preview frozen at the last valid position" —
// the same rule vertexEditSession.ts already documents for vertex edits — is how the "label must
// stay inside its own polygon" constraint is enforced: every candidate is checked against
// `pointInPolygon` before being accepted, so a dragged-past-the-edge label just stops at the
// boundary instead of continuing to follow the cursor.

export interface LabelDrag {
  readonly measurementId: MeasurementId;
  readonly dx: number;
  readonly dy: number;
}

export const labelDrag = writable<LabelDrag | null>(null);

interface DragState {
  readonly measurementId: MeasurementId;
  readonly centroid: Point;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startDx: number;
  readonly startDy: number;
  moved: boolean;
}

let drag: DragState | null = null;

/** `clientX`/`clientY` are the mousedown's screen coordinates; `centroid`/`currentOffset` are
 * already known to the caller (CanvasStage.svelte, from the same data the chip was positioned
 * with) — this module has no reason to recompute either. */
export function pointerDown(
  measurementId: MeasurementId,
  clientX: number,
  clientY: number,
  centroid: Point,
  currentOffset: { readonly dx: number; readonly dy: number } | undefined,
): void {
  drag = {
    measurementId,
    centroid,
    startClientX: clientX,
    startClientY: clientY,
    startDx: currentOffset?.dx ?? 0,
    startDy: currentOffset?.dy ?? 0,
    moved: false,
  };
  labelDrag.set({ measurementId, dx: drag.startDx, dy: drag.startDy });
}

/** `scale` converts a screen-pixel delta to a Surface-space (world) delta (same convention as
 * every other zoom-aware drag in this codebase, e.g. CanvasStage.svelte's own hit-test
 * tolerances). `vertices` is the *current* polygon boundary — read fresh on every move so a
 * concurrent geometry edit elsewhere can never leave a stale containment check. */
export function pointerMove(clientX: number, clientY: number, scale: number, vertices: readonly Point[]): void {
  if (!drag) return;
  if (exceedsDragThreshold(drag.startClientX, drag.startClientY, clientX, clientY)) drag.moved = true;

  const worldDx = (clientX - drag.startClientX) / scale;
  const worldDy = (clientY - drag.startClientY) / scale;
  const candidateDx = drag.startDx + worldDx;
  const candidateDy = drag.startDy + worldDy;
  const candidatePoint: Point = { x: drag.centroid.x + candidateDx, y: drag.centroid.y + candidateDy };

  if (!pointInPolygon(candidatePoint, vertices)) return; // outside — freeze at the last valid preview

  labelDrag.set({ measurementId: drag.measurementId, dx: candidateDx, dy: candidateDy });
}

/** Returns the final `{measurementId, dx, dy}` to commit, or `null` if nothing should be
 * committed (never started, or never crossed the drag threshold — a plain click on the chip
 * stays a no-op, same "click-without-drag is discarded silently" convention used everywhere else
 * a drag can also just be a click, e.g. drawingSession.ts's degenerate-rectangle discard). Always
 * clears the live preview, whether or not anything is returned. */
export function pointerUp(): { readonly measurementId: MeasurementId; readonly dx: number; readonly dy: number } | null {
  const current = get(labelDrag);
  const moved = drag?.moved ?? false;
  const measurementId = drag?.measurementId;
  labelDrag.set(null);
  drag = null;
  if (!moved || !current || current.measurementId !== measurementId) return null;
  return { measurementId: current.measurementId, dx: current.dx, dy: current.dy };
}

/** Cancels an in-progress drag with no commit — mirrors vertexEditSession.ts's cancelDrag(),
 * same "Escape/deselect/tool-switch discards a live preview" convention. */
export function cancelDrag(): void {
  labelDrag.set(null);
  drag = null;
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowLabelDragDev: { labelDrag, pointerDown, pointerMove, pointerUp, cancelDrag, get },
  });
}
