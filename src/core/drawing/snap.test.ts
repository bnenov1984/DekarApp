import { describe, expect, it } from 'vitest';
import { snap } from './snap.js';
import type { PolygonShape } from '../domain/types.js';

const otherSquare: PolygonShape = {
  type: 'polygon',
  vertices: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
};

const baseContext = {
  otherShapes: [otherSquare],
  toleranceSurfaceUnits: 2,
  snapEnabled: true,
  angleConstraintHeld: false,
};

describe('snap — priority order (18 §4)', () => {
  it('snaps to a vertex when the cursor is within tolerance', () => {
    const result = snap({ x: 11, y: 9 }, baseContext);
    expect(result.snapped).toBe(true);
    expect(result.target).toEqual({ kind: 'vertex', point: { x: 10, y: 10 } });
  });

  it('snaps to an edge when near a segment but not a vertex', () => {
    const result = snap({ x: 15, y: 9 }, baseContext);
    expect(result.snapped).toBe(true);
    expect(result.target?.kind).toBe('edge');
    expect(result.position.y).toBeCloseTo(10, 10);
  });

  it('does not snap when far from any target', () => {
    const result = snap({ x: 1000, y: 1000 }, baseContext);
    expect(result.snapped).toBe(false);
    expect(result.position).toEqual({ x: 1000, y: 1000 });
  });

  it('prefers vertex over edge when both are within tolerance', () => {
    // very close to the (10,10) vertex, which is also technically near two edges
    const result = snap({ x: 10.5, y: 10.5 }, { ...baseContext, toleranceSurfaceUnits: 3 });
    expect(result.target?.kind).toBe('vertex');
  });
});

describe('snap — self-snap closing (18 §4.4, always active)', () => {
  it('snaps to the first vertex of the current shape even when snapEnabled is false', () => {
    const result = snap(
      { x: 1, y: 1 },
      { ...baseContext, snapEnabled: false, firstVertexOfCurrentShape: { x: 0, y: 0 } },
    );
    expect(result.snapped).toBe(true);
    expect(result.target).toEqual({ kind: 'self', point: { x: 0, y: 0 } });
  });
});

describe('snap — ⌥ disables vertex/edge/angle but not self-snap', () => {
  it('does not snap to another shape vertex when snapEnabled is false', () => {
    const result = snap({ x: 11, y: 9 }, { ...baseContext, snapEnabled: false });
    expect(result.snapped).toBe(false);
  });
});

describe('snap — angle constraint (15 §13, Shift-gated)', () => {
  it('does not angle-snap unless angleConstraintHeld is true', () => {
    const result = snap(
      { x: 10, y: 1 },
      { ...baseContext, otherShapes: [], lastSegmentStart: { x: 0, y: 0 }, angleConstraintHeld: false },
    );
    expect(result.snapped).toBe(false);
  });

  it('snaps to the nearest 45° increment when Shift is held', () => {
    const result = snap(
      { x: 10, y: 1 }, // close to horizontal but not exact
      { ...baseContext, otherShapes: [], lastSegmentStart: { x: 0, y: 0 }, angleConstraintHeld: true },
    );
    expect(result.snapped).toBe(true);
    expect(result.target?.kind).toBe('angle');
    expect(result.position.y).toBeCloseTo(0, 5); // snapped to 0° (horizontal)
  });

  it('snaps a diagonal drag to 45°', () => {
    const result = snap(
      { x: 9, y: 11 },
      { ...baseContext, otherShapes: [], lastSegmentStart: { x: 0, y: 0 }, angleConstraintHeld: true },
    );
    expect(result.position.x).toBeCloseTo(result.position.y, 5); // on the 45° line
  });
});
