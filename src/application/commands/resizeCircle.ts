import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { resizeCircleRadius } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface ResizeCircleParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly newEdgePosition: Point;
}

export function resizeCircleCommand(params: ResizeCircleParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`resizeCircleCommand: measurement '${params.measurementId}' not found`);
  const shape = found.measurement.shape;
  if (shape.type !== 'circle') {
    throw new Error(`resizeCircleCommand: measurement '${params.measurementId}' is not a circle`);
  }
  // entities.ts's own contract for `locked` — resize is refused, same "protection from accidental
  // editing" as move/vertex-edit/delete/split. Enforced here so a direct caller can't bypass the
  // UI layer's own pre-check.
  if (found.measurement.locked) {
    throw new Error(`resizeCircleCommand: measurement '${params.measurementId}' is locked`);
  }

  return {
    target: before.id,
    label: 'ResizeCircle',
    do: () => {
      // throws on a degenerate (zero) radius — command not pushed.
      const newShape = resizeCircleRadius(shape, params.newEdgePosition);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
