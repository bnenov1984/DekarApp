import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { childrenOf, dissolveSplitGroup, findMeasurement, removeMeasurements } from '../surfaceOps.js';

export interface DeleteMeasurementParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
}

/**
 * 11 §4 lifecycle rules for Measurement deletion:
 *  - a split PARENT (has children referencing it) is deleted together with all its children,
 *    as one undoable action — an orphaned child pointing at a deleted parentId would break
 *    referential integrity, so this cannot be split into separate commands.
 *  - a split CHILD dissolves the group for its siblings (they lose parentId, becoming ordinary
 *    measurements) but the parent measurement itself is left untouched.
 *  - a plain (non-split) measurement is simply removed.
 */
export function deleteMeasurementCommand(params: DeleteMeasurementParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`deleteMeasurementCommand: measurement '${params.measurementId}' not found`);
  const { measurement } = found;

  return {
    target: before.id,
    label: 'DeleteMeasurement',
    do: () => {
      const children = childrenOf(before, measurement.id);
      if (children.length > 0) {
        return removeMeasurements(before, [measurement.id, ...children.map((c) => c.id)]);
      }
      if (measurement.parentId !== undefined) {
        const dissolved = dissolveSplitGroup(before, measurement.parentId);
        return removeMeasurements(dissolved, [measurement.id]);
      }
      return removeMeasurements(before, [measurement.id]);
    },
    undo: () => before,
    event: { type: 'MeasurementDeleted', surfaceId: before.id, measurementId: measurement.id },
  };
}
