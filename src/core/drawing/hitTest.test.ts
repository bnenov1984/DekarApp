import { describe, expect, it } from 'vitest';
import { hitTestShape } from './hitTest.js';
import type { CircleShape, LineShape, PolygonShape, RectangleShape } from '../domain/types.js';

const square: PolygonShape = {
  type: 'polygon',
  vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
};

describe('hitTestShape — polygon', () => {
  it('hits a point inside the polygon', () => {
    expect(hitTestShape({ x: 5, y: 5 }, square, 1)).toBe(true);
  });

  it('misses a point clearly outside', () => {
    expect(hitTestShape({ x: 50, y: 50 }, square, 1)).toBe(false);
  });

  it('hits a point exactly on the boundary within tolerance', () => {
    expect(hitTestShape({ x: -0.5, y: 5 }, square, 1)).toBe(true);
  });

  it('hits inside an L-shape notch correctly (non-convex, 18 §5 territory)', () => {
    const lShape: PolygonShape = {
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }],
    };
    expect(hitTestShape({ x: 1, y: 1 }, lShape, 0.1)).toBe(true); // inside the L
    expect(hitTestShape({ x: 3, y: 3 }, lShape, 0.1)).toBe(false); // inside the notch (removed area)
  });
});

describe('hitTestShape — rectangle', () => {
  it('hits inside an axis-aligned rectangle', () => {
    const rect: RectangleShape = { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 5, rotation: 0 };
    expect(hitTestShape({ x: 5, y: 2 }, rect, 1)).toBe(true);
    expect(hitTestShape({ x: 15, y: 2 }, rect, 1)).toBe(false);
  });

  it('accounts for rotation', () => {
    const rect: RectangleShape = {
      type: 'rectangle',
      origin: { x: 0, y: 0 },
      width: 10,
      height: 2,
      rotation: Math.PI / 2, // rotated 90°: now extends along +y, not +x
    };
    expect(hitTestShape({ x: 5, y: 0 }, rect, 1)).toBe(false); // would hit if unrotated
    expect(hitTestShape({ x: 0, y: 5 }, rect, 1)).toBe(true); // hits post-rotation
  });
});

describe('hitTestShape — circle', () => {
  it('hits inside, misses outside', () => {
    const circle: CircleShape = { type: 'circle', center: { x: 0, y: 0 }, radius: 5 };
    expect(hitTestShape({ x: 3, y: 3 }, circle, 0)).toBe(true); // ~4.24 < 5
    expect(hitTestShape({ x: 10, y: 10 }, circle, 0)).toBe(false);
  });
});

describe('hitTestShape — line (open shape, hits only near the path)', () => {
  it('hits near the segment, misses far away, misses the "interior" of its bounding box', () => {
    const line: LineShape = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
    expect(hitTestShape({ x: 5, y: 0.2 }, line, 0.5)).toBe(true);
    expect(hitTestShape({ x: 5, y: 5 }, line, 0.5)).toBe(false); // "inside" the bbox but far from the line
  });
});

describe('hitTestShape — freehand', () => {
  it('closed freehand hits interior like a polygon', () => {
    const shape = { type: 'freehand' as const, points: square.vertices, closed: true };
    expect(hitTestShape({ x: 5, y: 5 }, shape, 1)).toBe(true);
  });

  it('open freehand hits only near the path, not its bbox interior', () => {
    const shape = {
      type: 'freehand' as const,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      closed: false,
    };
    expect(hitTestShape({ x: 2, y: 8 }, shape, 0.5)).toBe(false); // inside bbox, far from the L-path
    expect(hitTestShape({ x: 5, y: 0.1 }, shape, 0.5)).toBe(true);
  });
});
