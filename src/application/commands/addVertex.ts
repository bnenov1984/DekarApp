import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { addVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface AddVertexParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly edgeIndex: number;
  readonly position: Point;
}

export function addVertexCommand(params: AddVertexParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`addVertexCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'AddVertex',
    do: () => {
      const newShape = addVertex(found.measurement.shape, params.edgeIndex, params.position);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: newShape });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
