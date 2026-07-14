import { describe, expect, it } from 'vitest';
import {
  euclideanDistance,
  haversineDistanceMeters,
  interiorAngles,
  polygonPerimeter,
  shoelaceArea,
} from './formulas.js';

describe('shoelaceArea', () => {
  it('computes area of a unit square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(shoelaceArea(square)).toBeCloseTo(1, 10);
  });

  it('computes area of a 10x5 rectangle regardless of winding order', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 0 },
    ];
    const ccw = [...cw].reverse();
    expect(shoelaceArea(cw)).toBeCloseTo(50, 10);
    expect(shoelaceArea(ccw)).toBeCloseTo(50, 10);
  });

  it('computes area of a triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(shoelaceArea(triangle)).toBeCloseTo(6, 10);
  });

  it('computes area of a non-convex L-shape correctly (18 §5 Split must support this)', () => {
    // L-shape: a 4x4 square with a 2x2 notch cut from the top-right corner.
    const lShape = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    // Area = 4x4 - 2x2 = 12
    expect(shoelaceArea(lShape)).toBeCloseTo(12, 10);
  });

  it('remains numerically stable for a needle-thin polygon', () => {
    const needle = [
      { x: 0, y: 0 },
      { x: 1000, y: 0.0001 },
      { x: 1000, y: 0 },
    ];
    expect(shoelaceArea(needle)).toBeGreaterThan(0);
    expect(shoelaceArea(needle)).toBeCloseTo(0.05, 5);
  });
});

describe('polygonPerimeter', () => {
  it('computes perimeter of a 3-4-5 right triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(polygonPerimeter(triangle)).toBeCloseTo(3 + 4 + 5, 10);
  });
});

describe('interiorAngles', () => {
  it('reports 90° for every vertex of a square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const angles = interiorAngles(square);
    for (const a of angles) {
      expect(a).toBeCloseTo(Math.PI / 2, 10);
    }
  });

  it('reports one reflex angle (270°) for the L-shape notch vertex', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 }, // reflex vertex
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    const angles = interiorAngles(lShape);
    const reflexCount = angles.filter((a) => a > Math.PI).length;
    expect(reflexCount).toBe(1);
    const reflexAngle = angles.find((a) => a > Math.PI)!;
    expect(reflexAngle).toBeCloseTo((3 * Math.PI) / 2, 10);
    // sum of interior angles of a simple polygon with n vertices = (n-2)*π
    const sum = angles.reduce((s, a) => s + a, 0);
    expect(sum).toBeCloseTo((lShape.length - 2) * Math.PI, 8);
  });

  it('interior angle sum for a triangle is π', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    const sum = interiorAngles(triangle).reduce((s, a) => s + a, 0);
    expect(sum).toBeCloseTo(Math.PI, 10);
  });
});

describe('euclideanDistance', () => {
  it('computes a 3-4-5 distance', () => {
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 10);
  });
});

describe('haversineDistanceMeters', () => {
  it('computes ~0 distance for identical points', () => {
    const p = { x: 23.32, y: 42.7 }; // Sofia-ish
    expect(haversineDistanceMeters(p, p)).toBeCloseTo(0, 6);
  });

  it('computes 1 degree of latitude as ~111.2 km, independent of longitude', () => {
    const a = { x: 0, y: 10 };
    const b = { x: 0, y: 11 };
    const d = haversineDistanceMeters(a, b);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('computes a known equatorial 1-degree-longitude distance as ~111.3 km', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const d = haversineDistanceMeters(a, b);
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_500);
  });
});
