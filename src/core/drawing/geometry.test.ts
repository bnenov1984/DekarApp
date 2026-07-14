import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { isSimplePolygon, nearestPointOnSegment, segmentsIntersect } from './geometry.js';

describe('segmentsIntersect', () => {
  it('detects a crossing X pattern', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }),
    ).toBe(true);
  });

  it('does not flag parallel non-touching segments', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }),
    ).toBe(false);
  });

  it('does not flag segments that only share an endpoint region far apart', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 6, y: 5 }),
    ).toBe(false);
  });
});

describe('isSimplePolygon', () => {
  it('accepts a convex square', () => {
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toBe(true);
  });

  it('accepts a non-convex L-shape', () => {
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).toBe(true);
  });

  it('rejects a bowtie (self-intersecting) polygon', () => {
    expect(
      isSimplePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false);
  });

  it('rejects fewer than 3 vertices', () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('property: a convex polygon inscribed in a circle is always simple', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 20 }), (n) => {
        const vertices = Array.from({ length: n }, (_, i) => {
          const theta = (2 * Math.PI * i) / n;
          return { x: Math.cos(theta), y: Math.sin(theta) };
        });
        expect(isSimplePolygon(vertices)).toBe(true);
      }),
    );
  });
});

describe('nearestPointOnSegment', () => {
  it('clamps to the segment endpoint when the projection falls outside it', () => {
    const p = nearestPointOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('finds the perpendicular foot when it falls within the segment', () => {
    const p = nearestPointOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(5, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });
});
