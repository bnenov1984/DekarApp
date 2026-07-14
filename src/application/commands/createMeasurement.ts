import type { Command } from '../commandStack.js';
import type { Measurement, MeasurementId, MeasurementIdentity, LayerId, Surface } from '../../core/domain/entities.js';
import type { Provenance } from '../../core/domain/types.js';
import { create, type ShapeParams } from '../../core/drawing/drawingEngine.js';
import { addMeasurement } from '../surfaceOps.js';

export interface CreateMeasurementParams {
  readonly surface: Surface;
  readonly layerId: LayerId;
  /** supplied by the caller, never generated inside do() — this is what makes redo()
   * deterministic (same id every time do() re-runs, not a fresh one per call). */
  readonly measurementId: MeasurementId;
  readonly shapeParams: ShapeParams;
  readonly identity: MeasurementIdentity;
  /** 20 §4/§9, PD-013: the *only* difference between a manually-drawn and an AI-committed
   * Measurement is this field. commitGhostCommand (commitGhost.ts) constructs exactly this same
   * command — there is no separate "AI create" path to audit. */
  readonly provenance: Provenance;
}

export function createMeasurementCommand(params: CreateMeasurementParams): Command<Surface> {
  const before = params.surface;
  return {
    target: before.id,
    label: 'CreateMeasurement',
    do: () => {
      const shape = create(params.shapeParams); // throws on invalid geometry (18 §2) — command not pushed
      const measurement: Measurement = {
        id: params.measurementId,
        shape,
        identity: params.identity,
        provenance: params.provenance,
        locked: false,
      };
      return addMeasurement(before, params.layerId, measurement);
    },
    undo: () => before,
    event: {
      type: 'MeasurementDrawn',
      surfaceId: before.id,
      measurementId: params.measurementId,
      provenance: params.provenance,
    },
  };
}
