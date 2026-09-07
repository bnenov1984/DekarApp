import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { resizeRectangleDimensions } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface ResizeRectangleDimensionsParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly width: number;
  readonly height: number;
}

/** PropertyPanel numeric width/height inputs' commit path — the typed-dimension counterpart to
 * `resizeRectangleCommand` (drag-driven). Caller is responsible for converting the typed display-unit
 * value to Surface-space px before calling (computeDisplay.ts/unitConversion.ts). */
export function resizeRectangleDimensionsCommand(params: ResizeRectangleDimensionsParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`resizeRectangleDimensionsCommand: measurement '${params.measurementId}' not found`);
  const shape = found.measurement.shape;
  if (shape.type !== 'rectangle') {
    throw new Error(`resizeRectangleDimensionsCommand: measurement '${params.measurementId}' is not a rectangle`);
  }

  return {
    target: before.id,
    label: 'ResizeRectangleDimensions',
    do: () => {
      // throws on a non-positive width/height — command not pushed, same convention as
      // resizeRectangleCommand.
      const newShape = resizeRectangleDimensions(shape, params.width, params.height);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
