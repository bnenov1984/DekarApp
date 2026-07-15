import { describe, expect, it } from 'vitest';
import { shapeCentroid } from './centroid.js';
import type { CircleShape, LineShape, PolygonShape, RectangleShape } from '../domain/types.js';

describe('shapeCentroid', () => {
  it('polygon: vertex average of a square is its true center', () => {
    const square: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    };
    expect(shapeCentroid(square)).toEqual({ x: 5, y: 5 });
  });

  it('rectangle: unrotated centroid is origin + half extents', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 10, y: 20 }, width: 10, height: 4, rotation: 0 };
    const c = shapeCentroid(rect);
    expect(c.x).toBeCloseTo(15, 10);
    expect(c.y).toBeCloseTo(22, 10);
  });

  it('rectangle: rotation is applied to the center offset', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 2, rotation: Math.PI / 2 };
    const c = shapeCentroid(rect);
    // unrotated center would be (5, 1); rotated 90° around origin -> (-1, 5)
    expect(c.x).toBeCloseTo(-1, 10);
    expect(c.y).toBeCloseTo(5, 10);
  });

  it('circle: centroid is the center', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 7, y: 3 }, radius: 5 };
    expect(shapeCentroid(circle)).toEqual({ x: 7, y: 3 });
  });

  it('line: centroid is the midpoint', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 4 } };
    expect(shapeCentroid(line)).toEqual({ x: 5, y: 2 });
  });

  it('freehand/curve: vertex average of their point lists', () => {
    const freehand = { type: 'freehand' as const, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }], closed: false };
    const c = shapeCentroid(freehand);
    expect(c.x).toBeCloseTo(5, 10);
    expect(c.y).toBeCloseTo(10 / 3, 10);
  });
});
