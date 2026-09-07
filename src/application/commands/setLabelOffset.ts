import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

// PO request (draggable polygon labels) — mirrors setVertexLabel.ts's exact shape. The
// containment constraint (candidate must land inside the polygon) is enforced by the caller
// (labelDragSession.ts, via hitTest.ts's pointInPolygon) before this command is ever built — this
// command just persists whatever delta it's given, same "geometry validation happens upstream,
// commands trust their params" split every other command here already follows.

export interface SetLabelOffsetParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly dx: number;
  readonly dy: number;
}

export function setLabelOffsetCommand(params: SetLabelOffsetParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setLabelOffsetCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'SetLabelOffset',
    do: () =>
      replaceMeasurement(before, params.measurementId, {
        ...found.measurement,
        labelOffset: { dx: params.dx, dy: params.dy },
      }),
    undo: () => before,
    event: { type: 'MeasurementLabelMoved', surfaceId: before.id, measurementId: params.measurementId },
  };
}
