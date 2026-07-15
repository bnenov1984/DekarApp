import type { Command } from '../commandStack.js';
import type { MeasurementId, MeasurementIdentity, Surface } from '../../core/domain/entities.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

// docs/16_DESIGN_SYSTEM.md §3.2 PropertyPanel Identity section + entities.ts's own comment on
// MeasurementIdentity: "Identity VO... replaced wholesale on inline rename/recolor" — this is
// that replacement, covering rename/recolor/notes uniformly since all three live on the one VO.

export interface UpdateIdentityParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  readonly identity: MeasurementIdentity;
}

export function updateIdentityCommand(params: UpdateIdentityParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`updateIdentityCommand: measurement '${params.measurementId}' not found`);

  return {
    target: before.id,
    label: 'UpdateIdentity',
    do: () => replaceMeasurement(before, params.measurementId, { ...found.measurement, identity: params.identity }),
    undo: () => before,
    event: { type: 'MeasurementIdentityUpdated', surfaceId: before.id, measurementId: params.measurementId },
  };
}
