import type { PolygonShape, Point, Result } from '../domain/types.js';
import { fail, ok } from '../domain/types.js';
import { shoelaceArea } from '../measurement/formulas.js';
import { canSplit, split, type SplitFailureReason } from './split.js';

// PO request ("Redesign and fix Split functionality") — N-way Equal/Random subdivision of a
// Polygon, built entirely on top of the existing, already-tested `canSplit`/`split` primitives
// (never a new polygon-clipping algorithm — see the design note below for why that reuse is
// safe). Recursively peels one piece off the still-remaining polygon `count - 1` times; each
// peel is itself a single, ordinary 2-way `split()` call, so every returned piece inherits
// `split()`'s own unconditional partition guarantee (INV-4: children's areas sum to the parent's
// exactly, by construction of the boundary-walk — proven for non-convex polygons too by this
// repo's own golden L/U-shape fixtures, split.test.ts).
//
// What a single peel needs beyond plain `split()`: a cut LINE whose two boundary crossings land
// at a chosen target area fraction. `split()` only requires "exactly 2 crossings" — it does not
// care about direction or about the line's own path staying inside the polygon (the U-shape
// golden fixture proves this: a cut straight through the notch, dipping outside the polygon
// between its two crossings, still partitions correctly). The one thing NOT guaranteed is that a
// single fixed cut direction can reach an arbitrary target ratio on a concave shape — crossing
// count can jump from 2 to 4+ over parts of one direction's range, leaving gaps. This module
// searches a small fan of directions (not just one axis) so it has many chances to find a
// 2-crossing cut at the needed ratio; every candidate is validated through the real
// `canSplit`/`split()` before being trusted, never bypassed. If no direction in the fan finds one,
// the whole call fails explicitly (`'NO_VALID_CUT'`) — nothing invalid is ever fabricated.
//
// Provable guarantees:
//  - Always exactly correct when a result is returned (inherits split()'s partition proof).
//  - Always succeeds for convex polygons, any part count, any ratio: a chord's enclosed area
//    varies continuously and monotonically as it sweeps a convex shape in a single fixed
//    direction, so every ratio in (0,1) is reachable (same principle the existing convex-polygon
//    property test in split.test.ts already exercises for the 2-way case).
//  - Expected (not proven) to succeed for realistic concave "parcel" shapes (L, U, staircase,
//    single/double notch) — validated empirically in splitParts.test.ts against this repo's own
//    golden L/U fixtures, generalized to N-way and random splits.
//  - NOT proven for arbitrary simple polygons: a shape with several deep, interlocking notches
//    could defeat every direction in the fan for some target ratio. That case fails explicitly
//    rather than producing overlapping/invalid geometry — a disclosed, real limitation.

export type SplitDistribution = 'equal' | 'random';
export type SplitPartsFailureReason = SplitFailureReason | 'INVALID_COUNT' | 'NO_VALID_CUT';

const DIRECTION_COUNT = 8; // directions spread across [0, π) — a direction and its opposite (+π) describe the same line family
const OFFSET_SAMPLES = 48;
const BISECTION_ITERATIONS = 40;
const AREA_TOLERANCE_RATIO = 0.01; // 1% of the *piece's own* target area — tight enough for "approximately equal", loose enough for float/geometry noise
const MIN_RANDOM_FRACTION = 0.25;
const MAX_RANDOM_FRACTION = 0.75;

function polygonArea(polygon: PolygonShape): number {
  return shoelaceArea(polygon.vertices);
}

interface Bbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function bbox(polygon: PolygonShape): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon.vertices) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function project(p: Point, origin: Point, dir: Point): number {
  return (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
}

/** A line perpendicular to `dir`, offset `t` along `dir` from `center`, long enough to fully
 * cross the polygon regardless of offset within its bbox. */
function lineAt(center: Point, dir: Point, perp: Point, t: number, halfSpan: number): [Point, Point] {
  const base = { x: center.x + dir.x * t, y: center.y + dir.y * t };
  return [
    { x: base.x - perp.x * halfSpan, y: base.y - perp.y * halfSpan },
    { x: base.x + perp.x * halfSpan, y: base.y + perp.y * halfSpan },
  ];
}

/** Whichever of the two children's area better matches `targetFraction` of `totalArea` — resolved
 * fresh at the end from the actual geometry (never from sweep-order bookkeeping), so it's correct
 * regardless of how `split()` happened to label its two returned children. */
function matchChild(
  a: PolygonShape,
  b: PolygonShape,
  totalArea: number,
  targetFraction: number,
): { readonly piece: PolygonShape; readonly rest: PolygonShape; readonly error: number } {
  const fracA = polygonArea(a) / totalArea;
  const fracB = polygonArea(b) / totalArea;
  const errA = Math.abs(fracA - targetFraction);
  const errB = Math.abs(fracB - targetFraction);
  return errA <= errB ? { piece: a, rest: b, error: errA } : { piece: b, rest: a, error: errB };
}

/** Peels one piece off `polygon` at approximately `targetFraction` of its area, searching a fan
 * of directions. Returns `null` if no direction in the fan finds a valid 2-crossing cut whose
 * area lands within tolerance of the target — the caller (splitIntoParts) turns that into
 * `'NO_VALID_CUT'`, never a fabricated/invalid result. */
function peelOnePiece(polygon: PolygonShape, targetFraction: number): { piece: PolygonShape; rest: PolygonShape } | null {
  const totalArea = polygonArea(polygon);
  if (!(totalArea > 0)) return null;
  const box = bbox(polygon);
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  const halfSpan = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) + 1; // comfortably beyond the bbox diagonal

