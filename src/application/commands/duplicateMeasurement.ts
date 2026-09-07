import type { Command } from '../commandStack.js';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import { create, translateShape } from '../../core/drawing/drawingEngine.js';
import { shapeToParams } from './shapeToParams.js';
import { addMeasurement, findMeasurement } from '../surfaceOps.js';

export interface DuplicateMeasurementsParams {
  readonly surface: Surface;
  readonly measurementIds: readonly MeasurementId[];
  /** one new id per `measurementIds[i]`, same order, same length — supplied by the caller, never
   * generated inside do(), same "deterministic redo" reasoning as createMeasurementCommand's own
   * measurementId param. */
  readonly newMeasurementIds: readonly MeasurementId[];
  readonly dx: number;
  readonly dy: number;
}

/** PO follow-up (UX review, item B6 "Ctrl+D duplicate", generalized for item A13 "multi-select
 * bulk operations") — clones one or more Measurements into their own Layer, each offset by
 * (dx, dy) so the copies are visibly distinct and immediately draggable away. A single-element
 * `measurementIds` is exactly the original Ctrl+D behavior; this is the same command either way —
 * a multi-select duplicate is one atomic undo step covering every copy, not N separate ones.
 * Re-validates each translated shape through `create()` (same gate every manually-drawn/AI-
 * committed shape already passes, createMeasurementCommand/commitGhostCommand) rather than
 * splicing the translated Shape in directly — a rigid translate can't itself invalidate a shape,
 * but this keeps duplicate on the exact same "never bypass validation" discipline as every other
 * shape-producing command, in case that ever changes.
 *
 * Deliberately drops `parentId`/`vertexLabels` from every source (identity/name/color still
 * copied, with a "copy" suffix so it doesn't silently read as the exact same measurement in the
 * Layers list): a duplicate of a Split child is not itself part of that split group — INV-4's
 * parent-area-equals-children-sum invariant only holds for the real, split-produced children —
 * and vertex labels are index-aligned to a shape whose vertex count/order could diverge from the
 * original the moment either copy is edited independently. */
export function duplicateMeasurementsCommand(params: DuplicateMeasurementsParams): Command<Surface> {
  const before = params.surface;
  if (params.measurementIds.length !== params.newMeasurementIds.length) {
    throw new Error('duplicateMeasurementsCommand: measurementIds and newMeasurementIds must be the same length');
  }
  const founds = params.measurementIds.map((id) => {
    const found = findMeasurement(before, id);
    if (!found) throw new Error(`duplicateMeasurementsCommand: measurement '${id}' not found`);
    return found;
  });

  return {
    target: before.id,
    label: 'DuplicateMeasurements',
    do: () => {
      let surface = before;
      founds.forEach((found, i) => {
        const offsetShape = translateShape(found.measurement.shape, params.dx, params.dy);
        const shape = create(shapeToParams(offsetShape));
        const measurement: Measurement = {
          id: params.newMeasurementIds[i]!,
          shape,
          identity: { ...found.measurement.identity, name: `${found.measurement.identity.name} copy` },
          provenance: 'Manual',
          locked: false,
        };
        surface = addMeasurement(surface, found.layerId, measurement);
      });
      return surface;
    },
    undo: () => before,
  };
}
