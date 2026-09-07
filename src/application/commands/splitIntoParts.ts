import type { Command } from '../commandStack.js';
import type { Measurement, MeasurementId, Surface } from '../../core/domain/entities.js';
import type { PolygonShape } from '../../core/domain/types.js';
import { addMeasurement, findMeasurement } from '../surfaceOps.js';

// PO request ("Redesign and fix Split functionality") — N-child generalization of split.ts's
// splitCommand: same "Split е допълнение, не замяна" contract (PD-009, split.ts's own docs) —
// the parent Measurement is never removed/replaced, this command only *adds* N new child
// Measurements referencing it via `parentId`. Geometry is decided by the caller (splitSession.ts,
// via core/drawing/splitParts.ts's splitIntoParts) — this command only persists already-computed
// shapes, mirroring split.ts's own division of labor (Core decides geometry, Application persists).

export interface SplitIntoPartsParams {
  readonly surface: Surface;
  readonly parentMeasurementId: MeasurementId;
  readonly childShapes: readonly PolygonShape[];
  /** supplied by the caller (determinism, same reasoning as CreateMeasurement's measurementId) */
  readonly childIds: readonly MeasurementId[];
}

export function splitIntoPartsCommand(params: SplitIntoPartsParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.parentMeasurementId);
  if (!found) throw new Error(`splitIntoPartsCommand: measurement '${params.parentMeasurementId}' not found`);
  if (found.measurement.shape.type !== 'polygon') {
    throw new Error('splitIntoPartsCommand: only polygon measurements can be split');
  }
  if (params.childShapes.length !== params.childIds.length || params.childShapes.length < 2) {
    throw new Error('splitIntoPartsCommand: childShapes and childIds must be the same length, at least 2');
  }

  return {
    target: before.id,
    label: 'SplitIntoParts',
    do: () => {
      const parent = found.measurement;
      // PO request (manual area) — every child inherits the parent's manual-area scale factor
      // verbatim when the parent has one set. Because that factor is area-per-px² and the
      // children are an exact geometric partition of the parent (INV-4, core/drawing/split.ts),
      // this alone produces "child.displayedArea proportional to its own geometry, summing back
      // to the parent's known area" with no separate distribution math (entities.ts's own
      // Measurement.manualArea doc explains the mechanism).
      let next = before;
      params.childShapes.forEach((shape, i) => {
        const child: Measurement = {
          id: params.childIds[i]!,
          shape,
          identity: { name: `${parent.identity.name} — Part ${i + 1}`, color: parent.identity.color },
          provenance: 'Manual',
          parentId: params.parentMeasurementId,
          locked: false,
          ...(parent.manualArea && { manualArea: parent.manualArea }),
        };
        next = addMeasurement(next, found.layerId, child);
      });
      return next;
    },
    undo: () => before,
    event: {
      type: 'MeasurementSplitIntoParts',
      surfaceId: before.id,
      parentId: params.parentMeasurementId,
      childIds: params.childIds,
    },
  };
}
