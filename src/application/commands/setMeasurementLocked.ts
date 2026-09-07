import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

// docs/11_INFORMATION_ARCHITECTURE.md §"Locked" state (защита от случайна редакция — protection
// from accidental editing) + docs/16_DESIGN_SYSTEM.md §MeasurementShape states (short-dash outline
// for a locked shape). Mirrors setImageLocked.ts's command shape, but targets one Measurement
// inside a Layer (findMeasurement/replaceMeasurement) rather than replacing the whole Surface.

export interface SetMeasurementLockedParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly locked: boolean;
}

export function setMeasurementLockedCommand(params: SetMeasurementLockedParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setMeasurementLockedCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'SetMeasurementLocked',
    do: () => replaceMeasurement(before, params.measurementId, { ...found.measurement, locked: params.locked }),
    undo: () => before,
    event: { type: 'MeasurementLockToggled', surfaceId: before.id, measurementId: params.measurementId },
  };
}
