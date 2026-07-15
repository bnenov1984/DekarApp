import { compute } from '../../core/measurement/measurementEngine.js';
import { roundForDisplay, type PrecisionContext } from '../../core/measurement/precision.js';
import type { Calibration, MeasurementValues, Shape, Unit } from '../../core/domain/types.js';

// UI-layer formatting on top of the two pure Core modules (17 §2 compute, §5 precision) — this
// file contains no geometry/measurement math of its own, only display concerns (label text,
// unit suffixes). Linear (Image/PDF) calibration is wired since the Calibration UI slice
// (`calibrationSession.ts`); the geo branch is still written for forward-compatibility with
// Core's actual contract, not exercised by any UI flow yet (no Map surfaces).

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

/** PropertyPanel's Values section (16 §3.2) needs perimeter formatted *alongside* an area
 * primaryLabel — `computeMeasurementDisplay` only ever surfaces one of area/length as the
 * primary label, so this reuses the same precision/unit-label rules for the secondary field
 * instead of duplicating them. */
export function formatLengthValue(length: number, unit: Unit): string {
  const ctx = precisionContextFor(unit);
  const rounded = roundForDisplay(length, ctx);
  return `${rounded} ${lengthUnitLabel(unit)}`;
}
