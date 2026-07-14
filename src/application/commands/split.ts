import type { Command } from '../commandStack.js';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import type { Point } from '../../core/domain/types.js';
import { split as coreSplit } from '../../core/drawing/split.js';
import { addMeasurement, findMeasurement } from '../surfaceOps.js';

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
 * that happens to equal the children's sum — INV-4). This command only *adds* two new child
 * Measurements referencing the parent via `parentId`. Consequences:
 *  - undo() is the plain "restore `before`" shared by every command here — removing the two
 *    children is enough, nothing about the parent or any sibling measurement was ever touched.
 *  - manually-drawn measurements elsewhere on the Surface are completely unaffected — this
 *    command only ever reads the one parent it was given and appends to one layer.
 */
export function splitCommand(params: SplitParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.parentMeasurementId);
  if (!found) throw new Error(`splitCommand: measurement '${params.parentMeasurementId}' not found`);

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

      const childA: Measurement = {
        id: params.childIds[0],
        shape: shapeA,
        identity: { name: `${found.measurement.identity.name} — Part 1`, color: found.measurement.identity.color },
        provenance: 'Manual',
        parentId: params.parentMeasurementId,
        locked: false,
      };
      const childB: Measurement = {
        id: params.childIds[1],
        shape: shapeB,
        identity: { name: `${found.measurement.identity.name} — Part 2`, color: found.measurement.identity.color },
        provenance: 'Manual',
        parentId: params.parentMeasurementId,
        locked: false,
      };

      const withA = addMeasurement(before, found.layerId, childA);
      return addMeasurement(withA, found.layerId, childB);
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
