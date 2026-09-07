import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { resizeCircleToRadius } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface ResizeCircleToRadiusParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly radius: number;
}

/** PropertyPanel numeric radius input's commit path — the typed-dimension counterpart to
 * `resizeCircleCommand` (drag-driven). Caller is responsible for converting the typed display-unit
 * value to Surface-space px before calling (computeDisplay.ts/unitConversion.ts). */
export function resizeCircleToRadiusCommand(params: ResizeCircleToRadiusParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`resizeCircleToRadiusCommand: measurement '${params.measurementId}' not found`);
  const shape = found.measurement.shape;
  if (shape.type !== 'circle') {
    throw new Error(`resizeCircleToRadiusCommand: measurement '${params.measurementId}' is not a circle`);
  }
  // entities.ts's own contract for `locked` — resize is refused, same "protection from accidental
  // editing" as move/vertex-edit/delete/split. Enforced here so a direct caller can't bypass the
  // UI layer's own pre-check.
  if (found.measurement.locked) {
    throw new Error(`resizeCircleToRadiusCommand: measurement '${params.measurementId}' is locked`);
  }

  return {
    target: before.id,
    label: 'ResizeCircleToRadius',
    do: () => {
      // throws on a non-positive radius — command not pushed, same convention as resizeCircleCommand.
      const newShape = resizeCircleToRadius(shape, params.radius);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
