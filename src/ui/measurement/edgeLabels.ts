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
  /** Degrees, normalized to (-90, 90] so the label is never upside-down regardless of which way
   * the edge points. */
  readonly angleDeg: number;
  readonly text: string;
}

/**
 * One label per edge of `vertices`. `closed: true` (a committed Measurement's own `shape.vertices`)
 * pairs the last vertex back to the first, matching `segmentLengths[i]`'s own `vertices[i] ->
 * vertices[(i+1)%n]` convention exactly. `closed: false` (a still-in-progress Polygon draft,
 * `vertices` already including the live cursor point as its provisional last entry — the same
 * synthetic shape `CanvasStage.svelte`'s own live-area preview builds) drops that last, not-yet-
 * drawn wraparound edge: `pathForDraft` (sceneRenderer.ts) never renders a closing segment back to
 * the first point while still drawing, so a label for it would float over nothing.
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
    labels.push({ from, to, midpoint, angleDeg, text: formatLengthValue(length, values.unit) });
  }
  return labels;
}
