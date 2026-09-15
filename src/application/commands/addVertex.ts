import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { addVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { insertLabelAt, withVertexLabels } from '../vertexLabels.js';
import { rebalanceSplitGroups } from '../splitGroup.js';

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
  // entities.ts's own contract for `locked` — vertex-edit is refused, same "protection from
  // accidental editing" as move/resize/delete/split. Enforced here (not just
  // vertexEditSession.ts's own pre-check in enterVertexEditing) so a direct caller can't bypass it.
  if (found.measurement.locked) throw new Error(`addVertexCommand: measurement '${params.measurementId}' is locked`);

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
      // PD-021 — see editVertex.ts; inserting a vertex changes the part's area, so its Split group
      // (if any) redistributes to keep summing to the parent's total.
      return rebalanceSplitGroups(replaceMeasurement(before, params.measurementId, updated), params.measurementId);
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
