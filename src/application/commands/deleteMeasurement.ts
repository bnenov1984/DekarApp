import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { childrenOf, dissolveSplitGroup, findMeasurement, removeMeasurements } from '../surfaceOps.js';

export interface DeleteMeasurementsParams {
  readonly surface: Surface;
  readonly measurementIds: readonly MeasurementId[];
}

/**
 * 11 §4 lifecycle rules for Measurement deletion, generalized to a batch (item A13 "multi-select
 * bulk operations") — a single-element `measurementIds` is exactly the original single-delete
 * behavior; this is the same command either way, so a multi-select Delete is one atomic undo step
 * covering the whole batch, not N separate ones:
 *  - a split PARENT (has children referencing it) is deleted together with all its children,
 *    as one undoable action — an orphaned child pointing at a deleted parentId would break
 *    referential integrity, so this cannot be split into separate commands.
 *  - a split CHILD dissolves the group for its siblings (they lose parentId, becoming ordinary
 *    measurements) but the parent measurement itself is left untouched.
 *  - a plain (non-split) measurement is simply removed.
 *
 * Ids are processed in order against the *evolving* result of prior ids in the same batch (not
 * all against the original `surface`) — e.g. selecting both a split parent and one of its own
 * children and deleting them together must not double-remove or throw on the child, since the
 * parent's own cascade already took it. `removedSoFar` tracks exactly that.
 */
export function deleteMeasurementsCommand(params: DeleteMeasurementsParams): Command<Surface> {
  const before = params.surface;
  // dedupe defensively — a caller passing the same id twice (a stale/duplicated selection) should
  // never be treated as "already removed, not found" on its second occurrence.
  const ids = [...new Set(params.measurementIds)];
  for (const id of ids) {
    const found = findMeasurement(before, id);
    if (!found) throw new Error(`deleteMeasurementsCommand: measurement '${id}' not found`);
    // entities.ts's own contract for `locked` — delete is refused, same "protection from
    // accidental editing" as move/resize/vertex-edit/split. Enforced here (not just by the UI
    // layer's own pre-filter, studioSession.ts's deleteSelectedMeasurement) so any caller that
    // dispatches this command directly can't silently bypass it.
    if (found.measurement.locked) throw new Error(`deleteMeasurementsCommand: measurement '${id}' is locked`);
  }

  return {
    target: before.id,
    label: 'DeleteMeasurements',
    do: () => {
      let surface = before;
      const removedSoFar = new Set<MeasurementId>();
      for (const id of ids) {
        if (removedSoFar.has(id)) continue; // already gone via an earlier id's own cascade in this batch
        const found = findMeasurement(surface, id);
        if (!found) continue; // same reason
        const { measurement } = found;
        const children = childrenOf(surface, measurement.id);
        if (children.length > 0) {
          surface = removeMeasurements(surface, [measurement.id, ...children.map((c) => c.id)]);
          removedSoFar.add(measurement.id);
          for (const c of children) removedSoFar.add(c.id);
        } else if (measurement.parentId !== undefined) {
          surface = removeMeasurements(dissolveSplitGroup(surface, measurement.parentId), [measurement.id]);
          removedSoFar.add(measurement.id);
        } else {
          surface = removeMeasurements(surface, [measurement.id]);
          removedSoFar.add(measurement.id);
        }
      }
      return surface;
    },
    undo: () => before,
  };
}