  for (let k = 0; k < DIRECTION_COUNT; k++) {
    const theta = (Math.PI * k) / DIRECTION_COUNT;
    const dir: Point = { x: Math.cos(theta), y: Math.sin(theta) };
    const perp: Point = { x: -Math.sin(theta), y: Math.cos(theta) };

    const projections = polygon.vertices.map((v) => project(v, center, dir));
    const minT = Math.min(...projections);
    const maxT = Math.max(...projections);
    if (maxT - minT < 1e-9) continue; // degenerate — polygon has ~zero extent along this direction

    // Sample offsets strictly inside (minT, maxT); keep only valid (exactly-2-crossing) samples,
    // tracking fracA(t) = area(childA)/totalArea as a plain numeric sequence (childA is whichever
    // `split()` happens to label first at that offset — not assumed stable across samples).
    const samples: { t: number; fracA: number }[] = [];
    for (let i = 1; i < OFFSET_SAMPLES; i++) {
      const t = minT + ((maxT - minT) * i) / OFFSET_SAMPLES;
      const line = lineAt(center, dir, perp, t, halfSpan);
      if (!canSplit(polygon, line)) continue;
      const result = split(polygon, line);
      if (!result.ok) continue;
      const [a] = result.value;
      samples.push({ t, fracA: polygonArea(a) / totalArea });
    }

    // A bracket is two *adjacent* valid samples whose fracA values straddle either targetFraction
    // or its complement (1 - targetFraction) — whichever child ends up matching, matchChild()
    // resolves at the end.
    for (let i = 0; i < samples.length - 1; i++) {
      const s0 = samples[i]!;
      const s1 = samples[i + 1]!;
      const lo = Math.min(s0.fracA, s1.fracA);
      const hi = Math.max(s0.fracA, s1.fracA);
      const straddlesTarget = targetFraction >= lo && targetFraction <= hi;
      const straddlesComplement = 1 - targetFraction >= lo && 1 - targetFraction <= hi;
      if (!straddlesTarget && !straddlesComplement) continue;
      const goal = straddlesTarget ? targetFraction : 1 - targetFraction;

      let tLo = s0.t;
      let fLo = s0.fracA;
      let tHi = s1.t;
      let bestLine: [Point, Point] = lineAt(center, dir, perp, s0.t, halfSpan);
      for (let iter = 0; iter < BISECTION_ITERATIONS; iter++) {
        const tMid = (tLo + tHi) / 2;
        const line = lineAt(center, dir, perp, tMid, halfSpan);
        if (!canSplit(polygon, line)) break; // left the stable 2-crossing region — stop, use last valid line
        const result = split(polygon, line);
        if (!result.ok) break;
        const [a] = result.value;
        const fMid = polygonArea(a) / totalArea;
        bestLine = line;
        if (Math.abs(fMid - goal) <= 1e-6) break;
        if ((fMid < goal) === (fLo < goal)) {
          tLo = tMid;
          fLo = fMid;
        } else {
          tHi = tMid;
        }
      }

      const finalResult = split(polygon, bestLine);
      if (!finalResult.ok) continue;
      const [a, b] = finalResult.value;
      const matched = matchChild(a, b, totalArea, targetFraction);
      if (matched.error <= AREA_TOLERANCE_RATIO * Math.max(targetFraction, 1 - targetFraction)) {
        return { piece: matched.piece, rest: matched.rest };
      }
    }
  }
  return null;
}

function validateCount(count: number): SplitPartsFailureReason | null {
  return Number.isInteger(count) && count >= 2 && count <= 24 ? null : 'INVALID_COUNT';
}

/** N-way Equal/Random subdivision of a Polygon (see module doc for the algorithm and its
 * guarantees/limits). `'equal'` targets `1/remainingCount` at every peel; `'random'` targets a
 * uniformly random fraction of the *remaining* piece in `[0.25, 0.75]` at every peel but shy of
 * the last one (the last piece is always "whatever's left", by construction) — only the ratio is
 * randomized, the cut itself goes through the identical validated search as `'equal'`, so
 * coverage/no-overlap/stay-inside-original hold identically for both modes. */
export function splitIntoParts(
  polygon: PolygonShape,
  count: number,
  distribution: SplitDistribution,
  rng: () => number = Math.random,
): Result<PolygonShape[], SplitPartsFailureReason> {
  const countError = validateCount(count);
  if (countError) return fail(countError);

  const pieces: PolygonShape[] = [];
  let remaining = polygon;
  let remainingCount = count;

  while (remainingCount > 1) {
    const targetFraction =
      distribution === 'equal' ? 1 / remainingCount : MIN_RANDOM_FRACTION + rng() * (MAX_RANDOM_FRACTION - MIN_RANDOM_FRACTION);
    const peeled = peelOnePiece(remaining, targetFraction);
    if (!peeled) return fail('NO_VALID_CUT');
    pieces.push(peeled.piece);
    remaining = peeled.rest;
    remainingCount -= 1;
  }
  pieces.push(remaining);
  return ok(pieces);
}
