import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compute } from './measurementEngine.js';
import type {
  CircleShape,
  LineShape,
  PolygonShape,
  RectangleShape,
  Shape,
} from '../domain/types.js';

describe('compute — px mode (uncalibrated, 17 §2)', () => {
  it('forces unit to px regardless of requested unit', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5, rotation: 0 };
    const values = compute(rect, null, 'm2');
    expect(values.unit).toBe('px');
    expect(values.area).toBeCloseTo(50, 10);
    expect(values.perimeter).toBeCloseTo(30, 10);
  });

  it('computes a circle', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 3 };
    const values = compute(circle, null, 'px');
    expect(values.area).toBeCloseTo(Math.PI * 9, 10);
    expect(values.perimeter).toBeCloseTo(2 * Math.PI * 3, 10);
    expect(values.radius).toBe(3);
    expect(values.diameter).toBe(6);
  });

  it('computes a line (distance tool)', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 3, y: 4 } };
    const values = compute(line, null, 'px');
    expect(values.length).toBeCloseTo(5, 10);
  });
});

describe('compute — linear calibration (Image/PDF, 17 §7)', () => {
  const square: PolygonShape = {
    type: 'polygon',
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  // 100px = 10m -> 0.1 m/px. Square is 100x100 px = 10x10 m = 100 m².
  const calibration = { kind: 'linear' as const, metersPerPixel: 0.1 };

  it('scales area by metersPerPixel²', () => {
    const values = compute(square, calibration, 'm2');
    expect(values.unit).toBe('m2');
    expect(values.area).toBeCloseTo(100, 8);
    expect(values.perimeter).toBeCloseTo(40, 8);
  });

  it('converts to ft2 correctly', () => {
    const values = compute(square, calibration, 'ft2');
    expect(values.unit).toBe('ft2');
    // 100 m² ≈ 1076.39 ft²
    expect(values.area).toBeCloseTo(1076.39, 1);
  });

  it('converts to hectares correctly', () => {
    const values = compute(square, calibration, 'ha');
    expect(values.area).toBeCloseTo(0.01, 6);
  });

  it('leaves interior angles unaffected by uniform scaling', () => {
    const values = compute(square, calibration, 'm2');
    for (const a of values.interiorAngles ?? []) {
      expect(a).toBeCloseTo(Math.PI / 2, 8);
    }
  });

  // PO request (expanded unit system) — mm/cm/in weren't reachable Unit values until now.
  it('converts to mm2 correctly, and its perimeter to the paired mm length unit', () => {
    const values = compute(square, calibration, 'mm2');
    expect(values.unit).toBe('mm2');
    expect(values.area).toBeCloseTo(100_000_000, 0); // 100 m² = 1e8 mm²
    expect(values.perimeter).toBeCloseTo(40_000, 0); // 40 m = 40000 mm
  });

  it('converts to cm2 correctly, and its perimeter to the paired cm length unit', () => {
    const values = compute(square, calibration, 'cm2');
    expect(values.unit).toBe('cm2');
    expect(values.area).toBeCloseTo(1_000_000, 0); // 100 m² = 1e6 cm²
    expect(values.perimeter).toBeCloseTo(4_000, 0); // 40 m = 4000 cm
  });

  it('converts to in2 correctly, and its perimeter to the paired inch length unit', () => {
    const values = compute(square, calibration, 'in2');
    expect(values.unit).toBe('in2');
    expect(values.area).toBeCloseTo(155_000.31, 0); // 100 m² ≈ 155000.31 in²
  });

  it('a plain length request (Line, not an area shape) converts via the same paired-unit path', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 30, y: 40 } }; // 50px = 5m
    const values = compute(line, calibration, 'mm2'); // area-paired unit, even though Line has no area
    expect(values.length).toBeCloseTo(5000, 0); // 5 m = 5000 mm
  });
});

describe('compute — INV-2 (14 §4): pure function, same input -> same output', () => {
  it('property: repeated calls with identical Shape/Calibration/Unit always agree', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: -1000, max: 1000, noNaN: true }),
            y: fc.double({ min: -1000, max: 1000, noNaN: true }),
          }),
          { minLength: 3, maxLength: 8 },
        ),
        (vertices) => {
          const shape: Shape = { type: 'polygon', vertices };
          const calibration = { kind: 'linear' as const, metersPerPixel: 0.05 };
          const first = compute(shape, calibration, 'm2');
          const second = compute(shape, calibration, 'm2');
          const third = compute(shape, calibration, 'm2');
          expect(second).toStrictEqual(first);
          expect(third).toStrictEqual(first);
        },
      ),
    );
  });
});
