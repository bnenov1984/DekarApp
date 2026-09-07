import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { translateShape } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface TranslateMeasurementParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly dx: number;
  readonly dy: number;
}

/** Whole-shape move (18 §6, requested to cover every Shape type, not just the ones with
 * vertex-level editing) — `translateShape` is a rigid transform and never throws, unlike every
 * other geometry mutation command in this directory. */
export function translateMeasurementCommand(params: TranslateMeasurementParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`translateMeasurementCommand: measurement '${params.measurementId}' not found`);
  // entities.ts's own contract for `locked` — whole-shape move is refused, same "protection from
  // accidental editing" as resize/vertex-edit/delete/split. Enforced here so a direct caller can't
  // bypass the UI layer's own pre-check.
  if (found.measurement.locked) {
    throw new Error(`translateMeasurementCommand: measurement '${params.measurementId}' is locked`);
  }

  return {
    target: before.id,
    label: 'TranslateMeasurement',
    do: () => {
      const newShape = translateShape(found.measurement.shape, params.dx, params.dy);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
