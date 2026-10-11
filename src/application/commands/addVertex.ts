import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { addVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { insertLabelAt, withVertexLabels } from '../vertexLabels.js';
import { rebalanceSplitGroups } from '../splitGroup.js';
import { findSharedEdges, assertNoParticipantTurnedInsideOut, type EdgeRef } from '../sharedVertices.js';

export interface AddVertexParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly edgeIndex: number;
  readonly position: Point;
  /** PD-024 — insert the vertex into every other shape sharing this edge too (default), so the
   * boundary stays shared. `false` is the Ctrl/⌘ "this shape only" escape hatch. */
  readonly linked?: boolean;
}

export function addVertexCommand(params: AddVertexParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`addVertexCommand: measurement '${params.measurementId}' not found`);
  // entities.ts's own contract for `locked` — vertex-edit is refused, same "protection from
  // accidental editing" as move/resize/delete/split. Enforced here (not just
  // vertexEditSession.ts's own pre-check in enterVertexEditing) so a direct caller can't bypass it.
  if (found.measurement.locked) throw new Error(`addVertexCommand: measurement '${params.measurementId}' is locked`);

  // PD-024 / INV-19 — see editVertex.ts; a shared edge is split in every shape that has it (polygon
  // and freehand only, sharedVertices.ts), and a locked participant refuses the whole insert.
  const shared: readonly EdgeRef[] = params.linked === false ? [] : findSharedEdges(before, params.measurementId, params.edgeIndex);
  for (const ref of shared) {
    if (findMeasurement(before, ref.measurementId)?.measurement.locked) {
      throw new Error(`addVertexCommand: linked measurement '${ref.measurementId}' is locked`);
    }
  }
  const participants: readonly EdgeRef[] = [{ measurementId: params.measurementId, edgeIndex: params.edgeIndex }, ...shared];

  return {
    target: before.id,
    label: 'AddVertex',
    do: () => {
      // Any participant's throw (self-intersection) propagates out of do() — nothing is applied.
      const edited = participants.reduce((surface, ref) => {
        const measurement = findMeasurement(surface, ref.measurementId)!.measurement;
        const newShape = addVertex(measurement.shape, ref.edgeIndex, params.position);
        // Core's addVertex inserts at edgeIndex + 1 (drawingEngine.ts) — any existing vertex
        // labels (PO request, entities.ts) at/after that index shift up by one to stay attached
        // to the same vertex they were labeling; the new vertex itself starts unlabeled.
        const vertexLabels = insertLabelAt(measurement.vertexLabels, ref.edgeIndex + 1);
        return replaceMeasurement(surface, ref.measurementId, withVertexLabels({ ...measurement, shape: newShape }, vertexLabels));
      }, before);
      // PD-025 — no closed participant may end up wound the other way round (lying on its neighbour).
      assertNoParticipantTurnedInsideOut(before, edited, participants.map((ref) => ref.measurementId), 'addVertexCommand');
      // PD-021 — see editVertex.ts; inserting a vertex changes the part's area, so its Split group
      // (if any) redistributes to keep summing to the parent's total.
      return participants.reduce((surface, ref) => rebalanceSplitGroups(surface, ref.measurementId), edited);
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
