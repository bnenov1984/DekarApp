import type { Unit } from '../domain/types.js';

// 17 §7 — "единиците са display concern, приложен след изчисление в базова единица
// (винаги метри вътрешно)". This module is that final conversion step.
//
// PO request (expanded unit system) — mm/cm (metric) and in (imperial) added alongside the
// existing m/ft, plus mm2/cm2/in2 area counterparts. Internal base unit is still always meters
// (17 §7) regardless of which unit a caller ultimately wants; only this module's two directions
// (toMeters/fromMeters) know the literal conversion factors.

const METERS_PER_FOOT = 0.3048;
const METERS_PER_INCH = 0.0254;
const METERS_PER_MM = 0.001;
const METERS_PER_CM = 0.01;
const SQM_PER_SQFT = METERS_PER_FOOT * METERS_PER_FOOT;
const SQM_PER_SQIN = METERS_PER_INCH * METERS_PER_INCH;
const SQM_PER_SQMM = METERS_PER_MM * METERS_PER_MM;
const SQM_PER_SQCM = METERS_PER_CM * METERS_PER_CM;
const SQM_PER_HECTARE = 10_000;
const SQM_PER_ACRE = 4_046.8564224;

/** Converts a length already expressed in meters into `toUnit`. `px`/area units are rejected —
 * callers must not mix length and area units. */
export function convertLengthFromMeters(meters: number, toUnit: Unit): number {
  switch (toUnit) {
    case 'mm':
      return meters / METERS_PER_MM;
    case 'cm':
      return meters / METERS_PER_CM;
    case 'm':
      return meters;
    case 'in':
      return meters / METERS_PER_INCH;
    case 'ft':
      return meters / METERS_PER_FOOT;
    case 'px':
      return meters; // px-mode values were never in meters to begin with; identity guard.
    default:
      throw new Error(`convertLengthFromMeters: '${toUnit}' is not a length unit`);
  }
}

/** Converts an area already expressed in square meters into `toUnit`. */
export function convertAreaFromMeters(squareMeters: number, toUnit: Unit): number {
  switch (toUnit) {
    case 'mm2':
      return squareMeters / SQM_PER_SQMM;
    case 'cm2':
      return squareMeters / SQM_PER_SQCM;
    case 'm2':
      return squareMeters;
    case 'in2':
      return squareMeters / SQM_PER_SQIN;
    case 'ft2':
      return squareMeters / SQM_PER_SQFT;
    case 'ha':
      return squareMeters / SQM_PER_HECTARE;
    case 'acre':
      return squareMeters / SQM_PER_ACRE;
    case 'px':
      return squareMeters;
    default:
      throw new Error(`convertAreaFromMeters: '${toUnit}' is not an area unit`);
  }
}

export function isAreaUnit(unit: Unit): boolean {
  return unit === 'mm2' || unit === 'cm2' || unit === 'm2' || unit === 'in2' || unit === 'ft2' || unit === 'ha' || unit === 'acre';
}

/** Inverse of convertLengthFromMeters — a length given in `fromUnit` becomes meters. */
export function convertLengthToMeters(value: number, fromUnit: Unit): number {
  switch (fromUnit) {
    case 'mm':
      return value * METERS_PER_MM;
    case 'cm':
      return value * METERS_PER_CM;
    case 'm':
      return value;
    case 'in':
      return value * METERS_PER_INCH;
    case 'ft':
      return value * METERS_PER_FOOT;
    case 'px':
      return value;
    default:
      throw new Error(`convertLengthToMeters: '${fromUnit}' is not a length unit`);
  }
}
