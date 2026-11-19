import { compute } from '../../core/measurement/measurementEngine.js';
import { formatLengthValue } from './computeDisplay.js';
import type { Calibration, Point, Unit } from '../../core/domain/types.js';

// PO request (per-edge length labels, grilling session 2026-11-17) — Polygon only. `compute()`
// already produces `segmentLengths[]` for a Polygon (17_MEASUREMENT_ENGINE.md §2's documented
// contract table), fully calibrated/unit-converted; this module adds only the UI-layer display
// concerns compute() deliberately has no opinion on — which point pairs up with which length, a
// label's world-space anchor (edge midpoint), and the rotation that makes it read as "belonging"
// to that edge (CAD dimension-line convention) rather than a stray floating number.
//
// Deliberately independent of Measurement.manualArea (entities.ts): confirmed in the grilling
// session that a manual area can never be inverted into per-edge lengths (infinitely many edge-
// length sets share one area — a shear of any single vertex preserves area while changing every
// adjacent edge), so these always come straight from geometry+calibration, exactly like
// Perimeter already does (PropertyPanel.svelte never applies manualArea to Perimeter either).

export interface PolygonEdgeLabel {
  readonly from: Point;
  readonly to: Point;
  readonly midpoint: Point;
  /** Bug fix (user report, 2026-11-19) — the unit vector, at `midpoint`, pointing into the
   * polygon's own interior, perpendicular to this edge. `{ x: 0, y: 0 }` only for a degenerate
   * (zero-area, e.g. a still-2-point draft) vertex list, where "inside" isn't yet defined — the
   * label then falls back to sitting exactly on `midpoint`, same as before this fix, until a third
   * point gives the shape an actual interior. Callers nudge the label along this direction by
   * whatever amount their own coordinate convention calls for (`EDGE_LABEL_INWARD_OFFSET_PX`
   * below) — kept separate from `midpoint` itself so this module stays the single source of the
   * *geometry* fact ("which way is inward"), not the *rendering* decision ("how far to nudge"). */
  readonly inwardUnitNormal: Point;
  /** Degrees, normalized to (-90, 90] so the label is never upside-down regardless of which way
   * the edge points. */
  readonly angleDeg: number;
  readonly text: string;
}

/** Bug fix (user report, 2026-11-19) — "the numbers on Edges On sit on the line itself and are
 * hard to read, put them on the inside of the polygon." A fixed screen-space distance (same
 * zoom-independent-constant convention as `vertexHandleRadius`/the vertex-label drag radius,
 * sceneRenderer.ts): callers in a viewport-scaled context (CanvasStage.svelte) divide this by the
 * current zoom scale before adding it to `midpoint`; `pictureExport.ts` — no viewport, 1 world
 * unit already renders at its own fixed oversampling — uses it directly as a world-space offset,
 * the same "world unit ~= CSS px at 1x" convention `PADDING_WORLD` there already assumes. One
 * constant, so the live canvas and the exported picture nudge the label by a visually equal amount. */
export const EDGE_LABEL_INWARD_OFFSET_PX = 14;

/** Sign of the shoelace sum (unnormalized, not `Math.abs`-ed like `shoelaceArea`/divided by 2)
 * decides, once and for every edge consistently, which of an edge's two perpendicular directions
 * points into the polygon — the general, winding-order-based rule (works for any simple polygon,
 * convex or concave) rather than "toward the centroid" (which can point the wrong way across a
 * concave vertex). Verified against this module's own test fixture (a clockwise-on-screen,
 * Y-down square) rather than relied on from the math convention's usual CCW/CW naming, since that
 * naming flips meaning between Y-up and Y-down coordinate systems and this codebase's Surface
 * space is Y-down (screen convention, CanvasStage.svelte). */
function polygonWindingSign(vertices: readonly Point[]): number {
  const n = vertices.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = vertices[i]!;
    const p2 = vertices[(i + 1) % n]!;
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.sign(sum);
}

function inwardUnitNormalFor(from: Point, to: Point, windingSign: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || windingSign === 0) return { x: 0, y: 0 };
  // windingSign > 0 (this module's test fixture): rotate the edge vector -90° (-dy, dx) to face
  // inward; the other winding gets the opposite perpendicular.
  // `|| 0` avoids a stray `-0` (e.g. a perfectly horizontal edge's `-dy`) reaching callers/tests —
  // arithmetically identical to `0`, just structurally distinct under strict equality.
  const nx = (windingSign > 0 ? -dy : dy) || 0;
  const ny = (windingSign > 0 ? dx : -dx) || 0;
  return { x: nx / length, y: ny / length };
}

/**
 * One label per edge of `vertices`. `closed: true` (a committed Measurement's own `shape.vertices`)
 * pairs the last vertex back to the first, matching `segmentLengths[i]`'s own `vertices[i] ->
 * vertices[(i+1)%n]` convention exactly. `closed: false` (a still-in-progress Polygon draft,
 * `vertices` already including the live cursor point as its provisional last entry — the same
 * synthetic shape `CanvasStage.svelte`'s own live-area preview builds) drops that last, not-yet-
 * drawn wraparound edge: `pathForDraft` (sceneRenderer.ts) never renders a closing segment back to
 * the first point while still drawing, so a label for it would float over nothing. `inwardUnitNormal`
 * is always computed from the *full* `vertices` list treated as if already closed — even for an
 * open draft — so the polygon's implied interior (and therefore which way is "inward") stays
 * stable as the user adds more points, rather than being undefined until the shape actually closes.
 */
export function computePolygonEdgeLabels(
  vertices: readonly Point[],
  closed: boolean,
  calibration: Calibration,
  unit: Unit,
): readonly PolygonEdgeLabel[] {
  const n = vertices.length;
  if (n < 2) return [];

  const values = compute({ type: 'polygon', vertices }, calibration, unit);
  const lengths = values.segmentLengths ?? [];
  const edgeCount = closed ? n : n - 1;
  const windingSign = polygonWindingSign(vertices);

  const labels: PolygonEdgeLabel[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const length = lengths[i];
    if (length === undefined) continue;
    const from = vertices[i]!;
    const to = vertices[(i + 1) % n]!;
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    let angleDeg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    if (angleDeg > 90) angleDeg -= 180;
    if (angleDeg <= -90) angleDeg += 180;
    const inwardUnitNormal = inwardUnitNormalFor(from, to, windingSign);
    labels.push({ from, to, midpoint, inwardUnitNormal, angleDeg, text: formatLengthValue(length, values.unit) });
  }
  return labels;
}
