import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { removeVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

export interface RemoveVertexParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
}

/**
 * Core's removeVertex returns a Result (23 §2.1: "would this deletion leave <3 vertices or
 * self-intersect" is a normal, user-reachable outcome, not a programmer error). At the Command
 * boundary this is translated into a thrown error, which keeps CommandStack's contract uniform
 * — "either do() succeeds and the command is pushed, or it throws and state is untouched" — for
 * every command type, without CommandStack needing to know about Result at all. The caller
 * (eventual UI layer) is expected to catch this and render the non-blocking hint from 15 §16,
 * not treat it as a hard failure.
 */
export function removeVertexCommand(params: RemoveVertexParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`removeVertexCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'RemoveVertex',
    do: () => {
      const result = removeVertex(found.measurement.shape, params.vertexIndex);
      if (!result.ok) throw new Error(`removeVertexCommand: ${result.reason}`);
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, shape: result.value });
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
