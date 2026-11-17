import { describe, expect, it } from 'vitest';
import { computePolygonEdgeLabels } from './edgeLabels.js';
import type { Point } from '../../core/domain/types.js';

// A 100x100 px square, vertices clockwise in screen space (y grows downward) starting top-left —
// same simple fixture shape as computeDisplay.test.ts's own squares.
const square: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('computePolygonEdgeLabels — closed (a committed Measurement polygon)', () => {
  it('returns one label per edge, including the wraparound back to the first vertex', () => {
    const labels = computePolygonEdgeLabels(square, true, null, 'm2');
    expect(labels).toHaveLength(4);
  });

  it('anchors each label at its edge midpoint', () => {
    const labels = computePolygonEdgeLabels(square, true, null, 'm2');
    expect(labels.map((l) => l.midpoint)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ]);
  });

  it('normalizes every angle into (-90, 90] so no label renders upside-down', () => {
    const labels = computePolygonEdgeLabels(square, true, null, 'm2');
    // top edge (left->right): 0°; right edge (top->bottom): 90°; bottom edge (right->left) would
    // be 180° unnormalized -> 0°; left edge (bottom->top) would be -90° unnormalized -> +90°.
    expect(labels.map((l) => l.angleDeg)).toEqual([0, 90, 0, 90]);
    for (const l of labels) {
      expect(l.angleDeg).toBeGreaterThan(-90);
      expect(l.angleDeg).toBeLessThanOrEqual(90);
    }
  });

  it('formats each edge length in px when uncalibrated, same unit Perimeter uses', () => {
    const labels = computePolygonEdgeLabels(square, true, null, 'm2');
    expect(labels.every((l) => l.text === '100 px')).toBe(true);
  });

  it('formats each edge length in real units once calibrated — independent of unit requested for area', () => {
    const calibration = { kind: 'linear' as const, metersPerPixel: 0.1 }; // 100px -> 10m
    const labels = computePolygonEdgeLabels(square, true, calibration, 'm2');
    expect(labels.every((l) => l.text === '10 m')).toBe(true);
  });
});

describe('computePolygonEdgeLabels — open (a still-in-progress draft)', () => {
  it('drops the not-yet-drawn wraparound edge back to the first point', () => {
    const labels = computePolygonEdgeLabels(square, false, null, 'm2');
    expect(labels).toHaveLength(3);
    expect(labels.map((l) => l.midpoint)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
    ]);
  });

  it('is correct for a two-point draft (a single live segment, no polygon yet)', () => {
    const labels = computePolygonEdgeLabels([{ x: 0, y: 0 }, { x: 30, y: 40 }], false, null, 'm2');
    expect(labels).toHaveLength(1);
    expect(labels[0]!.text).toBe('50 px'); // 3-4-5 triangle * 10
  });
});

describe('computePolygonEdgeLabels — degenerate input', () => {
  it('returns nothing for fewer than 2 points', () => {
    expect(computePolygonEdgeLabels([], true, null, 'm2')).toEqual([]);
    expect(computePolygonEdgeLabels([{ x: 0, y: 0 }], true, null, 'm2')).toEqual([]);
  });
});
