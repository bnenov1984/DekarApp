import type { Point } from '../domain/types.js';

// Low-level planar geometry helpers shared by drawingEngine.ts and snap.ts. Pure, no Shape
// awareness — operates on raw point lists/segments only.

function orientation(p: Point, q: Point, r: Point): 0 | 1 | 2 {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0; // collinear
  return val > 0 ? 1 : 2;
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

/** General-position segment intersection test (orientation-based), with a collinear-overlap
 * fallback. Not exact-arithmetic robust — adequate for interactive drawing input, not a CAD
 * kernel. */
export function segmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

/** 18 §2 — a Polygon Shape is valid only if it has ≥3 vertices and no two non-adjacent edges
 * intersect. Drawing Engine enforces this at every mutation point (create/editVertex/addVertex/
 * removeVertex) so Measurement Engine can trust it unconditionally (17 §3.1). */
export function isSimplePolygon(vertices: readonly Point[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const isAdjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (isAdjacent) continue;
      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

/** The polygon's area with a sign for its winding (shoelace): positive one way round, negative
 * the other, 0 when it has no area. */
export function signedArea(vertices: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i]!;
    const q = vertices[(i + 1) % vertices.length]!;
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

/** PD-025 — `after` is wound the other way round from `before`, or has collapsed to no area. A
 * `before` with no area has no winding to reverse. */
export function windingReversed(before: readonly Point[], after: readonly Point[]): boolean {
  const was = Math.sign(signedArea(before));
  return was !== 0 && Math.sign(signedArea(after)) !== was;
}

export function nearestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return a;
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
