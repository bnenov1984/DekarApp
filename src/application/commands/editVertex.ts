import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { editVertex } from '../../core/drawing/drawingEngine.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { rebalanceSplitGroups } from '../splitGroup.js';
import { findLinkedVertices, type VertexRef } from '../sharedVertices.js';

export interface EditVertexParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly newPosition: Point;
  /** PD-024 — move every exactly coincident vertex of other shapes too (default). `false` is the
   * Ctrl/⌘+drag "move only this shape's vertex" escape hatch. */
  readonly linked?: boolean;
}

export function editVertexCommand(params: EditVertexParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`editVertexCommand: measurement '${params.measurementId}' not found`);
  // entities.ts's own contract for `locked` — vertex-edit is refused, same "protection from
  // accidental editing" as move/resize/delete/split. Enforced here (not just
  // vertexEditSession.ts's own pre-check in enterVertexEditing) so a direct caller can't bypass it.
  if (found.measurement.locked) throw new Error(`editVertexCommand: measurement '${params.measurementId}' is locked`);

  // PD-024 / INV-19 — the vertex is shared with every exactly coincident vertex of a shape that is
  // neither an ancestor nor a descendant (sharedVertices.ts). A locked participant refuses the
  // whole edit, exactly like the source's own lock: a locked shape is never reshaped as a side
  // effect of editing its neighbour.
  const linked: readonly VertexRef[] = params.linked === false ? [] : findLinkedVertices(before, params.measurementId, params.vertexIndex);
  for (const ref of linked) {
    if (findMeasurement(before, ref.measurementId)?.measurement.locked) {
      throw new Error(`editVertexCommand: linked measurement '${ref.measurementId}' is locked`);
    }
  }
  const participants: readonly VertexRef[] = [{ measurementId: params.measurementId, vertexIndex: params.vertexIndex }, ...linked];

  return {
    target: before.id,
    label: 'EditVertex',
    do: () => {
      // throws on invalid geometry (self-intersection, out-of-range index — 18 §6/23 §2.1) for any
      // participant; propagates out of do(), so CommandStack never pushes this command and no
      // participant is left half-edited.
      const edited = participants.reduce((surface, ref) => {
        const measurement = findMeasurement(surface, ref.measurementId)!.measurement;
        const shape = editVertex(measurement.shape, ref.vertexIndex, params.newPosition);
        return replaceMeasurement(surface, ref.measurementId, { ...measurement, shape });
      }, before);
      // PD-021 — a reshaped part redistributes area within its Split group (splitGroup.ts); a no-op
      // for anything outside such a group. Each participant may sit in a different group. Undo is
      // unaffected: `before` is restored wholesale, so every participant reverts in one step.
      return participants.reduce((surface, ref) => rebalanceSplitGroups(surface, ref.measurementId), edited);
    },
    undo: () => before,
    event: { type: 'MeasurementShapeEdited', surfaceId: before.id, measurementId: params.measurementId },
  };
}
