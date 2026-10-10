import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { removeVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { removeLabelAt, withVertexLabels } from '../vertexLabels.js';
import { rebalanceSplitGroups } from '../splitGroup.js';
import { findLinkedVertices, type VertexRef } from '../sharedVertices.js';

export interface RemoveVertexParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  /** PD-024 — remove every exactly coincident vertex of other shapes too (default). `false` is the
   * Ctrl/⌘+Alt+click "this shape only" escape hatch. */
  readonly linked?: boolean;
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
  // entities.ts's own contract for `locked` — vertex-edit is refused, same "protection from
  // accidental editing" as move/resize/delete/split. Enforced here (not just
  // vertexEditSession.ts's own pre-check in enterVertexEditing) so a direct caller can't bypass it.
  if (found.measurement.locked) {
    throw new Error(`removeVertexCommand: measurement '${params.measurementId}' is locked`);
  }

  // PD-024 / INV-19 — see editVertex.ts; a shared vertex is deleted from every shape that has it,
  // all-or-nothing: a locked participant, or one the deletion would leave invalid, refuses it whole.
  const linked: readonly VertexRef[] = params.linked === false ? [] : findLinkedVertices(before, params.measurementId, params.vertexIndex);
  for (const ref of linked) {
    if (findMeasurement(before, ref.measurementId)?.measurement.locked) {
      throw new Error(`removeVertexCommand: linked measurement '${ref.measurementId}' is locked`);
    }
  }
  const participants: readonly VertexRef[] = [{ measurementId: params.measurementId, vertexIndex: params.vertexIndex }, ...linked];

  return {
    target: before.id,
    label: 'RemoveVertex',
    do: () => {
      const edited = participants.reduce((surface, ref) => {
        const measurement = findMeasurement(surface, ref.measurementId)!.measurement;
        const result = removeVertex(measurement.shape, ref.vertexIndex);
        if (!result.ok) throw new Error(`removeVertexCommand: ${result.reason}`);
        // PO request (per-vertex annotation, entities.ts): the removed vertex's label (if any) is
        // discarded along with it, and every label after it shifts down to stay attached to the
        // same vertex it was labeling.
        const vertexLabels = removeLabelAt(measurement.vertexLabels, ref.vertexIndex);
        return replaceMeasurement(surface, ref.measurementId, withVertexLabels({ ...measurement, shape: result.value }, vertexLabels));
      }, before);
      // PD-021 — see editVertex.ts; removing a vertex changes the part's area, so its Split group
      // (if any) redistributes to keep summing to the parent's total.
      return participants.reduce((surface, ref) => rebalanceSplitGroups(surface, ref.measurementId), edited);
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
