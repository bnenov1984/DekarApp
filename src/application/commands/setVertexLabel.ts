import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface, VertexLabel } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { setLabelAt, withVertexLabels } from '../vertexLabels.js';

export interface SetVertexLabelParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  /** `null` clears the label at this index. */
  readonly label: VertexLabel | null;
}

/** PO request (per-vertex annotation) — sets/clears one vertex's label. Never throws: any
 * non-negative `vertexIndex` is accepted (padded with `null`s if past the current end,
 * vertexLabels.ts), same as how a Measurement can be selected/edited before every vertex has
 * been individually labeled. */
export function setVertexLabelCommand(params: SetVertexLabelParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setVertexLabelCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'SetVertexLabel',
    do: () => {
      const vertexLabels = setLabelAt(found.measurement.vertexLabels, params.vertexIndex, params.label);
      return replaceMeasurement(before, params.measurementId, withVertexLabels(found.measurement, vertexLabels));
    },
    undo: () => before,
    event: {
      type: 'MeasurementVertexLabelSet',
      surfaceId: before.id,
      measurementId: params.measurementId,
      vertexIndex: params.vertexIndex,
    },
  };
}
