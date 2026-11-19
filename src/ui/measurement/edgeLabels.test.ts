import { describe, expect, it } from 'vitest';
import { computePolygonEdgeLabels } from './edgeLabels.js';
import { pointInPolygon } from '../../core/drawing/hitTest.js';
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

  // Bug fix (user report, 2026-11-19) — "numbers on the line, hard to read" -> each label now
  // carries the direction that points into the polygon's own interior, so callers can nudge it
  // off the stroke. For this clockwise-on-screen square, inward is always toward the (50,50) center.
  it('points inwardUnitNormal toward the polygon interior for every edge', () => {
    const labels = computePolygonEdgeLabels(square, true, null, 'm2');
    expect(labels.map((l) => l.inwardUnitNormal)).toEqual([
      { x: 0, y: 1 }, // top edge -> down, toward center
      { x: -1, y: 0 }, // right edge -> left, toward center
      { x: 0, y: -1 }, // bottom edge -> up, toward center
      { x: 1, y: 0 }, // left edge -> right, toward center
    ]);
  });

  // Self-verifying rather than hand-derived: a tiny nudge from each edge's midpoint along its own
  // `inwardUnitNormal` must land inside the polygon, per the same ray-casting test hitTest.ts's
  // own `pointInPolygon` uses elsewhere — correct for this "toward the centroid" would get wrong
  // across a notch (the centroid sits outside it), the exact case a centroid-based heuristic fails.
  it('a small nudge along inwardUnitNormal always lands inside the polygon, even across a notch', () => {
    const chevron: readonly Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 40 }, // a reflex (notch) vertex — cuts into the shape from the top edge
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const labels = computePolygonEdgeLabels(chevron, true, null, 'm2');
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      expect(label.inwardUnitNormal).not.toEqual({ x: 0, y: 0 });
      const nudged = { x: label.midpoint.x + label.inwardUnitNormal.x, y: label.midpoint.y + label.inwardUnitNormal.y };
      expect(pointInPolygon(nudged, chevron)).toBe(true);
    }
  });

  it('inwardUnitNormal is the zero vector for a degenerate (2-point) draft — no interior yet', () => {
    const labels = computePolygonEdgeLabels([{ x: 0, y: 0 }, { x: 30, y: 40 }], false, null, 'm2');
    expect(labels[0]!.inwardUnitNormal).toEqual({ x: 0, y: 0 });
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
