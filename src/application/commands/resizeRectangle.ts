import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { resizeRectangleCorner, type RectangleCorner } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface ResizeRectangleParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly corner: RectangleCorner;
  readonly newPosition: Point;
}

export function resizeRectangleCommand(params: ResizeRectangleParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`resizeRectangleCommand: measurement '${params.measurementId}' not found`);
  const shape = found.measurement.shape;
  if (shape.type !== 'rectangle') {
    throw new Error(`resizeRectangleCommand: measurement '${params.measurementId}' is not a rectangle`);
  }

  return {
    target: before.id,
    label: 'ResizeRectangle',
    do: () => {
      // throws on a degenerate result (width/height <= 0) — command not pushed, same convention
      // as editVertexCommand/addVertexCommand.
      const newShape = resizeRectangleCorner(shape, params.corner, params.newPosition);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
