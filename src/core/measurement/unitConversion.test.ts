import { describe, expect, it } from 'vitest';
import {
  convertLengthFromMeters,
  convertLengthToMeters,
  convertAreaFromMeters,
  isAreaUnit,
} from './unitConversion.js';

// PO request (expanded unit system) — this module previously had no dedicated test file (only
// exercised indirectly through measurementEngine.test.ts's 'm'/'ft' cases); adding one now that
// mm/cm/in are new, real conversion paths, not just pass-through identities.

describe('convertLengthFromMeters', () => {
  it('converts meters to mm/cm/m/in/ft', () => {
    expect(convertLengthFromMeters(1, 'mm')).toBeCloseTo(1000, 10);
    expect(convertLengthFromMeters(1, 'cm')).toBeCloseTo(100, 10);
    expect(convertLengthFromMeters(1, 'm')).toBeCloseTo(1, 10);
    expect(convertLengthFromMeters(1, 'in')).toBeCloseTo(39.3700787, 6);
    expect(convertLengthFromMeters(1, 'ft')).toBeCloseTo(3.2808399, 6);
  });

  it('is an identity for px (uncalibrated values are never actually in meters)', () => {
    expect(convertLengthFromMeters(42, 'px')).toBe(42);
  });

  it('throws for an area unit', () => {
    expect(() => convertLengthFromMeters(1, 'm2')).toThrow();
  });
});

describe('convertLengthToMeters — inverse of convertLengthFromMeters', () => {
  it.each(['mm', 'cm', 'm', 'in', 'ft'] as const)('round-trips through %s without drift', (unit) => {
    const original = 12.34;
    const meters = convertLengthToMeters(original, unit);
    const back = convertLengthFromMeters(meters, unit);
    expect(back).toBeCloseTo(original, 9);
  });
});

describe('convertAreaFromMeters', () => {
  it('converts square meters to mm2/cm2/m2/in2/ft2/ha/acre', () => {
    expect(convertAreaFromMeters(1, 'mm2')).toBeCloseTo(1_000_000, 5);
    expect(convertAreaFromMeters(1, 'cm2')).toBeCloseTo(10_000, 5);
    expect(convertAreaFromMeters(1, 'm2')).toBeCloseTo(1, 10);
    expect(convertAreaFromMeters(1, 'in2')).toBeCloseTo(1550.0031, 3);
    expect(convertAreaFromMeters(1, 'ft2')).toBeCloseTo(10.76391, 4);
    expect(convertAreaFromMeters(10_000, 'ha')).toBeCloseTo(1, 10);
    expect(convertAreaFromMeters(4_046.8564224, 'acre')).toBeCloseTo(1, 10);
  });

  it('throws for a length unit', () => {
    expect(() => convertAreaFromMeters(1, 'm')).toThrow();
  });
});

describe('isAreaUnit', () => {
  it('recognizes every area unit and rejects every length/px unit', () => {
    expect(['mm2', 'cm2', 'm2', 'in2', 'ft2', 'ha', 'acre'].every((u) => isAreaUnit(u as never))).toBe(true);
    expect(['px', 'mm', 'cm', 'm', 'in', 'ft'].some((u) => isAreaUnit(u as never))).toBe(false);
  });
});
