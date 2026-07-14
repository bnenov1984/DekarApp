import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canSplit, split } from './split.js';
import { shoelaceArea } from '../measurement/formulas.js';
import type { PolygonShape, Point } from '../domain/types.js';

// docs/22_TDD.md §5.2 — golden non-convex fixtures (never weakened without an explicit PD).
// These are the regression anchor for PD-009 / INV-4 on realistic irregular-parcel shapes
// (09 journeys J2: naследствен парцел delba), not just the generic convex case.

const lShape: PolygonShape = {
  type: 'polygon',
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ], // area = 12 (4x4 square minus a 2x2 notch)
};

const uShape: PolygonShape = {
  type: 'polygon',
  vertices: [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ], // 6x4 rectangle minus a 2x2 notch centered at the top = 24 - 4 = 20
};

describe('split — L-shape golden fixture (non-convex, 22 §5.2)', () => {
  it('rejects a line that does not cross the boundary exactly twice', () => {
    const missesEntirely: Point[] = [{ x: -5, y: -5 }, { x: -5, y: 10 }];
    expect(canSplit(lShape, missesEntirely)).toBe(false);
  });

  it('splits the L-shape into two pieces whose areas sum exactly to the parent area', () => {
    const verticalCut: Point[] = [{ x: 1, y: -1 }, { x: 1, y: 5 }];
    expect(canSplit(lShape, verticalCut)).toBe(true);

    const result = split(lShape, verticalCut);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [childA, childB] = result.value;
    const areaA = shoelaceArea(childA.vertices);
    const areaB = shoelaceArea(childB.vertices);
    const parentArea = shoelaceArea(lShape.vertices);

    expect(parentArea).toBeCloseTo(12, 10);
    expect(areaA + areaB).toBeCloseTo(parentArea, 8); // INV-4
    // one piece is the plain 1x4 rectangle strip (area 4), the other carries the notch (area 8)
    const areas = [areaA, areaB].sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(4, 8);
    expect(areas[1]).toBeCloseTo(8, 8);
  });

  it('splits diagonally across the shape and still partitions exactly', () => {
    // Note: several "obvious" diagonals across this particular L (e.g. corner-to-corner, or
    // through the notch) turn out to pass exactly through an existing vertex — (0,4), (2,2), or
    // (4,0) all happen to be collinear with natural-looking diagonals here. That's the
    // explicitly PARKED "split line touches an existing vertex" edge case (Phase 3 gate review,
    // condition ISS-005), not what this test means to exercise. This line was chosen (and
    // verified) to cross cleanly through two edges without touching any vertex.
    const diagonalCut: Point[] = [{ x: -1, y: 3.2 }, { x: 1, y: -1 }];
    const result = split(lShape, diagonalCut);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [childA, childB] = result.value;
    const sum = shoelaceArea(childA.vertices) + shoelaceArea(childB.vertices);
    expect(sum).toBeCloseTo(shoelaceArea(lShape.vertices), 8);
  });
});

describe('split — U-shape golden fixture (non-convex, two reflex vertices, 22 §5.2)', () => {
  it('splits into two pieces summing to the parent area', () => {
    const verticalCut: Point[] = [{ x: 3, y: -1 }, { x: 3, y: 5 }];
    expect(canSplit(uShape, verticalCut)).toBe(true);

    const result = split(uShape, verticalCut);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [childA, childB] = result.value;
    const parentArea = shoelaceArea(uShape.vertices);
    expect(parentArea).toBeCloseTo(20, 10);
    const sum = shoelaceArea(childA.vertices) + shoelaceArea(childB.vertices);
    expect(sum).toBeCloseTo(parentArea, 8);
    // symmetric cut down the middle of a symmetric U -> two equal 10-area halves
    expect(shoelaceArea(childA.vertices)).toBeCloseTo(10, 6);
    expect(shoelaceArea(childB.vertices)).toBeCloseTo(10, 6);
  });
});

describe('split — manual path unaffected (PD-009: "допълнение, не замяна")', () => {
  it('split does not mutate the parent Shape', () => {
    const before = JSON.parse(JSON.stringify(lShape.vertices));
    split(lShape, [{ x: 1, y: -1 }, { x: 1, y: 5 }]);
    expect(lShape.vertices).toEqual(before);
  });
});

describe('split — INV-4 property: children partition the parent for arbitrary convex polygons', () => {
  it('Σ(children.area) == parent.area for random convex n-gons and random valid chords', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        fc.double({ min: 0.15, max: 0.85, noNaN: true }),
        fc.integer({ min: 0, max: 9 }),
        fc.double({ min: 0.15, max: 0.85, noNaN: true }),
        (n, rawEdgeA, tA, rawEdgeB, tB) => {
          const vertices = Array.from({ length: n }, (_, i) => {
            const theta = (2 * Math.PI * i) / n;
            return { x: 10 * Math.cos(theta), y: 10 * Math.sin(theta) };
          });
          const polygon: PolygonShape = { type: 'polygon', vertices };
          const edgeA = rawEdgeA % n;
          const edgeB = rawEdgeB % n;
          fc.pre(edgeA !== edgeB); // need two distinct edges for a clean 2-crossing chord

          const pointOnEdge = (edgeIndex: number, t: number): Point => {
            const p1 = vertices[edgeIndex]!;
            const p2 = vertices[(edgeIndex + 1) % n]!;
            return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
          };

          const a = pointOnEdge(edgeA, tA);
          const b = pointOnEdge(edgeB, tB);
          // extend the chord slightly beyond both boundary points so it cleanly crosses,
          // rather than terminating exactly on the boundary (a degenerate case not exercised here)
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const extendedA = { x: a.x - 0.01 * dx, y: a.y - 0.01 * dy };
          const extendedB = { x: b.x + 0.01 * dx, y: b.y + 0.01 * dy };

          const result = split(polygon, [extendedA, extendedB]);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const [childA, childB] = result.value;
          const parentArea = shoelaceArea(vertices);
          const sum = shoelaceArea(childA.vertices) + shoelaceArea(childB.vertices);
          expect(Math.abs(sum - parentArea) / parentArea).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 200 },
    );
  });
});
