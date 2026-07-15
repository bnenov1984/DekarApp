import { writable, get } from 'svelte/store';
import type { Point, Shape } from '../../core/domain/types.js';
import { snap, type SnapResult, type SnapTarget } from '../../core/drawing/snap.js';
import { distance } from '../../core/drawing/geometry.js';
import { fromReferenceLine, assessPlausibility, type PlausibilityResult } from '../../core/calibration/calibrationService.js';
import { recalibrateCommand } from '../../application/commands/recalibrate.js';
import { activeSurface, executeCommand } from './studioSession.js';
import { setTool, snapEnabled } from './drawingSession.js';

// docs/19_IMPORT_EXPORT.md §3 (CalibrationService) + docs/15_UX_SPECIFICATION.md §5 F2/W3 —
// manually-triggered calibration (ScaleChip click), since Import — F2's auto-trigger — doesn't
// exist yet (ISS-008). Produces the same reference-line-then-declare-length flow F2 describes;
// when Import lands it only needs to call `startCalibration()` on open, no rework here.
//
// The reference line is *transient*: unlike the Distance tool, it never becomes a persisted
// Measurement — it only ever feeds `CalibrationService.fromReferenceLine`.

export type CalibrationUnit = 'm' | 'ft';

interface CalibrationLineDraft {
  readonly from: Point;
  readonly to?: Point;
}

/** Same tolerance category as drawingSession.ts's SNAP_TOLERANCE_SURFACE_UNITS — Surface space
 * == CSS-pixel space today (ISS-010), so used directly. */
const SNAP_TOLERANCE_SURFACE_UNITS = 8;

export const calibrating = writable(false);
export const calibrationDraft = writable<CalibrationLineDraft | null>(null);
export const calibrationCursor = writable<Point | null>(null);
export const calibrationSnapTarget = writable<SnapTarget | undefined>(undefined);
/** Cached at commit time (US-033) — not continuously re-evaluated against a changing viewport
 * size, since "Surface pixel extent" is itself only a viewport-size stand-in here (plan's
 * disclosed simplification, same category as ISS-010). `null` until the first calibration. */
export const plausibilityWarning = writable<PlausibilityResult | null>(null);

interface PointerModifiers {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

function otherShapes(): Shape[] {
  const surface = get(activeSurface);
  if (!surface) return [];
  return surface.layers.flatMap((l) => l.measurements.map((m) => m.shape));
}

function resolveSnap(cursor: Point, modifiers: PointerModifiers, lastSegmentStart?: Point): SnapResult {
  return snap(cursor, {
    otherShapes: otherShapes(),
    toleranceSurfaceUnits: SNAP_TOLERANCE_SURFACE_UNITS,
    ...(lastSegmentStart ? { lastSegmentStart } : {}),
    snapEnabled: get(snapEnabled) && !modifiers.altKey,
    angleConstraintHeld: modifiers.shiftKey,
  });
}

/** ScaleChip click — discards any in-progress drawing draft (calibration and drawing never
 * interleave; Tool Dock is disabled for the same reason, ToolDock.svelte) and arms line capture. */
export function startCalibration(): void {
  setTool('select');
  calibrationDraft.set(null);
  calibrationCursor.set(null);
  calibrationSnapTarget.set(undefined);
  calibrating.set(true);
}

export function cancelCalibration(): void {
  calibrating.set(false);
  calibrationDraft.set(null);
  calibrationCursor.set(null);
  calibrationSnapTarget.set(undefined);
}

/** W3 "Redraw" — clears just the placed line, calibration mode stays active. */
export function redrawLine(): void {
  calibrationDraft.set(null);
  calibrationSnapTarget.set(undefined);
}

export function pointerDown(point: Point, modifiers: PointerModifiers): void {
  if (!get(calibrating)) return;
  const draft = get(calibrationDraft);

  if (!draft) {
    const snapped = resolveSnap(point, modifiers);
    calibrationDraft.set({ from: snapped.position });
    return;
  }
  if (draft.to) return; // both points already placed — waiting on the numeric input, ignore clicks

  const snapped = resolveSnap(point, modifiers, draft.from);
  calibrationDraft.set({ from: draft.from, to: snapped.position });
}

export function pointerMove(point: Point, modifiers: PointerModifiers): void {
  if (!get(calibrating)) return;
  const draft = get(calibrationDraft);
  const lastSegmentStart = draft?.from;
  const snapped = resolveSnap(point, modifiers, lastSegmentStart);
  calibrationCursor.set(snapped.position);
  calibrationSnapTarget.set(snapped.target);
}

/** 19 §3 / 15 §5 F2 step 3 — `fromReferenceLine` → `recalibrateCommand` → the same CommandStack
 * path everything else uses (so recalibration is undoable for free, ADR-001). No-op if the line
 * isn't fully placed yet (defensive; the input UI only ever calls this once `to` exists). */
export function commitCalibration(
  realLength: number,
  unit: CalibrationUnit,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const draft = get(calibrationDraft);
  if (!draft?.to || !(realLength > 0)) return;

  const pixelDistance = distance(draft.from, draft.to);
  const newCalibration = fromReferenceLine(pixelDistance, realLength, unit);

  executeCommand((surface) => recalibrateCommand({ surface, newCalibration }));
  plausibilityWarning.set(assessPlausibility(newCalibration, viewportWidth, viewportHeight));
  cancelCalibration();
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  Object.assign(window as object, {
    __areaflowCalibrationDev: {
      calibrating,
      calibrationDraft,
      calibrationCursor,
      calibrationSnapTarget,
      plausibilityWarning,
      startCalibration,
      cancelCalibration,
      redrawLine,
      pointerDown,
      pointerMove,
      commitCalibration,
      get,
    },
  });
}
