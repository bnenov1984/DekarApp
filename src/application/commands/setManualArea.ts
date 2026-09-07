import type { Command } from '../commandStack.js';
import type { MeasurementId, Surface } from '../../core/domain/entities.js';
import { shoelaceArea } from '../../core/measurement/formulas.js';
import { findMeasurement, replaceMeasurement } from '../surfaceOps.js';

// PO request (manual area) — records/clears a Measurement's explicit real-world area (m²),
// independent of Surface.calibration. Mirrors setMeasurementLocked.ts's command shape
// (findMeasurement/replaceMeasurement targeting one Measurement inside a Layer).

export interface SetManualAreaParams {
  readonly surface: Surface;
  readonly measurementId: MeasurementId;
  /** `null` clears the manual area (reverts to geometry/calibration-derived). A positive number
   * of square meters otherwise. */
  readonly manualAreaM2: number | null;
}

export function setManualAreaCommand(params: SetManualAreaParams): Command<Surface> {
  const before = params.surface;
  const found = findMeasurement(before, params.measurementId);
  if (!found) throw new Error(`setManualAreaCommand: measurement '${params.measurementId}' not found`);
  if (found.measurement.shape.type !== 'polygon') {
    throw new Error('setManualAreaCommand: manual area only applies to polygon measurements');
  }
  if (params.manualAreaM2 !== null && !(params.manualAreaM2 > 0)) {
    throw new Error('setManualAreaCommand: manualAreaM2 must be a positive number');
  }

  return {
    target: before.id,
    label: 'SetManualArea',
    do: () => {
      if (params.manualAreaM2 === null) {
        const { manualArea: _manualArea, ...rest } = found.measurement;
        return replaceMeasurement(before, params.measurementId, rest);
      }
      const geometricAreaPx = shoelaceArea((found.measurement.shape as { vertices: readonly { x: number; y: number }[] }).vertices);
      if (!(geometricAreaPx > 0)) {
        throw new Error('setManualAreaCommand: shape has zero geometric area, cannot derive a scale factor');
      }
      const manualArea = { squareMetersPerSquarePixel: params.manualAreaM2 / geometricAreaPx };
      return replaceMeasurement(before, params.measurementId, { ...found.measurement, manualArea });
    },
    undo: () => before,
    event: { type: 'MeasurementManualAreaSet', surfaceId: before.id, measurementId: params.measurementId },
  };
}
