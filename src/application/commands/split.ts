import type { Command } from '../commandStack.js';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { split as coreSplit } from '../../core/drawing/split.js';
import { addMeasurement, findMeasurement } from '../surfaceOps.js';
import { closeTJunctions, splitJunctions } from '../sharedVertices.js';

export interface SplitParams {
  readonly surface: Surface;
  readonly parentMeasurementId: MeasurementId;
  readonly splitLine: readonly Point[];
  /** supplied by the caller (determinism, same reasoning as CreateMeasurement's measurementId) */
  readonly childIds: readonly [MeasurementId, MeasurementId];
}

/**
 * PD-009 — "Split е допълнение, не замяна": the parent Measurement is never removed or
 * replaced. It stays exactly as it was (full undivided polygon, own Shape, own computed area
 * that happens to equal the children's sum — INV-4). This command *adds* two new child
 * Measurements referencing the parent via `parentId`. Consequences:
 *  - undo() is the plain "restore `before`" shared by every command here, so it also reverts the
 *    one other change below in the same step.
 *  - PD-024 §6 — the only other measurements it touches are neighbours whose edge the new
 *    boundary ends on (a T-junction): they gain that end point as a collinear vertex, so they share
 *    it with the new parts (sharedVertices.ts's closeTJunctions). Their geometry and area are
 *    unchanged; the parent and its ancestors are never touched.
 */
export function splitCommand(params: SplitParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.parentMeasurementId);
  if (!found) throw new Error(`splitCommand: measurement '${params.parentMeasurementId}' not found`);
  // entities.ts's own contract for `locked` — split is refused, same "protection from accidental
  // editing" as move/resize/vertex-edit/delete. Enforced here (not just splitSession.ts's own
  // pre-check in startSplit) so a direct caller can't bypass it.
  if (found.measurement.locked) throw new Error(`splitCommand: measurement '${params.parentMeasurementId}' is locked`);

  const parentShape = found.measurement.shape;
  if (parentShape.type !== 'polygon') {
    throw new Error('splitCommand: only polygon measurements can be split');
  }

  return {
    target: before.id,
    label: 'Split',
    do: () => {
      const result = coreSplit(parentShape, params.splitLine);
      if (!result.ok) throw new Error(`splitCommand: ${result.reason}`);
      const [shapeA, shapeB] = result.value;

      // QA fix (manual area) — same inheritance splitIntoParts.ts's Equal/Random path already
      // does: both children get the parent's manual-area scale factor verbatim when set. Without
      // this, the "Manual split" line-draw fallback silently dropped a manual area on split,
      // reverting both children to plain geometric/calibrated area.
      const parent = found.measurement;
      const childA: Measurement = {
        id: params.childIds[0],
        shape: shapeA,
        identity: { name: `${parent.identity.name} — Part 1`, color: parent.identity.color },
        provenance: 'Manual',
        parentId: params.parentMeasurementId,
        locked: false,
        ...(parent.manualArea && { manualArea: parent.manualArea }),
      };
      const childB: Measurement = {
        id: params.childIds[1],
        shape: shapeB,
        identity: { name: `${parent.identity.name} — Part 2`, color: parent.identity.color },
        provenance: 'Manual',
        parentId: params.parentMeasurementId,
        locked: false,
        ...(parent.manualArea && { manualArea: parent.manualArea }),
      };

      const withA = addMeasurement(before, found.layerId, childA);
      const withBoth = addMeasurement(withA, found.layerId, childB);
      return closeTJunctions(withBoth, splitJunctions(parentShape, [shapeA, shapeB]), params.parentMeasurementId);
    },
    undo: () => before,
    event: {
      type: 'MeasurementSplit',
      surfaceId: before.id,
      parentId: params.parentMeasurementId,
      childIds: params.childIds,
    },
  };
}
