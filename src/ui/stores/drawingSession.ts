import { writable, get } from 'svelte/store';
import type { Point, Shape } from '../../core/domain/types.js';
import type { MeasurementIdentity } from '../../core/domain/entities.js';
import { snap, type SnapResult, type SnapTarget } from '../../core/drawing/snap.js';
import { distance } from '../../core/drawing/geometry.js';
import type { ShapeParams } from '../../core/drawing/drawingEngine.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { activeSurface, executeCommand, selectMeasurement } from './studioSession.js';

// docs/18_DRAWING_ENGINE.md §1/§4 + docs/15_UX_SPECIFICATION.md §5 F1/§13/§14 — the Tool Dock
// interaction layer. This module owns *in-progress* drawing state only; the moment a shape is
// valid it is handed to the exact same `createMeasurementCommand` → `CommandStack` path a dev
// hook or AI ghost-commit would use (PD-013: no separate creation path). `drawingEngine.create()`
// remains the single validation gate — it only ever runs at commit time (buildShapeParams below
// never calls it directly), matching 23_API.md §2.1's "caller validates interactively" contract.
//
// Pan/Curve/AI/Import tools are intentionally absent (docs/UI_CHECKPOINT_REVIEW.md next-slice
// plan): Pan needs a Surface↔screen viewport transform that doesn't exist yet (ISS-010), Curve's
// control-point UX isn't specified in enough detail, AI is ISS-009 (its own Application slice),
// Import needs StorageAdapter (ISS-008).

export type DrawingTool = 'select' | 'polygon' | 'rectangle' | 'circle' | 'freehand' | 'line';

interface PointListDraft {
  readonly kind: 'points';
  readonly tool: 'polygon' | 'freehand' | 'line';
  readonly points: readonly Point[];
}

interface DragDraft {
  readonly kind: 'drag';
  readonly tool: 'rectangle' | 'circle';
  readonly origin: Point;
  readonly current: Point;
}

export type DrawingDraft = PointListDraft | DragDraft;

