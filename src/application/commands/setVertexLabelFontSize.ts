import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface, VertexLabel } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';
import { setLabelAt, withVertexLabels } from '../vertexLabels.js';

// PO request (vertex label size, grilling session 2026-11-18) — a dedicated command, same
// reasoning as setVertexLabelOffset.ts: patches only `fontSize`, never risking a stale
// reconstruction of text/color/offset. `fontSize` itself is a 1-10 level (vertexLabelFontSize.ts
// maps it to px at render time) — this command doesn't interpret it, just stores it.

export interface SetVertexLabelFontSizeParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly vertexIndex: number;
  readonly fontSize: number;
}

export function setVertexLabelFontSizeCommand(params: SetVertexLabelFontSizeParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setVertexLabelFontSizeCommand: measurement '${params.measurementId}' not found`);
  const current = found.measurement.vertexLabels?.[params.vertexIndex] ?? null;

  return {
    target: before.id,
    label: 'SetVertexLabelFontSize',
    // Defensive, not expected: the size slider only ever shows for a label that already has text.
    do: () => {
      if (!current) return before;
      const updated: VertexLabel = { ...current, fontSize: params.fontSize };
      const vertexLabels = setLabelAt(found.measurement.vertexLabels, params.vertexIndex, updated);
      return replaceMeasurement(before, params.measurementId, withVertexLabels(found.measurement, vertexLabels));
    },
    undo: () => before,
    event: {
      type: 'MeasurementVertexLabelFontSizeSet',
      surfaceId: before.id,
      measurementId: params.measurementId,
      vertexIndex: params.vertexIndex,
    },
  };
}
