import type { Unit } from '../../core/domain/types.js';

// PO request (expanded unit system) — the UI only ever needs to offer/store ONE unit at a time,
// always the *area-paired* variant (mm2/cm2/m2/in2/ft2): passing that single value straight
// through to `computeMeasurementDisplay`/`compute()` (measurementEngine.ts) already yields the
// correct paired *length* unit for perimeter/segments/length-only shapes via `lengthUnitFor` —
// no separate "length preference" needs to be tracked or converted anywhere in the UI layer.

export type UnitSystem = 'metric' | 'imperial';

export interface UnitOption {
  readonly system: UnitSystem;
  /** the length-unit label shown to the user (mm/cm/m/in/ft) */
  readonly label: string;
  /** the actual Unit value stored/passed around — always the area-paired variant */
  readonly unit: Unit;
}

export const UNIT_OPTIONS: readonly UnitOption[] = [
  { system: 'metric', label: 'mm', unit: 'mm2' },
  { system: 'metric', label: 'cm', unit: 'cm2' },
  { system: 'metric', label: 'm', unit: 'm2' },
  { system: 'imperial', label: 'in', unit: 'in2' },
  { system: 'imperial', label: 'ft', unit: 'ft2' },
];

export function unitOptionFor(unit: Unit): UnitOption | undefined {
  return UNIT_OPTIONS.find((o) => o.unit === unit);
}

export function unitOptionsFor(system: UnitSystem): readonly UnitOption[] {
  return UNIT_OPTIONS.filter((o) => o.system === system);
}