interface PointerModifiers {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const NO_MODIFIERS: PointerModifiers = { shiftKey: false, altKey: false };

/** 18 §4 — tolerance is defined in screen space and converted to Surface space by the caller.
 * Surface space == CSS-pixel space today (disclosed, CanvasStage.svelte / ISS-010), so this is
 * used directly rather than through a zoom-aware conversion that doesn't exist yet. */
const SNAP_TOLERANCE_SURFACE_UNITS = 8;

/** Freehand traces a point only every this many Surface units of cursor travel — without a
 * floor, a single fast mousemove could otherwise add hundreds of near-duplicate points. */
const FREEHAND_MIN_STEP = 3;

export const activeTool = writable<DrawingTool>('select');
/** 15 §13 `S` — persistent user preference; `⌥`/Alt is a *temporary* override on top of this,
 * never the other way around (18 §4: "Alt временно изключва"). */
export const snapEnabled = writable(true);
export const drawingDraft = writable<DrawingDraft | null>(null);
/** the cursor's current Surface-space position while a tool is armed — drives the live
 * look-ahead segment/drag-preview and the live numeric label (consumed by CanvasStage). */
export const cursorSurfacePoint = writable<Point | null>(null);
export const snapTarget = writable<SnapTarget | undefined>(undefined);

/** true only while the mouse button is held during a freehand trace (18 §2: Freehand is a raw
 * point list, distinct from Polygon's discrete-click model even though both are `kind: 'points'`
 * drafts here). Plain module state, not a store — nothing outside this file needs to react to it. */
let tracing = false;

/** 14 §14.1 — holding Shift while activating a tool keeps it armed after a shape commits
 * (serial drawing, e.g. repeated roofing/landscaping shapes) instead of reverting to Select. */
let serialArmed = false;

const MEASUREMENT_COLORS = [
  '#2E7D32',
  '#1565C0',
  '#E65100',
  '#6A1B9A',
  '#00838F',
  '#C62828',
  '#4E342E',
  '#37474F',
];

function newId(): string {
  return crypto.randomUUID();
}

function otherShapes(): Shape[] {
  const surface = get(activeSurface);
  if (!surface) return [];
  return surface.layers.flatMap((l) => l.measurements.map((m) => m.shape));
}

/** 18 §4 — the single snap decision for one cursor position, parameterized by what "closing
 * back to the start" and "constrain to the last segment" mean for the tool currently being
 * drawn. `lastSegmentStart`/`firstVertexOfCurrentShape` are `undefined` for tools/moments where
 * they don't apply (e.g. before the first point exists, or for Line which has no self-close
 * concept) — `snap()` already treats absence as "that target kind doesn't apply". */
function resolveSnap(
  cursor: Point,
  modifiers: PointerModifiers,
  lastSegmentStart: Point | undefined,
  firstVertexOfCurrentShape: Point | undefined,
): SnapResult {
  // `exactOptionalPropertyTypes` — SnapContext's optional fields must be *absent*, not present
  // with value `undefined`, so they're spread in conditionally rather than assigned directly.
  return snap(cursor, {
    otherShapes: otherShapes(),
    toleranceSurfaceUnits: SNAP_TOLERANCE_SURFACE_UNITS,
    ...(lastSegmentStart ? { lastSegmentStart } : {}),
    ...(firstVertexOfCurrentShape ? { firstVertexOfCurrentShape } : {}),
    snapEnabled: get(snapEnabled) && !modifiers.altKey,
    angleConstraintHeld: modifiers.shiftKey,
  });
}

function isCloseDistance(a: Point, b: Point): boolean {
  return distance(a, b) <= SNAP_TOLERANCE_SURFACE_UNITS;
}

/** Builds the final `ShapeParams` for a completed draft, or `null` for a degenerate draw (e.g. a
 * click-without-drag on a Rectangle tool, or a Freehand trace that never moved) — mirrors 18 §6's
 * "silently reject, return to prior valid state" pattern rather than surfacing an error for a
 * normal, user-reachable non-event. */
function buildShapeParams(draft: DrawingDraft): ShapeParams | null {
  if (draft.kind === 'points') {
    if (draft.tool === 'polygon') {
      if (draft.points.length < 3) return null;
      return { type: 'polygon', vertices: draft.points };
    }
    if (draft.tool === 'line') {
      if (draft.points.length < 2) return null;
      return { type: 'line', from: draft.points[0]!, to: draft.points[1]! };
    }
    // freehand
    if (draft.points.length < 2) return null;
    const closed = draft.points.length >= 3 && isCloseDistance(draft.points[0]!, draft.points[draft.points.length - 1]!);
    return { type: 'freehand', points: draft.points, closed };
  }

  const { tool, origin, current } = draft;
  if (tool === 'rectangle') {
    const width = Math.abs(current.x - origin.x);
    const height = Math.abs(current.y - origin.y);
    if (width <= 0 || height <= 0) return null;
    return {
      type: 'rectangle',
      origin: { x: Math.min(origin.x, current.x), y: Math.min(origin.y, current.y) },
      width,
      height,
    };
  }
  // circle
  const radius = distance(origin, current);
  if (radius <= 0) return null;
  return { type: 'circle', center: origin, radius };
}

type MeasurementCategory = 'area' | 'line';

function categoryOf(shapeParams: ShapeParams): MeasurementCategory {
  if (shapeParams.type === 'line') return 'line';
  if (shapeParams.type === 'freehand' && !shapeParams.closed) return 'line';
  return 'area';
}

/** F1 (15 §5): "auto 'Area 1', преименуване inline по желание" — no naming dialog. Count is
 * scoped to the whole Surface (not per-category) so numbers stay unique and legible together. */
function nextIdentity(category: MeasurementCategory): MeasurementIdentity {
  const surface = get(activeSurface);
  const count = surface ? surface.layers.reduce((n, l) => n + l.measurements.length, 0) : 0;
  const color = MEASUREMENT_COLORS[count % MEASUREMENT_COLORS.length]!;
  const label = category === 'area' ? 'Area' : 'Line';
  return { name: `${label} ${count + 1}`, color };
}

function clearDraft(): void {
  tracing = false;
  drawingDraft.set(null);
  cursorSurfacePoint.set(null);
  snapTarget.set(undefined);
}

/** 14 §14.1 "Draw → auto-select" + PD-013 (same commit path as manual/AI). Silently discards a
 * degenerate draft (buildShapeParams returned null) instead of erroring — the user just didn't
 * draw anything, which is not a failure. */
function commitDraft(): void {
  const draft = get(drawingDraft);
  clearDraft();
  if (!draft) return;

  const shapeParams = buildShapeParams(draft);
  if (!shapeParams) return;

  const surface = get(activeSurface);
  if (!surface) return;
  const layerId = surface.layers[0]!.id;
  const measurementId = newId();
  const identity = nextIdentity(categoryOf(shapeParams));

  executeCommand((s) =>
    createMeasurementCommand({
      surface: s,
      layerId,
      measurementId,
      shapeParams,
      identity,
      provenance: 'Manual',
    }),
  );
  selectMeasurement(measurementId);

  if (!serialArmed) activeTool.set('select');
}

/** Switches the active tool, cancelling any in-progress draft (switching tools mid-draw discards
 * it — there is no cross-tool draft handoff). `keepArmed` is the Shift-hold serial-draw request
 * (15 §14.1), read by the caller from the keydown event that triggered the tool switch. */
export function setTool(tool: DrawingTool, options?: { readonly keepArmed?: boolean }): void {
  clearDraft();
  serialArmed = options?.keepArmed ?? false;
  activeTool.set(tool);
}

export function toggleSnap(): void {
  snapEnabled.update((v) => !v);
}

export function pointerDown(point: Point, modifiers: PointerModifiers = NO_MODIFIERS): void {
  const tool = get(activeTool);
  if (tool === 'select') return;

  if (tool === 'rectangle' || tool === 'circle') {
    const snapped = resolveSnap(point, modifiers, undefined, undefined);
    drawingDraft.set({ kind: 'drag', tool, origin: snapped.position, current: snapped.position });
    return;
  }

  const draft = get(drawingDraft);
  const pointsDraft = draft?.kind === 'points' ? draft : null;

  if (!pointsDraft) {
    if (tool === 'freehand') tracing = true;
    const snapped = resolveSnap(point, modifiers, undefined, undefined);
    drawingDraft.set({ kind: 'points', tool, points: [snapped.position] });
    return;
  }

  if (tool === 'freehand') return; // trace continues via pointerMove; pointerUp commits

  const lastSegmentStart = pointsDraft.points[pointsDraft.points.length - 1];
  const firstVertex = tool === 'polygon' ? pointsDraft.points[0] : undefined;
  const snapped = resolveSnap(point, modifiers, lastSegmentStart, firstVertex);

  if (tool === 'polygon' && snapped.target?.kind === 'self' && pointsDraft.points.length >= 3) {
    commitDraft();
    return;
  }

  const nextPoints = [...pointsDraft.points, snapped.position];
  drawingDraft.set({ ...pointsDraft, points: nextPoints });
  if (tool === 'line' && nextPoints.length === 2) commitDraft();
}

export function pointerMove(point: Point, modifiers: PointerModifiers = NO_MODIFIERS): void {
  const tool = get(activeTool);
  if (tool === 'select') return;

  const draft = get(drawingDraft);

  if (draft?.kind === 'drag') {
    const snapped = resolveSnap(point, modifiers, draft.origin, undefined);
    drawingDraft.set({ ...draft, current: snapped.position });
    cursorSurfacePoint.set(snapped.position);
    snapTarget.set(snapped.target);
    return;
  }

  if (draft?.kind === 'points') {
    const lastSegmentStart = draft.points[draft.points.length - 1];
    const firstVertex = draft.tool === 'polygon' ? draft.points[0] : undefined;
    const snapped = resolveSnap(point, modifiers, lastSegmentStart, firstVertex);
    cursorSurfacePoint.set(snapped.position);
    snapTarget.set(snapped.target);

    if (tracing && draft.tool === 'freehand') {
      const last = draft.points[draft.points.length - 1]!;
      if (distance(last, snapped.position) >= FREEHAND_MIN_STEP) {
        drawingDraft.set({ ...draft, points: [...draft.points, snapped.position] });
      }
    }
    return;
  }

  // armed tool, no draft yet — hover-only preview (cursor + affordance snap glyph)
  const snapped = resolveSnap(point, modifiers, undefined, undefined);
  cursorSurfacePoint.set(snapped.position);
  snapTarget.set(snapped.target);
}

export function pointerUp(point: Point, modifiers: PointerModifiers = NO_MODIFIERS): void {
  const draft = get(drawingDraft);
  if (!draft) return;

  if (draft.kind === 'drag') {
    const snapped = resolveSnap(point, modifiers, draft.origin, undefined);
    drawingDraft.set({ ...draft, current: snapped.position });
    commitDraft();
    return;
  }

  if (draft.tool === 'freehand' && tracing) {
    tracing = false;
    commitDraft();
  }
  // polygon/line points-drafts commit from pointerDown (click semantics) — pointerUp is a no-op
}

/** 15 §13 `Enter` — "Затваряне на полигон / Accept ghost". Only Polygon/Line have a meaningful
 * "not enough points yet" precondition to gate on; ignored otherwise (no-op, not an error). */
export function handleEnter(): void {
  const draft = get(drawingDraft);
  if (!draft || draft.kind !== 'points') return;
  if (draft.tool === 'polygon' && draft.points.length >= 3) commitDraft();
  else if (draft.tool === 'line' && draft.points.length >= 2) commitDraft();
}

/** 15 §13 `Esc` — cancels the in-progress draft with no trace. Deliberately does not reset the
 * active tool (only the geometry) — the user stays armed on the tool they picked. */
export function handleEscape(): void {
  clearDraft();
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowDrawingDev: {
      activeTool,
      snapEnabled,
      drawingDraft,
      cursorSurfacePoint,
      snapTarget,
      setTool,
      toggleSnap,
      pointerDown,
      pointerMove,
      pointerUp,
      handleEnter,
      handleEscape,
      get,
    },
  });
}
