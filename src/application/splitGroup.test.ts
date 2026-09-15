import { describe, expect, it } from 'vitest';
import type { Layer, Measurement, Surface } from '../core/domain/entities.js';
import { shoelaceArea } from '../core/measurement/formulas.js';
import { childrenOf, findMeasurement } from './surfaceOps.js';
import { rebalanceSplitGroups } from './splitGroup.js';

// PD-021 — unit coverage for the pure rebalancing helper, alongside the integration coverage that
// drives it through real commands (commands/roundtrip.test.ts, T-INV-15). Same split of
// responsibility as vertexLabels.ts / vertexLabels.test.ts: the helper's own edge cases are cheaper
// to pin down here, the behaviour users actually experience is pinned down at the command seam.

function rect(id: string, x0: number, x1: number, parentId?: string, factor?: number): Measurement {
  return {
    id,
    shape: {
      type: 'polygon',
      vertices: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 10 }, { x: x0, y: 10 }],
    },
    identity: { name: id, color: '#2E7D32' },
    provenance: 'Manual',
    locked: false,
    ...(parentId !== undefined && { parentId }),
    ...(factor !== undefined && { manualArea: { squareMetersPerSquarePixel: factor } }),
  };
}

function surfaceOf(measurements: Measurement[]): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'image', calibration: null, layers: [layer] };
}

function displayedArea(surface: Surface, id: string): number {
  const m = findMeasurement(surface, id)!.measurement;
  if (m.shape.type !== 'polygon') throw new Error('expected a polygon');
  return shoelaceArea(m.shape.vertices) * (m.manualArea?.squareMetersPerSquarePixel ?? 0);
}

function groupSum(surface: Surface, parentId: string): number {
  return childrenOf(surface, parentId).reduce(
    (sum, child) => sum + displayedArea(surface, child.id),
    0,
  );
}

describe('rebalanceSplitGroups', () => {
  it('gives the whole group one shared factor that makes it sum to the parent total', () => {
    // parent 0..20 (200 px², factor 6 -> 1200 m²); parts are 0..14 (140 px²) and 10..20 (100 px²),
    // so their geometry no longer sums to the parent's — the group must still divide 1200
    const surface = surfaceOf([rect('parent', 0, 20, undefined, 6), rect('a', 0, 14, 'parent', 6), rect('b', 10, 20, 'parent', 6)]);

    const rebalanced = rebalanceSplitGroups(surface, 'a');

    expect(groupSum(rebalanced, 'parent')).toBeCloseTo(1200, 9);
    const factorA = findMeasurement(rebalanced, 'a')!.measurement.manualArea!.squareMetersPerSquarePixel;
    const factorB = findMeasurement(rebalanced, 'b')!.measurement.manualArea!.squareMetersPerSquarePixel;
    expect(factorA).toBeCloseTo(factorB, 12); // proportional distribution == one shared factor
    expect(factorA).toBeCloseTo(1200 / 240, 9);
  });

  it('is an exact no-op when the parts still tile the parent, matching inherit-verbatim', () => {
    // the state right after a split: parts sum to the parent's geometry, so the shared factor the
    // helper computes is precisely the parent's own — PD-021 generalises the old behaviour, and
    // this is the case where the two must agree exactly
    const surface = surfaceOf([rect('parent', 0, 20, undefined, 6), rect('a', 0, 10, 'parent', 6), rect('b', 10, 20, 'parent', 6)]);

    expect(rebalanceSplitGroups(surface, 'a')).toEqual(surface);
  });

  it('leaves a group whose parent has no manual area completely untouched', () => {
    const surface = surfaceOf([rect('parent', 0, 20), rect('a', 0, 14, 'parent'), rect('b', 10, 20, 'parent')]);

    expect(rebalanceSplitGroups(surface, 'a')).toEqual(surface);
  });

  it('leaves a measurement that is in no group untouched', () => {
    const surface = surfaceOf([rect('lonely', 0, 10, undefined, 6)]);

    expect(rebalanceSplitGroups(surface, 'lonely')).toEqual(surface);
  });

  it('redistributes the parent total when the parent itself is the one that changed', () => {
    // parent shrunk to 0..16 (160 px², factor 6 -> 960 m²) while its parts still tile the old span
    const surface = surfaceOf([rect('parent', 0, 16, undefined, 6), rect('a', 0, 10, 'parent', 6), rect('b', 10, 20, 'parent', 6)]);

    const rebalanced = rebalanceSplitGroups(surface, 'parent');

    expect(groupSum(rebalanced, 'parent')).toBeCloseTo(960, 9);
    expect(findMeasurement(rebalanced, 'parent')!.measurement).toEqual(findMeasurement(surface, 'parent')!.measurement);
  });

  it('cascades to a nested group so every level divides its own parent total', () => {
    const surface = surfaceOf([
      rect('parent', 0, 20, undefined, 6), // 1200 m²
      rect('a', 0, 14, 'parent', 6),
      rect('b', 10, 20, 'parent', 6),
      rect('a1', 0, 7, 'a', 6), // parts of 'a'
      rect('a2', 7, 14, 'a', 6),
    ]);

    const rebalanced = rebalanceSplitGroups(surface, 'a');

    expect(groupSum(rebalanced, 'parent')).toBeCloseTo(1200, 9);
    expect(groupSum(rebalanced, 'a')).toBeCloseTo(displayedArea(rebalanced, 'a'), 9);
  });

  it('skips a degenerate group rather than dividing by zero', () => {
    const zeroWidth = rect('a', 5, 5, 'parent', 6); // zero geometric area
    const surface = surfaceOf([rect('parent', 0, 20, undefined, 6), zeroWidth]);

    const rebalanced = rebalanceSplitGroups(surface, 'a');

    expect(rebalanced).toEqual(surface);
    expect(findMeasurement(rebalanced, 'a')!.measurement.manualArea!.squareMetersPerSquarePixel).toBe(6);
  });

  it('ignores a measurement id that is not on the surface', () => {
    const surface = surfaceOf([rect('parent', 0, 20, undefined, 6)]);

    expect(rebalanceSplitGroups(surface, 'missing')).toEqual(surface);
  });
});
