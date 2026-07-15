import { compute } from '../../core/measurement/measurementEngine.js';
import { roundForDisplay, type PrecisionContext } from '../../core/measurement/precision.js';
import type { Calibration, MeasurementValues, Shape, Unit } from '../../core/domain/types.js';

// UI-layer formatting on top of the two pure Core modules (17 §2 compute, §5 precision) — this
// file contains no geometry/measurement math of its own, only display concerns (label text,
// unit suffixes). No Surface created in the app yet carries a non-null Calibration (the
// calibration UI/CalibrationService integration doesn't exist yet — ISS-adjacent, disclosed):
// every measurement today computes in px mode. The geo/linear branches below are written for
// forward-compatibility with Core's actual contract, not exercised by any UI flow yet.

export interface MeasurementDisplay {
  readonly values: MeasurementValues;
  /** area for closed shapes, length for open ones (Line) — whichever compute() actually populated */
  readonly primaryLabel: string;
}

function areaUnitLabel(unit: Unit): string {
  switch (unit) {
    case 'px':
      return 'px²';
    case 'm2':
      return 'm²';
    case 'ft2':
      return 'ft²';
    case 'ha':
      return 'ha';
    case 'acre':
      return 'ac';
    default:
      return unit;
  }
}

function lengthUnitLabel(unit: Unit): string {
  return unit === 'px' ? 'px' : unit;
}

function precisionContextFor(unit: Unit): PrecisionContext {
  if (unit === 'px') return { kind: 'px' };
  // Placeholder for the not-yet-reachable calibrated path (see file header) — 2 decimals is
  // 17 §5's own default cap; real calibrationDecimals arrives with CalibrationService UI wiring.
  return { kind: 'linear', calibrationDecimals: 2 };
}

export function computeMeasurementDisplay(shape: Shape, calibration: Calibration, requestedUnit: Unit = 'm2'): MeasurementDisplay {
  const values = compute(shape, calibration, requestedUnit);
  const ctx = precisionContextFor(values.unit);

  if (values.area !== undefined) {
    const rounded = roundForDisplay(values.area, ctx);
    return { values, primaryLabel: `${rounded} ${areaUnitLabel(values.unit)}` };
  }
  if (values.length !== undefined) {
    const rounded = roundForDisplay(values.length, ctx);
    return { values, primaryLabel: `${rounded} ${lengthUnitLabel(values.unit)}` };
  }
  return { values, primaryLabel: '' };
}
