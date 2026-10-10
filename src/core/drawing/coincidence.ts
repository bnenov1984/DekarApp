import type { Point } from '../domain/types.js';
import { distance, nearestPointOnSegment } from './geometry.js';

// PD-024 / INV-19 — when two vertices count as "the same point". Exact coordinates, with only a
// floating-point safety margin: Split hands both children the very same intersection points
// (split.ts) and vertex snap writes the target's coordinates verbatim (snap.ts), so genuinely
// shared points are already identical. Deliberately a fixed Surface-space constant, never the
// screen-space snap tolerance (18 §4) — two points placed a pixel apart by hand must stay
// independent, and whether shapes are joined must never depend on the zoom level.

export const COINCIDENCE_EPSILON = 1e-6;

export function pointsCoincide(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= COINCIDENCE_EPSILON && Math.abs(a.y - b.y) <= COINCIDENCE_EPSILON;
}

/** True when `p` lies on segment a–b but is neither endpoint — a T-junction candidate (18 §5). */
export function pointOnSegmentInterior(p: Point, a: Point, b: Point): boolean {
  if (pointsCoincide(p, a) || pointsCoincide(p, b)) return false;
  return distance(p, nearestPointOnSegment(p, a, b)) <= COINCIDENCE_EPSILON;
}
