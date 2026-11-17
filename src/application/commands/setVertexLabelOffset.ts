import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface, VertexLabel } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { setLabelAt, withVertexLabels } from '../vertexLabels.js';

// PO request (vertex label drag, grilling session 2026-11-18) — mirrors setLabelOffset.ts's exact
// shape/reasoning (a dedicated, single-purpose command rather than folding this into
// setVertexLabelCommand) for the same reason: a caller patching only the offset must never risk
// clobbering that vertex's text/color/fontSize by reconstructing the whole VertexLabel itself.
// The radius-clamp constraint is enforced upstream (vertexLabelDragSession.ts) before this command
// is ever built — this command just persists whatever delta it's given.

export interface SetVertexLabelOffsetParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly dx: number;
  readonly dy: number;
}

export function setVertexLabelOffsetCommand(params: SetVertexLabelOffsetParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setVertexLabelOffsetCommand: measurement '${params.measurementId}' not found`);
  const current = found.measurement.vertexLabels?.[params.vertexIndex] ?? null;

  return {
    target: before.id,
    label: 'SetVertexLabelOffset',
    // A `null` current label is defensive, not expected in practice: the UI only ever starts a
    // drag on a label that's already rendered, which means it already has text. Treated as a
    // true no-op rather than thrown, same robustness convention setVertexLabelCommand documents.
    do: () => {
      if (!current) return before;
      const updated: VertexLabel = { ...current, offset: { dx: params.dx, dy: params.dy } };
      const vertexLabels = setLabelAt(found.measurement.vertexLabels, params.vertexIndex, updated);
      return replaceMeasurement(before, params.measurementId, withVertexLabels(found.measurement, vertexLabels));
    },
    undo: () => before,
    event: {
      type: 'MeasurementVertexLabelOffsetSet',
      surfaceId: before.id,
      measurementId: params.measurementId,
      vertexIndex: params.vertexIndex,
    },
  };
}
