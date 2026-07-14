import type { PolygonShape, Point, Result } from '../domain/types.js';
import { fail, ok } from '../domain/types.js';

// docs/18_DRAWING_ENGINE.md §5 — Split (PD-009). Boundary-partition algorithm: works for
// non-convex polygons because it only relies on "walk the boundary between two crossing
// points," never on convexity. Requires the splitLine to cross the polygon boundary in exactly
// 2 points (15 §5 F7 UX rule, enforced here as the sole validation gate).

export type SplitFailureReason = 'MUST_CROSS_EXACTLY_TWICE';

interface BoundaryHit {
  readonly point: Point;
  readonly polygonEdgeIndex: number;
  readonly polygonEdgeT: number;
  readonly lineSegmentIndex: number;
  readonly lineT: number;
}

/** Parametric 2D segment intersection. Returns null for parallel/non-crossing segments. */
function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): { point: Point; tA: number; tB: number } | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  const tA = Math.min(1, Math.max(0, t));
  const tB = Math.min(1, Math.max(0, u));
  return { point: { x: a1.x + tA * d1x, y: a1.y + tA * d1y }, tA, tB };
}

function findBoundaryHits(polygonVertices: readonly Point[], splitLine: readonly Point[]): BoundaryHit[] {
  const hits: BoundaryHit[] = [];
  const n = polygonVertices.length;
  for (let i = 0; i < n; i++) {
    const a1 = polygonVertices[i]!;
    const a2 = polygonVertices[(i + 1) % n]!;
    for (let k = 0; k < splitLine.length - 1; k++) {
      const b1 = splitLine[k]!;
      const b2 = splitLine[k + 1]!;
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (hit) {
        hits.push({
          point: hit.point,
          polygonEdgeIndex: i,
          polygonEdgeT: hit.tA,
          lineSegmentIndex: k,
          lineT: hit.tB,
        });
      }
    }
  }
  return hits;
}

/** 15 §5 F7 — exposed so the UI can enable/disable the confirm action live while the user
 * drags the splitting line, without invoking split() itself. */
export function canSplit(polygon: PolygonShape, splitLine: readonly Point[]): boolean {
  if (splitLine.length < 2) return false;
  return findBoundaryHits(polygon.vertices, splitLine).length === 2;
}

/** Walks the polygon boundary forward (increasing vertex index, wrapping) from `from` to `to`.
 * Handles the same-edge case (both hits fall on one polygon edge) by comparing their parametric
 * positions: if `from` is already "ahead of" `to` on that edge, a full revolution is required to
 * stay strictly forward. */
function walkForward(
  vertices: readonly Point[],
  fromEdgeIndex: number,
  fromPoint: Point,
  fromT: number,
  toEdgeIndex: number,
  toPoint: Point,
  toT: number,
): Point[] {
  const n = vertices.length;
  const result: Point[] = [fromPoint];

  if (fromEdgeIndex === toEdgeIndex && fromT <= toT) {
    result.push(toPoint);
    return result;
  }

  let i = (fromEdgeIndex + 1) % n;
  for (;;) {
    result.push(vertices[i]!);
    if (i === toEdgeIndex) break;
    i = (i + 1) % n;
  }
  result.push(toPoint);
  return result;
}

/** Points on the splitLine strictly between `entry` and `exit`, in the line's own forward
 * order — 18 §5: "всяка вътрешна точка на полилинията се третира като допълнителен връх". */
function intermediateLinePoints(splitLine: readonly Point[], entry: BoundaryHit, exit: BoundaryHit): Point[] {
  const points: Point[] = [];
  for (let k = entry.lineSegmentIndex + 1; k <= exit.lineSegmentIndex; k++) {
    points.push(splitLine[k]!);
  }
  return points;
}

/** 18 §5 — the Split operation. Returns exactly 2 children whose boundaries partition the
 * parent's: each shares the entry↔exit sub-path (walked in opposite directions), which is why
 * Σ(children.area) = parent.area holds by geometric construction, not approximation
 * (INV-4, 14 §4; validated as a defensive check by Measurement Engine, 17 §6). */
export function split(
  polygon: PolygonShape,
  splitLine: readonly Point[],
): Result<[PolygonShape, PolygonShape], SplitFailureReason> {
  const hits = findBoundaryHits(polygon.vertices, splitLine);
  if (hits.length !== 2) return fail('MUST_CROSS_EXACTLY_TWICE');

  const [entry, exit] = [...hits].sort(
    (a, b) => a.lineSegmentIndex - b.lineSegmentIndex || a.lineT - b.lineT,
  ) as [BoundaryHit, BoundaryHit];

  const forwardIntermediate = intermediateLinePoints(splitLine, entry, exit);

  const childA: PolygonShape = {
    type: 'polygon',
    vertices: [
      ...walkForward(
        polygon.vertices,
        entry.polygonEdgeIndex,
        entry.point,
        entry.polygonEdgeT,
        exit.polygonEdgeIndex,
        exit.point,
        exit.polygonEdgeT,
      ),
      ...[...forwardIntermediate].reverse(),
    ],
  };

  const childB: PolygonShape = {
    type: 'polygon',
    vertices: [
      ...walkForward(
        polygon.vertices,
        exit.polygonEdgeIndex,
        exit.point,
        exit.polygonEdgeT,
        entry.polygonEdgeIndex,
        entry.point,
        entry.polygonEdgeT,
      ),
      ...forwardIntermediate,
    ],
  };

  return ok([childA, childB]);
}
