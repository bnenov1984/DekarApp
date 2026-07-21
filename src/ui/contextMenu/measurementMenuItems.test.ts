import { describe, expect, it } from 'vitest';
import { buildBackgroundContextMenuItems, buildMeasurementContextMenuItems } from './measurementMenuItems.js';
import type { Layer, Measurement, Surface } from '../../core/domain/entities.js';

// PO follow-up (UX review, item A14 "no context menus") — these builders are shared by
// CanvasStage/MeasurementList/MeasurementChip's right-click handlers (their own header comment
// explains why); this only checks the *shape* of the returned item list for each selection state
// — the actions themselves ride already-tested store functions (studioSession.test.ts,
// roundtrip.test.ts), not re-verified here.

function polygonMeasurement(id: string, overrides: Partial<Measurement> = {}): Measurement {
  return {
    id,
    shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    identity: { name: 'Square', color: '#2E7D32' },
    provenance: 'Manual',
    locked: false,
    ...overrides,
  };
}

function rectangleMeasurement(id: string): Measurement {
  return {
    id,
    shape: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 10, rotation: 0 },
    identity: { name: 'Rect', color: '#1565C0' },
    provenance: 'Manual',
    locked: false,
  };
}

function surfaceWith(measurements: Measurement[]): Surface {
  const layer: Layer = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements };
  return { id: 'surface1', kind: 'blank', calibration: null, layers: [layer] };
}

function labels(items: readonly { readonly label: string }[]): string[] {
  return items.map((i) => i.label);
}

describe('buildMeasurementContextMenuItems', () => {
  it('returns nothing for an empty selection', () => {
    expect(buildMeasurementContextMenuItems(new Set(), surfaceWith([]), false)).toEqual([]);
  });

  it('single polygon selected: Rename, Duplicate, Split, Hide, Lock, Delete, in that order', () => {
    const surface = surfaceWith([polygonMeasurement('m1')]);
    const items = buildMeasurementContextMenuItems(new Set(['m1']), surface, false);
    expect(labels(items)).toEqual(['Rename', 'Duplicate', 'Split', 'Hide', 'Lock', 'Delete']);
    expect(items.find((i) => i.label === 'Delete')?.danger).toBe(true);
    expect(items.find((i) => i.label === 'Delete')?.disabled).toBe(false);
  });

  it('single non-polygon (Rectangle) selected: no Split entry', () => {
    const surface = surfaceWith([rectangleMeasurement('m1')]);
    const items = buildMeasurementContextMenuItems(new Set(['m1']), surface, false);
    expect(labels(items)).toEqual(['Rename', 'Duplicate', 'Hide', 'Lock', 'Delete']);
  });

  // PO follow-up ("per-measurement lock") — a locked single selection: Lock becomes Unlock, Split
  // is omitted entirely (same as splitting-active), Delete stays present but disabled (rather
  // than omitted — so the reason a click does nothing is visible, same "disabled, not hidden"
  // convention as the Properties panel's own Delete button).
  it('single locked polygon: Unlock instead of Lock, no Split, Delete disabled', () => {
    const surface = surfaceWith([polygonMeasurement('m1', { locked: true })]);
    const items = buildMeasurementContextMenuItems(new Set(['m1']), surface, false);
    expect(labels(items)).toEqual(['Rename', 'Duplicate', 'Hide', 'Unlock', 'Delete']);
    expect(items.find((i) => i.label === 'Delete')?.disabled).toBe(true);
  });

  it('a single already-hidden measurement shows "Show" instead of "Hide"', () => {
    const surface = surfaceWith([polygonMeasurement('m1', { identity: { name: 'Square', color: '#2E7D32', hidden: true } })]);
    const items = buildMeasurementContextMenuItems(new Set(['m1']), surface, false);
    expect(labels(items)).toContain('Show');
    expect(labels(items)).not.toContain('Hide');
  });

  it('Split is omitted while splitting is already active', () => {
    const surface = surfaceWith([polygonMeasurement('m1')]);
    expect(labels(buildMeasurementContextMenuItems(new Set(['m1']), surface, true))).not.toContain('Split');
  });

  it('multi-select: only the bulk-safe subset (Duplicate/Delete), with counts, no Rename/Split/Hide', () => {
    const surface = surfaceWith([polygonMeasurement('m1'), polygonMeasurement('m2')]);
    const items = buildMeasurementContextMenuItems(new Set(['m1', 'm2']), surface, false);
    expect(labels(items)).toEqual(['Duplicate (2)', 'Delete (2)']);
    expect(items.find((i) => i.label === 'Delete (2)')?.danger).toBe(true);
  });
});

describe('buildBackgroundContextMenuItems', () => {
  it('locked -> a single "Unlock" item', () => {
    expect(labels(buildBackgroundContextMenuItems(true))).toEqual(['Unlock']);
  });

  it('unlocked -> a single "Lock" item', () => {
    expect(labels(buildBackgroundContextMenuItems(false))).toEqual(['Lock']);
  });
});
