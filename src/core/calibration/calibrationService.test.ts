import { describe, expect, it } from 'vitest';
import { assessPlausibility, fromReferenceLine } from './calibrationService.js';

describe('fromReferenceLine (19 §3, backs 15 §5 F2 step 3)', () => {
  it('derives metersPerPixel from a reference line in meters', () => {
    const cal = fromReferenceLine(200, 10, 'm'); // 200px = 10m
    expect(cal.kind).toBe('linear');
    expect(cal.metersPerPixel).toBeCloseTo(0.05, 10);
  });

  it('converts non-meter units to the internal meters base (17 §7)', () => {
    const cal = fromReferenceLine(100, 10, 'ft'); // 100px = 10ft
    const expectedMetersPerPixel = (10 * 0.3048) / 100;
    expect(cal.metersPerPixel).toBeCloseTo(expectedMetersPerPixel, 10);
  });

  it('rejects non-positive pixel distance', () => {
    expect(() => fromReferenceLine(0, 10, 'm')).toThrow();
    expect(() => fromReferenceLine(-5, 10, 'm')).toThrow();
  });

  it('rejects non-positive real length', () => {
    expect(() => fromReferenceLine(100, 0, 'm')).toThrow();
  });
});

describe('assessPlausibility (US-033 sanity warning)', () => {
  it('flags a surface that would be implausibly large (e.g. a "room" spanning kilometers)', () => {
    const cal = fromReferenceLine(10, 1000, 'm'); // wildly wrong scale: 10px = 1000m
    const result = assessPlausibility(cal, 800, 600); // typical small image dimensions
    expect(result.plausible).toBe(false);
    expect(result.impliedWidthMeters).toBeGreaterThan(5000);
  });

  it('flags a surface that would be implausibly small', () => {
    const cal = fromReferenceLine(1000, 0.001, 'm'); // 1000px = 1mm
    const result = assessPlausibility(cal, 800, 600);
    expect(result.plausible).toBe(false);
  });

  it('accepts a realistic backyard-sized calibration', () => {
    const cal = fromReferenceLine(200, 10, 'm'); // 0.05 m/px
    const result = assessPlausibility(cal, 800, 600); // implies 40m x 30m
    expect(result.plausible).toBe(true);
    expect(result.impliedWidthMeters).toBeCloseTo(40, 5);
    expect(result.impliedHeightMeters).toBeCloseTo(30, 5);
  });

  it('does not block — only informs (19 §3: non-blocking)', () => {
    // assessPlausibility never throws, regardless of how implausible the result is.
    const cal = fromReferenceLine(1, 100_000, 'm');
    expect(() => assessPlausibility(cal, 800, 600)).not.toThrow();
  });
});
