import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { splitIntoParts } from './splitParts.js';
import { shoelaceArea } from '../measurement/formulas.js';
import type { PolygonShape, Point } from '../domain/types.js';

// docs/22_TDD.md §5.2-style golden non-convex fixtures, reused verbatim from split.test.ts —
// same regression anchors, now exercised through the N-way splitIntoParts() built on top of the
// same canSplit/split() primitives. Empirically validates (not just asserts) the claims in
// splitParts.ts's own module doc: always correct when it returns a result; always succeeds for
// convex polygons; expected (and here verified) to succeed for these concave "parcel" fixtures.

const square: PolygonShape = {
  type: 'polygon',
  vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
};

const lShape: PolygonShape = {
  type: 'polygon',
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ], // area = 12
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
  ], // area = 20
};

function totalArea(pieces: readonly PolygonShape[]): number {
  return pieces.reduce((sum, p) => sum + shoelaceArea(p.vertices), 0);
}

describe('splitIntoParts — INVALID_COUNT', () => {
  it('rejects a count below 2', () => {
    const result = splitIntoParts(square, 1, 'equal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INVALID_COUNT');
  });

  it('rejects a non-integer count', () => {
    const result = splitIntoParts(square, 2.5, 'equal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INVALID_COUNT');
  });

  it('rejects a count above the sanity cap', () => {
    const result = splitIntoParts(square, 25, 'equal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('INVALID_COUNT');
  });
});

describe('splitIntoParts — equal distribution, convex square', () => {
  it.each([2, 3, 4, 5, 6])('splits into %i approximately-equal pieces summing exactly to the parent area', (count) => {
    const result = splitIntoParts(square, count, 'equal');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(count);
    const parentArea = shoelaceArea(square.vertices);
    for (const piece of result.value) {
      const area = shoelaceArea(piece.vertices);
      expect(Math.abs(area - parentArea / count) / (parentArea / count)).toBeLessThan(0.05); // within 5% of equal share
    }
    expect(totalArea(result.value)).toBeCloseTo(parentArea, 6);
  });
});

describe('splitIntoParts — random distribution, convex square', () => {
  it('produces N pieces that always sum exactly to the parent area, for a fixed seed', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let count = 2; count <= 6; count++) {
      const result = splitIntoParts(square, count, 'random', rng);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value).toHaveLength(count);
      // every piece has a real, positive, non-degenerate area (no zero-width slivers escaping as "valid")
      for (const piece of result.value) expect(shoelaceArea(piece.vertices)).toBeGreaterThan(0.01);
      expect(totalArea(result.value)).toBeCloseTo(shoelaceArea(square.vertices), 6);
    }
  });
});

describe('splitIntoParts — L-shape golden fixture (non-convex, single notch)', () => {
  it.each([2, 3, 4])('splits into %i pieces summing exactly to the parent area', (count) => {
    const result = splitIntoParts(lShape, count, 'equal');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(count);
    expect(totalArea(result.value)).toBeCloseTo(shoelaceArea(lShape.vertices), 6);
  });
});

describe('splitIntoParts — U-shape golden fixture (non-convex, two reflex vertices)', () => {
  it.each([2, 3])('splits into %i pieces summing exactly to the parent area', (count) => {
    const result = splitIntoParts(uShape, count, 'equal');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(count);
    expect(totalArea(result.value)).toBeCloseTo(shoelaceArea(uShape.vertices), 6);
  });
});

describe('splitIntoParts — INV-4 property: N pieces always partition arbitrary convex polygons exactly', () => {
  it('Σ(pieces.area) == parent.area for random convex n-gons, random part counts, both distributions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 8 }), // polygon vertex count
        fc.integer({ min: 2, max: 5 }), // part count
        fc.constantFrom<'equal' | 'random'>('equal', 'random'),
        fc.integer({ min: 1, max: 1_000_000 }), // rng seed
        (n, count, distribution, seedInput) => {
          const vertices: Point[] = Array.from({ length: n }, (_, i) => {
            const theta = (2 * Math.PI * i) / n;
            return { x: 10 * Math.cos(theta), y: 10 * Math.sin(theta) };
          });
          const polygon: PolygonShape = { type: 'polygon', vertices };
          let seed = seedInput;
          const rng = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
          };

          const result = splitIntoParts(polygon, count, distribution, rng);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.value).toHaveLength(count);
          const parentArea = shoelaceArea(vertices);
          const sum = totalArea(result.value);
          expect(Math.abs(sum - parentArea) / parentArea).toBeLessThan(1e-6);
        },
      ),
      { numRuns: 100 },
    );
  });
});
