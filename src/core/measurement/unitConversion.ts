import type { Unit } from '../domain/types.js';

// 17 §7 — "единиците са display concern, приложен след изчисление в базова единица
// (винаги метри вътрешно)". This module is that final conversion step.

const METERS_PER_FOOT = 0.3048;
const SQM_PER_SQFT = METERS_PER_FOOT * METERS_PER_FOOT;
const SQM_PER_HECTARE = 10_000;
const SQM_PER_ACRE = 4_046.8564224;

/** Converts a length already expressed in meters into `toUnit`. `px`/area units are rejected —
 * callers must not mix length and area units. */
export function convertLengthFromMeters(meters: number, toUnit: Unit): number {
  switch (toUnit) {
    case 'm':
      return meters;
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
    case 'm2':
      return squareMeters;
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
  return unit === 'm2' || unit === 'ft2' || unit === 'ha' || unit === 'acre';
}

/** Inverse of convertLengthFromMeters — a length given in `fromUnit` becomes meters. */
export function convertLengthToMeters(value: number, fromUnit: Unit): number {
  switch (fromUnit) {
    case 'm':
      return value;
    case 'ft':
      return value * METERS_PER_FOOT;
    case 'px':
      return value;
    default:
      throw new Error(`convertLengthToMeters: '${fromUnit}' is not a length unit`);
  }
}
