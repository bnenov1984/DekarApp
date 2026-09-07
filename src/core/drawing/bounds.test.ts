import { describe, expect, it } from 'vitest';
import { boundsIntersect, shapeBounds, unionBounds } from './bounds.js';
import type { CircleShape, LineShape, PolygonShape, RectangleShape } from '../domain/types.js';

describe('shapeBounds', () => {
  it('polygon — min/max over its vertices', () => {
    const shape: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 10, y: -5 }, { x: 30, y: 20 }, { x: 0, y: 8 }],
    };
    expect(shapeBounds(shape)).toEqual({ minX: 0, minY: -5, maxX: 30, maxY: 20 });
  });

  it('rectangle — unrotated', () => {
    const shape: RectangleShape = { type: 'rectangle', origin: { x: 5, y: 5 }, width: 10, height: 20, rotation: 0 };
    expect(shapeBounds(shape)).toEqual({ minX: 5, minY: 5, maxX: 15, maxY: 25 });
  });

  it('rectangle — rotated 45°, bbox grows to fit the tilted corners', () => {
    const shape: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 10, rotation: Math.PI / 4 };
    const bounds = shapeBounds(shape)!;
    // a 10x10 square rotated 45° has a diagonal of 10*sqrt(2) ≈ 14.14
    expect(bounds.maxX - bounds.minX).toBeCloseTo(10 * Math.SQRT2, 5);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(10 * Math.SQRT2, 5);
  });

  it('circle — center ± radius on both axes', () => {
    const shape: CircleShape = { type: 'circle', center: { x: 10, y: 10 }, radius: 4 };
    expect(shapeBounds(shape)).toEqual({ minX: 6, minY: 6, maxX: 14, maxY: 14 });
  });

  it('line — bounds of its two endpoints', () => {
    const shape: LineShape = { type: 'line', from: { x: 0, y: 10 }, to: { x: 10, y: 0 } };
    expect(shapeBounds(shape)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('unionBounds', () => {
  it('returns the smallest Bounds containing both inputs', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: -5, minY: 5, maxX: 20, maxY: 8 };
    expect(unionBounds(a, b)).toEqual({ minX: -5, minY: 0, maxX: 20, maxY: 10 });
  });
});

// PO follow-up (UX review, item A13 "multi-select marquee")
describe('boundsIntersect', () => {
  it('true for overlapping boxes', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(boundsIntersect(a, b)).toBe(true);
  });

  it('true when one box is fully inside the other', () => {
    const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const inner = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
    expect(boundsIntersect(outer, inner)).toBe(true);
  });

  it('true when the boxes merely touch at an edge', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 10, minY: 0, maxX: 20, maxY: 10 };
    expect(boundsIntersect(a, b)).toBe(true);
  });

  it('false for boxes with a gap between them', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 11, minY: 0, maxX: 20, maxY: 10 };
    expect(boundsIntersect(a, b)).toBe(false);
  });

  it('is symmetric', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    expect(boundsIntersect(a, b)).toBe(boundsIntersect(b, a));
  });
});
