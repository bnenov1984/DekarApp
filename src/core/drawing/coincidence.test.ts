import { describe, expect, it } from 'vitest';
import { COINCIDENCE_EPSILON, pointOnSegmentInterior, pointsCoincide } from './coincidence.js';

// PD-024 / INV-19 — "the same point" means exactly the same coordinates, up to floating-point
// noise. Deliberately not the snap tolerance (18 §4): two points placed a pixel apart by hand must
// stay independent at every zoom level.

describe('pointsCoincide', () => {
  it.each([
    ['identical', { x: 5, y: 7 }, { x: 5, y: 7 }, true],
    ['within epsilon', { x: 5, y: 7 }, { x: 5 + COINCIDENCE_EPSILON / 2, y: 7 }, true],
    ['just outside epsilon', { x: 5, y: 7 }, { x: 5 + COINCIDENCE_EPSILON * 2, y: 7 }, false],
    ['a pixel apart (would snap, must not link)', { x: 5, y: 7 }, { x: 6, y: 7 }, false],
    ['differs only in y', { x: 5, y: 7 }, { x: 5, y: 7.001 }, false],
  ])('%s', (_label, a, b, expected) => {
    expect(pointsCoincide(a, b)).toBe(expected);
  });
});

describe('pointOnSegmentInterior', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it.each([
    ['midpoint', { x: 5, y: 0 }, true],
    ['within epsilon of the segment', { x: 5, y: COINCIDENCE_EPSILON / 2 }, true],
    ['just off the segment', { x: 5, y: COINCIDENCE_EPSILON * 2 }, false],
    ['at an endpoint (a vertex, not an interior point)', { x: 0, y: 0 }, false],
    ['at the other endpoint', { x: 10, y: 0 }, false],
    ['on the line but beyond the segment', { x: 12, y: 0 }, false],
  ])('%s', (_label, p, expected) => {
    expect(pointOnSegmentInterior(p, a, b)).toBe(expected);
  });

  it('works for a diagonal segment', () => {
    expect(pointOnSegmentInterior({ x: 0.1 + 0.2, y: 0.3 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
});
