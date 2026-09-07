import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { addVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { insertLabelAt, withVertexLabels } from '../vertexLabels.js';

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
      // Core's addVertex inserts at edgeIndex + 1 (drawingEngine.ts) — any existing vertex
      // labels (PO request, entities.ts) at/after that index shift up by one to stay attached
      // to the same vertex they were labeling; the new vertex itself starts unlabeled.
      const vertexLabels = insertLabelAt(found.measurement.vertexLabels, params.edgeIndex + 1);
      const updated = withVertexLabels({ ...found.measurement, shape: newShape }, vertexLabels);
      return replaceMeasurement(before, params.measurementId, updated);
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
