import type { Command } from '../commandStack.js';
import type { LayerId, MeasurementId, MeasurementIdentity, Surface } from '../../core/domain/entities.js';
import type { Shape } from '../../core/domain/types.js';
import { createMeasurementCommand } from './createMeasurement.js';
import { shapeToParams } from './shapeToParams.js';

export interface CommitGhostParams {
  readonly surface: Surface;
  readonly layerId: LayerId;
  readonly measurementId: MeasurementId;
  readonly ghostShape: Shape;
  readonly identity: MeasurementIdentity;
}

/**
 * 20_AI_STRATEGY.md §4 — "commit is a translation, not a separate persistence path": this is
 * *literally* a CreateMeasurementCommand with `provenance: 'AIGenerated'`, built via the exact
 * same factory manual drawing uses. There is no `AI -> Database` or `AI -> Storage` shortcut —
 * PD-018 §3 fixed this as an architectural invariant, and this function is that invariant's
 * entire implementation: delete it, and there is no other way for an accepted AI suggestion to
 * become a Measurement.
 */
export function commitGhostCommand(params: CommitGhostParams): Command<Surface> {
  return createMeasurementCommand({
    surface: params.surface,
    layerId: params.layerId,
    measurementId: params.measurementId,
    shapeParams: shapeToParams(params.ghostShape),
    identity: params.identity,
    provenance: 'AIGenerated',
  });
}
