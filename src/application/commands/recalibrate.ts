import type { Command } from '../commandStack.js';
import type { Surface } from '../../core/domain/entities.js';
import type { Calibration } from '../../core/domain/types.js';

export interface RecalibrateParams {
  readonly surface: Surface;
  readonly newCalibration: Calibration;
}

/**
 * 19 §3 / INV-3 (14 §4) — replacing Calibration never touches any Measurement's Shape. Every
 * Measurement's *values* on this Surface are recomputed live by Measurement Engine from
 * (Shape, Calibration) on every read (17 §2, a pure function) — they are never stored, so there
 * is nothing here to cascade-update. The atomicity INV-3 requires ("all Measurements reflect
 * the new scale") falls out of that purity for free: the instant this command's result is the
 * current Surface, *every* read of *every* Measurement on it already uses the new Calibration.
 * This command's only job is to replace the one Calibration value.
 */
export function recalibrateCommand(params: RecalibrateParams): Command<Surface> {
  const before = params.surface;
  return {
    target: before.id,
    label: 'Recalibrate',
    do: () => ({ ...before, calibration: params.newCalibration }),
    undo: () => before,
    event: { type: 'SurfaceCalibrated', surfaceId: before.id },
  };
}
