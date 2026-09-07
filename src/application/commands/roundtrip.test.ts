import { describe, expect, it } from 'vitest';
import { CommandStack } from '../commandStack.js';
import { createMeasurementCommand } from './createMeasurement.js';
import { commitGhostCommand } from './commitGhost.js';
import { deleteMeasurementsCommand } from './deleteMeasurement.js';
import { duplicateMeasurementsCommand } from './duplicateMeasurement.js';
import { editVertexCommand } from './editVertex.js';
import { removeVertexCommand } from './removeVertex.js';
import { splitCommand } from './split.js';
import { splitIntoPartsCommand } from './splitIntoParts.js';
import { resizeRectangleCommand } from './resizeRectangle.js';
import { resizeCircleCommand } from './resizeCircle.js';
import { translateMeasurementCommand } from './translateMeasurement.js';
import { recalibrateCommand } from './recalibrate.js';
import { updateIdentityCommand } from './updateIdentity.js';
import { reorderMeasurementsCommand } from './reorderMeasurements.js';
import { resizeImageCommand } from './resizeImage.js';
import { setImageLockedCommand } from './setImageLocked.js';
import { setVertexLabelCommand } from './setVertexLabel.js';
import { addVertexCommand } from './addVertex.js';
import { resizeRectangleDimensionsCommand } from './resizeRectangleDimensions.js';
import { resizeCircleToRadiusCommand } from './resizeCircleToRadius.js';
import { setMeasurementLockedCommand } from './setMeasurementLocked.js';
import { makeSquareMeasurement, makeTestSurface } from './testFixtures.js';
import { findMeasurement } from '../surfaceOps.js';
import type { Measurement, Surface } from '../../core/domain/entities.js';

// Round-trip shape required by the task, for every scenario below:
//   initial state → execute → expected mutated state → undo → exact initial state
//                 → redo → exact mutated state
// Comparisons use plain `toEqual` (structural/domain equality) — every fixture here is
// deliberately free of random ids or timestamps, so this genuinely checks domain state, not
// incidental runtime fields.

describe('CreateMeasurement — single command round trip', () => {
  it('create → undo → exact initial → redo → exact mutated', () => {
    const initial = makeTestSurface([]); // empty layer, so the round trip is unambiguous
    const stack = new CommandStack();
    const cmd = createMeasurementCommand({
      surface: initial,
      layerId: 'layer1',
      measurementId: 'm1',
      shapeParams: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      identity: { name: 'Square', color: '#2E7D32' },
      provenance: 'Manual',
    });

    const mutated = stack.execute(cmd);
    expect(mutated).toEqual(makeTestSurface([makeSquareMeasurement('m1')]));

    const undone = stack.undo<Surface>();
    expect(undone).toEqual(initial); // domain equality — undo() returning the same reference is fine too

    const redone = stack.redo<Surface>();
    expect(redone).toEqual(mutated);
  });
});

// PO follow-up (UX review, item B6 "Ctrl+D duplicate", generalized for item A13 "multi-select
// bulk operations") — clones one or more Measurements offset by (dx, dy), re-validated through
// the same create() gate as any new shape, deliberately dropping parentId (a duplicate is never
// part of the source's Split group, INV-4) and vertexLabels (index-aligned to a shape the copy no
// longer shares editing history with). A single-id array is exactly the original Ctrl+D behavior.
describe('DuplicateMeasurements — command round trip', () => {
  it('single id: create → undo → exact initial → redo → exact mutated', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();
    const cmd = duplicateMeasurementsCommand({
      surface: initial,
      measurementIds: ['m1'],
      newMeasurementIds: ['m1-copy'],
      dx: 5,
      dy: 3,
    });

    const mutated = stack.execute(cmd);
    expect(mutated.layers[0]!.measurements).toHaveLength(2);
    const copy = findMeasurement(mutated, 'm1-copy')!.measurement;
    expect(copy.shape).toEqual({
      type: 'polygon',
      vertices: [{ x: 5, y: 3 }, { x: 15, y: 3 }, { x: 15, y: 13 }, { x: 5, y: 13 }],
    });
    expect(copy.identity).toEqual({ name: 'Square copy', color: '#2E7D32' });
    expect(copy.provenance).toBe('Manual');
    expect(copy.locked).toBe(false);
    expect(copy.parentId).toBeUndefined();
    // the original is untouched by producing a copy of it
    expect(findMeasurement(mutated, 'm1')!.measurement).toEqual(makeSquareMeasurement('m1'));

    const undone = stack.undo<Surface>();
    expect(undone).toEqual(initial);

    const redone = stack.redo<Surface>();
    expect(redone).toEqual(mutated);
  });

  it('multiple ids: every copy lands in one atomic undo step', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1'), makeSquareMeasurement('m2', 20)]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      duplicateMeasurementsCommand({
        surface: initial,
        measurementIds: ['m1', 'm2'],
        newMeasurementIds: ['m1-copy', 'm2-copy'],
        dx: 1,
        dy: 1,
      }),
    );

    expect(mutated.layers[0]!.measurements).toHaveLength(4);
    expect(findMeasurement(mutated, 'm1-copy')).not.toBeNull();
    expect(findMeasurement(mutated, 'm2-copy')).not.toBeNull();

    // one Ctrl+Z undoes BOTH copies at once, not one at a time
    expect(stack.undo<Surface>()).toEqual(initial);
  });

  it('drops parentId — a duplicate of a Split child is never part of that split group', () => {
    const child: Measurement = { ...makeSquareMeasurement('child1'), parentId: 'parent1' };
    const initial = makeTestSurface([child]);

    const mutated = duplicateMeasurementsCommand({
      surface: initial,
      measurementIds: ['child1'],
      newMeasurementIds: ['child1-copy'],
      dx: 0,
      dy: 0,
    }).do();

    expect(findMeasurement(mutated, 'child1-copy')!.measurement.parentId).toBeUndefined();
  });

  it('throws for a measurementId that does not exist on the Surface', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() =>
      duplicateMeasurementsCommand({ surface: initial, measurementIds: ['missing'], newMeasurementIds: ['x'], dx: 0, dy: 0 }),
    ).toThrow();
  });

  it('throws when measurementIds and newMeasurementIds lengths mismatch', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() =>
      duplicateMeasurementsCommand({ surface: initial, measurementIds: ['m1'], newMeasurementIds: [], dx: 0, dy: 0 }),
    ).toThrow();
  });
});

describe('UpdateIdentity — single command round trip', () => {
  it('create → undo → exact initial → redo → exact mutated', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();

    const cmd = updateIdentityCommand({
      surface: initial,
      measurementId: 'm1',
      identity: { name: 'Backyard', color: '#1565C0', note: 'Needs a fence' },
    });

    const mutated = stack.execute(cmd);
    expect(findMeasurement(mutated, 'm1')!.measurement.identity).toEqual({
      name: 'Backyard',
      color: '#1565C0',
      note: 'Needs a fence',
    });
    // rename/recolor never touches the Shape (18/14 §3 — Identity and Shape are independent VOs)
    expect(findMeasurement(mutated, 'm1')!.measurement.shape).toEqual(
      findMeasurement(initial, 'm1')!.measurement.shape,
    );

    const undone = stack.undo<Surface>();
    expect(undone).toEqual(initial);

    const redone = stack.redo<Surface>();
    expect(redone).toEqual(mutated);
  });

  it('hidden (item A5 visibility toggle) rides the same identity path, undoable', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();

    const hidden = stack.execute(
      updateIdentityCommand({
        surface: initial,
        measurementId: 'm1',
        identity: { ...findMeasurement(initial, 'm1')!.measurement.identity, hidden: true },
      }),
    );
    expect(findMeasurement(hidden, 'm1')!.measurement.identity.hidden).toBe(true);
    // a later rename must not silently resurrect visibility — the identity spread carries it
    const renamed = new CommandStack().execute(
      updateIdentityCommand({
        surface: hidden,
        measurementId: 'm1',
        identity: { ...findMeasurement(hidden, 'm1')!.measurement.identity, name: 'Renamed' },
      }),
    );
    expect(findMeasurement(renamed, 'm1')!.measurement.identity.hidden).toBe(true);

    expect(stack.undo<Surface>()).toEqual(initial);
  });
});

describe('EditVertex → CreateMeasurement — sequence of commands', () => {
  it('undoes a 2-command sequence back to the exact original, then redoes both', () => {
    const initial = makeTestSurface([]);
    const stack = new CommandStack();

    const afterCreate = stack.execute(
      createMeasurementCommand({
        surface: initial,
        layerId: 'layer1',
        measurementId: 'm1',
        shapeParams: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
        identity: { name: 'Square', color: '#2E7D32' },
        provenance: 'Manual',
      }),
    );

    const afterEdit = stack.execute(
      editVertexCommand({ surface: afterCreate, measurementId: 'm1', vertexIndex: 0, newPosition: { x: -5, y: -5 } }),
    );
    expect(findMeasurement(afterEdit, 'm1')!.measurement.shape).toEqual({
      type: 'polygon',
      vertices: [{ x: -5, y: -5 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    });

    expect(stack.undo<Surface>()).toEqual(afterCreate); // undo the edit
    expect(stack.undo<Surface>()).toEqual(initial); // undo the create — exact original
    expect(stack.canUndo()).toBe(false);

    expect(stack.redo<Surface>()).toEqual(afterCreate);
    expect(stack.redo<Surface>()).toEqual(afterEdit);
    expect(stack.canRedo()).toBe(false);
  });
});

describe('Split — undo/redo (PD-009)', () => {
  it('undo removes exactly the two children; redo restores them exactly; parent untouched throughout', () => {
    const lShapeMeasurement = {
      id: 'parcel',
      shape: {
        type: 'polygon' as const,
        vertices: [
          { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
        ],
      },
      identity: { name: 'Parcel', color: '#1565C0' },
      provenance: 'Manual' as const,
      locked: false,
    };
    const initial = makeTestSurface([lShapeMeasurement]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      splitCommand({
        surface: initial,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 1, y: -1 }, { x: 1, y: 5 }],
        childIds: ['partA', 'partB'],
      }),
    );

    expect(mutated.layers[0]!.measurements).toHaveLength(3); // parent + 2 children
    expect(findMeasurement(mutated, 'parcel')!.measurement).toEqual(lShapeMeasurement); // parent byte-identical
    expect(findMeasurement(mutated, 'partA')!.measurement.parentId).toBe('parcel');
    expect(findMeasurement(mutated, 'partB')!.measurement.parentId).toBe('parcel');

    const undone = stack.undo<Surface>();
    expect(undone).toEqual(initial); // exact initial — the parent-only state

    const redone = stack.redo<Surface>();
    expect(redone).toEqual(mutated);
  });

  it('manual path is unaffected: a sibling measurement drawn independently survives Split undo/redo untouched (PD-009 "допълнение, не замяна")', () => {
    const parcel = {
      id: 'parcel',
      shape: {
        type: 'polygon' as const,
        vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }],
      },
      identity: { name: 'Parcel', color: '#1565C0' },
      provenance: 'Manual' as const,
      locked: false,
    };
    const manuallyDrawnSibling = makeSquareMeasurement('sibling', 100);
    const initial = makeTestSurface([parcel, manuallyDrawnSibling]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      splitCommand({
        surface: initial,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 1, y: -1 }, { x: 1, y: 5 }],
        childIds: ['partA', 'partB'],
      }),
    );
    expect(findMeasurement(mutated, 'sibling')!.measurement).toEqual(manuallyDrawnSibling);

    stack.undo();
    const redone = stack.redo<Surface>()!;
    expect(findMeasurement(redone, 'sibling')!.measurement).toEqual(manuallyDrawnSibling);
  });
});

describe('CommitGhost — undo/redo, and the "same create path" invariant (PD-013/PD-018 §3)', () => {
  const ghostShape = {
    type: 'polygon' as const,
    vertices: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }],
  };

  it('commit → undo → exact initial → redo → exact mutated', () => {
    const initial = makeTestSurface([]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      commitGhostCommand({
        surface: initial,
        layerId: 'layer1',
        measurementId: 'aiRoof',
        ghostShape,
        identity: { name: 'Roof', color: '#7C5CFF' },
      }),
    );
    const committed = findMeasurement(mutated, 'aiRoof')!.measurement;
    expect(committed.provenance).toBe('AIGenerated'); // INV-6-style traceability, checked structurally below

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('produces a structurally identical Measurement to what manual CreateMeasurement would, differing only in provenance', () => {
    const initial = makeTestSurface([]);

    const viaGhost = commitGhostCommand({
      surface: initial,
      layerId: 'layer1',
      measurementId: 'x',
      ghostShape,
      identity: { name: 'Roof', color: '#7C5CFF' },
    }).do();

    const viaManual = createMeasurementCommand({
      surface: initial,
      layerId: 'layer1',
      measurementId: 'x',
      shapeParams: { type: 'polygon', vertices: ghostShape.vertices },
      identity: { name: 'Roof', color: '#7C5CFF' },
      provenance: 'Manual',
    }).do();

    const ghostResult = findMeasurement(viaGhost, 'x')!.measurement;
    const manualResult = findMeasurement(viaManual, 'x')!.measurement;

    expect(ghostResult.shape).toEqual(manualResult.shape);
    expect(ghostResult.identity).toEqual(manualResult.identity);
    expect(ghostResult.provenance).toBe('AIGenerated');
    expect(manualResult.provenance).toBe('Manual');
    // the only structural difference between an AI-committed and a manually-drawn Measurement
    // is this one field — everything else (shape validation path, identity shape, locked flag)
    // is identical because commitGhostCommand literally delegates to createMeasurementCommand.
  });

  it('rejects a self-intersecting ghost exactly as it would reject a self-intersecting manual polygon', () => {
    const initial = makeTestSurface([]);
    const bowtieShape = {
      type: 'polygon' as const,
      vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    };
    expect(() =>
      commitGhostCommand({
        surface: initial,
        layerId: 'layer1',
        measurementId: 'bad',
        ghostShape: bowtieShape,
        identity: { name: 'Bad', color: '#000' },
      }).do(),
    ).toThrow();
  });
});

describe('DeleteMeasurements — parent/child cascade (11 §4)', () => {
  it('deleting a split parent cascades to both children in one undoable action', () => {
    const parent = makeSquareMeasurement('parent');
    const childA = { ...makeSquareMeasurement('childA'), parentId: 'parent' };
    const childB = { ...makeSquareMeasurement('childB', 20), parentId: 'parent' };
    const initial = makeTestSurface([parent, childA, childB]);
    const stack = new CommandStack();

    const mutated = stack.execute(deleteMeasurementsCommand({ surface: initial, measurementIds: ['parent'] }));
    expect(mutated.layers[0]!.measurements).toHaveLength(0); // parent AND both children gone

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('deleting one split child dissolves the group for the sibling, leaves the parent intact', () => {
    const parent = makeSquareMeasurement('parent');
    const childA = { ...makeSquareMeasurement('childA'), parentId: 'parent' };
    const childB = { ...makeSquareMeasurement('childB', 20), parentId: 'parent' };
    const initial = makeTestSurface([parent, childA, childB]);
    const stack = new CommandStack();

    const mutated = stack.execute(deleteMeasurementsCommand({ surface: initial, measurementIds: ['childA'] }));
    const remaining = mutated.layers[0]!.measurements;
    expect(remaining.map((m) => m.id).sort()).toEqual(['childB', 'parent']);
    const survivingSibling = remaining.find((m) => m.id === 'childB')!;
    expect(survivingSibling.parentId).toBeUndefined(); // group dissolved
    const survivingParent = remaining.find((m) => m.id === 'parent')!;
    expect(survivingParent).toEqual(parent); // untouched

    expect(stack.undo<Surface>()).toEqual(initial);
  });
});

// PO follow-up (UX review, item A13 "multi-select bulk operations") — the array param above is
// exactly what a Delete keypress with several Measurements selected passes; these tests exercise
// the genuinely multi-id paths (plain batch, and a batch that includes a split parent AND one of
// its own children, which must not double-remove or throw on the already-cascaded child).
describe('DeleteMeasurements — genuinely multi-id batches', () => {
  it('deletes an unrelated batch of plain measurements in one atomic undo step', () => {
    const a = makeSquareMeasurement('a');
    const b = makeSquareMeasurement('b', 20);
    const c = makeSquareMeasurement('c', 40);
    const initial = makeTestSurface([a, b, c]);
    const stack = new CommandStack();

    const mutated = stack.execute(deleteMeasurementsCommand({ surface: initial, measurementIds: ['a', 'c'] }));
    expect(mutated.layers[0]!.measurements.map((m) => m.id)).toEqual(['b']);

    expect(stack.undo<Surface>()).toEqual(initial); // one Ctrl+Z restores BOTH
  });

  it('a batch containing a split parent AND one of its own children removes everything exactly once', () => {
    const parent = makeSquareMeasurement('parent');
    const childA = { ...makeSquareMeasurement('childA'), parentId: 'parent' };
    const childB = { ...makeSquareMeasurement('childB', 20), parentId: 'parent' };
    const initial = makeTestSurface([parent, childA, childB]);

    // 'parent' is listed first, so its own cascade already removes 'childA' before the batch
    // reaches 'childA' as its own listed id — must not throw "not found" or double-process it.
    const mutated = deleteMeasurementsCommand({ surface: initial, measurementIds: ['parent', 'childA'] }).do();
    expect(mutated.layers[0]!.measurements).toHaveLength(0);
  });

  it('ignores a duplicated id in the batch rather than throwing on its second occurrence', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const mutated = deleteMeasurementsCommand({ surface: initial, measurementIds: ['m1', 'm1'] }).do();
    expect(mutated.layers[0]!.measurements).toHaveLength(0);
  });

  it('throws for a measurementId that does not exist on the Surface', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() => deleteMeasurementsCommand({ surface: initial, measurementIds: ['missing'] })).toThrow();
  });
});

describe('Recalibrate — round trip', () => {
  it('replaces the Calibration value; undo/redo exact', () => {
    const initial = makeTestSurface();
    const stack = new CommandStack();
    const newCalibration = { kind: 'linear' as const, metersPerPixel: 0.05 };

    const mutated = stack.execute(recalibrateCommand({ surface: initial, newCalibration }));
    expect(mutated.calibration).toEqual(newCalibration);
    expect(mutated.layers).toEqual(initial.layers); // no Shape touched (INV-3 discussion, recalibrate.ts)

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });
});

describe('ReorderMeasurements — Layers panel drag-to-reorder round trip', () => {
  it('front-to-back UI order reverses into the raw draw order; undo/redo exact', () => {
    const a = makeSquareMeasurement('a', 0);
    const b = makeSquareMeasurement('b', 20);
    const c = makeSquareMeasurement('c', 40);
    const initial = makeTestSurface([a, b, c]); // raw order a, b, c — c currently drawn last (on top)
    const stack = new CommandStack();

    // User drags 'a' to the very top of the panel (front-most) — new panel order: a, c, b.
    const mutated = stack.execute(
      reorderMeasurementsCommand({ surface: initial, orderedIdsFrontToBack: ['a', 'c', 'b'] }),
    );
    // Reversed into raw draw order: b, c, a — 'a' is now drawn last (on top), matching the drag.
    expect(mutated.layers[0]!.measurements.map((m) => m.id)).toEqual(['b', 'c', 'a']);

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('only reorders measurements within their own layer', () => {
    const a = makeSquareMeasurement('a', 0);
    const b = makeSquareMeasurement('b', 20);
    const layer1 = { id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [a, b] };
    const c = makeSquareMeasurement('c', 40);
    const layer2 = { id: 'layer2', name: 'Second', visible: true, order: 1, measurements: [c] };
    const initial = { id: 'surface1', kind: 'image' as const, calibration: null, layers: [layer1, layer2] };
    const stack = new CommandStack();

    const mutated = stack.execute(
      reorderMeasurementsCommand({ surface: initial, orderedIdsFrontToBack: ['c', 'a', 'b'] }),
    );
    expect(mutated.layers[0]!.measurements.map((m) => m.id)).toEqual(['b', 'a']);
    expect(mutated.layers[1]!.measurements.map((m) => m.id)).toEqual(['c']);
  });
});

describe('ResizeImage — round trip', () => {
  it('sets imageRect; undo/redo exact', () => {
    const initial = { ...makeTestSurface([]), kind: 'image' as const };
    const stack = new CommandStack();

    const mutated = stack.execute(
      resizeImageCommand({ surface: initial, origin: { x: 10, y: 20 }, width: 300, height: 150 }),
    );
    expect(mutated.imageRect).toEqual({ origin: { x: 10, y: 20 }, width: 300, height: 150 });
    expect(initial.imageRect).toBeUndefined(); // undo target untouched

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('rejects a non-positive width/height and leaves the Surface untouched', () => {
    const initial = { ...makeTestSurface([]), kind: 'image' as const };
    const stack = new CommandStack();

    expect(() =>
      stack.execute(resizeImageCommand({ surface: initial, origin: { x: 0, y: 0 }, width: 0, height: 50 })),
    ).toThrow();
    expect(stack.canUndo()).toBe(false);
  });
});

describe('SetImageLocked — round trip', () => {
  it('sets imageLocked; undo/redo exact', () => {
    const initial = { ...makeTestSurface([]), kind: 'image' as const };
    const stack = new CommandStack();

    const mutated = stack.execute(setImageLockedCommand({ surface: initial, locked: false }));
    expect(mutated.imageLocked).toBe(false);
    expect(initial.imageLocked).toBeUndefined();

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });
});

describe('SetVertexLabel — round trip', () => {
  it('sets a label at an index; undo/redo exact', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      setVertexLabelCommand({ surface: initial, measurementId: 'm1', vertexIndex: 2, label: { text: 'A', color: '#1565C0' } }),
    );
    expect(findMeasurement(mutated, 'm1')!.measurement.vertexLabels).toEqual([null, null, { text: 'A', color: '#1565C0' }]);
    expect(findMeasurement(initial, 'm1')!.measurement.vertexLabels).toBeUndefined();

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('clearing a label (label: null) trims a trailing gap back to undefined', () => {
    const withLabel = { ...makeSquareMeasurement('m1'), vertexLabels: [{ text: 'A', color: '#1565C0' }] };
    const initial = makeTestSurface([withLabel]);
    const stack = new CommandStack();

    const mutated = stack.execute(setVertexLabelCommand({ surface: initial, measurementId: 'm1', vertexIndex: 0, label: null }));
    expect(findMeasurement(mutated, 'm1')!.measurement.vertexLabels).toBeUndefined();
  });
});

describe('ResizeRectangleDimensions — round trip', () => {
  const rectMeasurement: Measurement = {
    id: 'm1',
    shape: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 100, height: 50, rotation: 0 },
    identity: { name: 'Rect', color: '#2E7D32' },
    provenance: 'Manual',
    locked: false,
  };

  it('sets an exact width/height, keeping the origin fixed; undo/redo exact', () => {
    const initial = makeTestSurface([rectMeasurement]);
    const stack = new CommandStack();

    const mutated = stack.execute(resizeRectangleDimensionsCommand({ surface: initial, measurementId: 'm1', width: 120, height: 60 }));
    expect(findMeasurement(mutated, 'm1')!.measurement.shape).toEqual({
      type: 'rectangle',
      origin: { x: 0, y: 0 },
      width: 120,
      height: 60,
      rotation: 0,
    });
    expect(findMeasurement(initial, 'm1')!.measurement.shape).toEqual(rectMeasurement.shape);

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('throws for a non-positive width/height — command never pushed', () => {
    const initial = makeTestSurface([rectMeasurement]);
    expect(() => resizeRectangleDimensionsCommand({ surface: initial, measurementId: 'm1', width: 0, height: 60 }).do()).toThrow();
  });

  it('throws for a measurement that is not a rectangle', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() => resizeRectangleDimensionsCommand({ surface: initial, measurementId: 'm1', width: 10, height: 10 })).toThrow();
  });
});

describe('ResizeCircleToRadius — round trip', () => {
  const circleMeasurement: Measurement = {
    id: 'm1',
    shape: { type: 'circle', center: { x: 50, y: 50 }, radius: 20 },
    identity: { name: 'Circle', color: '#1565C0' },
    provenance: 'Manual',
    locked: false,
  };

  it('sets an exact radius, keeping the center fixed; undo/redo exact', () => {
    const initial = makeTestSurface([circleMeasurement]);
    const stack = new CommandStack();

    const mutated = stack.execute(resizeCircleToRadiusCommand({ surface: initial, measurementId: 'm1', radius: 35 }));
    expect(findMeasurement(mutated, 'm1')!.measurement.shape).toEqual({ type: 'circle', center: { x: 50, y: 50 }, radius: 35 });
    expect(findMeasurement(initial, 'm1')!.measurement.shape).toEqual(circleMeasurement.shape);

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('throws for a non-positive radius — command never pushed', () => {
    const initial = makeTestSurface([circleMeasurement]);
    expect(() => resizeCircleToRadiusCommand({ surface: initial, measurementId: 'm1', radius: 0 }).do()).toThrow();
  });

  it('throws for a measurement that is not a circle', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() => resizeCircleToRadiusCommand({ surface: initial, measurementId: 'm1', radius: 10 })).toThrow();
  });
});

describe('SetMeasurementLocked — round trip', () => {
  it('locks a measurement; undo/redo exact', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();

    const mutated = stack.execute(setMeasurementLockedCommand({ surface: initial, measurementId: 'm1', locked: true }));
    expect(findMeasurement(mutated, 'm1')!.measurement.locked).toBe(true);
    expect(findMeasurement(initial, 'm1')!.measurement.locked).toBe(false);

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('throws for a measurement that does not exist', () => {
    const initial = makeTestSurface([]);
    expect(() => setMeasurementLockedCommand({ surface: initial, measurementId: 'missing', locked: true })).toThrow();
  });
});

describe('AddVertex — shifts existing vertex labels to stay attached to the same vertex', () => {
  it('a label at/after the insertion point shifts up by one; the new vertex is unlabeled', () => {
    const square = {
      ...makeSquareMeasurement('m1'),
      vertexLabels: [{ text: 'A', color: '#1565C0' }, { text: 'B', color: '#E65100' }],
    };
    const initial = makeTestSurface([square]);
    const stack = new CommandStack();

    // makeSquareMeasurement's polygon is (0,0)-(10,0)-(10,10)-(0,10); insert on edge 0 (between
    // vertex 0 and 1) at the edge's midpoint.
    const mutated = stack.execute(
      addVertexCommand({ surface: initial, measurementId: 'm1', edgeIndex: 0, position: { x: 5, y: 0 } }),
    );
    // new vertex lands at index 1 -> old index-1 label ('B') shifts to index 2; index-0 ('A') untouched.
    expect(findMeasurement(mutated, 'm1')!.measurement.vertexLabels).toEqual([
      { text: 'A', color: '#1565C0' },
      null,
      { text: 'B', color: '#E65100' },
    ]);

    expect(stack.undo<Surface>()).toEqual(initial);
  });
});

describe('RemoveVertex — discards the removed vertex\'s label and shifts the rest down', () => {
  it('removing a labeled vertex drops its label; later labels shift down', () => {
    const pentagon = {
      id: 'm1',
      shape: {
        type: 'polygon' as const,
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 15 }, { x: 0, y: 10 }],
      },
      identity: { name: 'Pentagon', color: '#2E7D32' },
      provenance: 'Manual' as const,
      locked: false,
      vertexLabels: [
        { text: 'A', color: '#1565C0' },
        { text: 'B', color: '#E65100' },
        { text: 'C', color: '#6A1B9A' },
        null,
        { text: 'E', color: '#00838F' },
      ],
    };
    const initial = makeTestSurface([pentagon]);
    const stack = new CommandStack();

    const mutated = stack.execute(removeVertexCommand({ surface: initial, measurementId: 'm1', vertexIndex: 1 }));
    expect(findMeasurement(mutated, 'm1')!.measurement.vertexLabels).toEqual([
      { text: 'A', color: '#1565C0' },
      { text: 'C', color: '#6A1B9A' },
      null,
      { text: 'E', color: '#00838F' },
    ]);

    expect(stack.undo<Surface>()).toEqual(initial);
  });
});

describe('Validation error → state unchanged (22 §3, "команда с validation error да не променя state")', () => {
  it('removeVertex down to <3 vertices throws and leaves the Surface byte-identical', () => {
    const triangle = {
      id: 'tri',
      shape: { type: 'polygon' as const, vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
      identity: { name: 'Triangle', color: '#000' },
      provenance: 'Manual' as const,
      locked: false,
    };
    const initial = makeTestSurface([triangle]);
    const stack = new CommandStack();

    expect(() => stack.execute(removeVertexCommand({ surface: initial, measurementId: 'tri', vertexIndex: 0 }))).toThrow();

    expect(stack.canUndo()).toBe(false);
    expect(findMeasurement(initial, 'tri')!.measurement).toEqual(triangle); // untouched
  });
});

describe('Failed command → stack не се замърсява (self-intersection case)', () => {
  it('an editVertex that would self-intersect the polygon throws and the stack is untouched', () => {
    const square = makeSquareMeasurement('sq');
    const initial = makeTestSurface([square]);
    const stack = new CommandStack();
    stack.execute(recalibrateCommand({ surface: initial, newCalibration: null })); // one legitimate prior command
    const depthBefore = stack.undoDepth;

    expect(() =>
      stack.execute(editVertexCommand({ surface: initial, measurementId: 'sq', vertexIndex: 0, newPosition: { x: 15, y: 5 } })),
    ).toThrow();

    expect(stack.undoDepth).toBe(depthBefore); // the failed command never entered the stack
  });
});

// entities.ts's own contract for `locked`: move/resize/vertex-edit/delete/split are all refused
// while true. Previously enforced only by the UI layer's own pre-checks (studioSession.ts,
// vertexEditSession.ts, splitSession.ts) — these confirm the Application-layer commands
// themselves now refuse too, so a caller that dispatches a command directly (bypassing the UI
// session entirely) can't silently violate the lock.
describe('Locked measurement refuses geometry-mutating commands', () => {
  const lockedSquare: Measurement = { ...makeSquareMeasurement('m1'), locked: true };
  const lockedRect: Measurement = {
    id: 'm1',
    shape: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 100, height: 50, rotation: 0 },
    identity: { name: 'Rect', color: '#2E7D32' },
    provenance: 'Manual',
    locked: true,
  };
  const lockedCircle: Measurement = {
    id: 'm1',
    shape: { type: 'circle', center: { x: 50, y: 50 }, radius: 20 },
    identity: { name: 'Circle', color: '#1565C0' },
    provenance: 'Manual',
    locked: true,
  };

  it('refuses delete', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() => deleteMeasurementsCommand({ surface: initial, measurementIds: ['m1'] })).toThrow();
  });

  it('refuses split (manual line-draw)', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() =>
      splitCommand({
        surface: initial,
        parentMeasurementId: 'm1',
        splitLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        childIds: ['c1', 'c2'],
      }),
    ).toThrow();
  });

  it('refuses split-into-parts', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() =>
      splitIntoPartsCommand({
        surface: initial,
        parentMeasurementId: 'm1',
        childShapes: [
          { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
        ],
        childIds: ['c1', 'c2'],
      }),
    ).toThrow();
  });

  it('refuses addVertex', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() => addVertexCommand({ surface: initial, measurementId: 'm1', edgeIndex: 0, position: { x: 5, y: 0 } })).toThrow();
  });

  it('refuses removeVertex', () => {
    const pentagon: Measurement = {
      ...lockedSquare,
      shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    };
    const initial = makeTestSurface([pentagon]);
    expect(() => removeVertexCommand({ surface: initial, measurementId: 'm1', vertexIndex: 0 })).toThrow();
  });

  it('refuses editVertex', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() => editVertexCommand({ surface: initial, measurementId: 'm1', vertexIndex: 0, newPosition: { x: 1, y: 1 } })).toThrow();
  });

  it('refuses translateMeasurement (whole-shape move)', () => {
    const initial = makeTestSurface([lockedSquare]);
    expect(() => translateMeasurementCommand({ surface: initial, measurementId: 'm1', dx: 5, dy: 5 })).toThrow();
  });

  it('refuses resizeRectangle (drag)', () => {
    const initial = makeTestSurface([lockedRect]);
    expect(() => resizeRectangleCommand({ surface: initial, measurementId: 'm1', corner: 2, newPosition: { x: 120, y: 60 } })).toThrow();
  });

  it('refuses resizeRectangleDimensions (typed input)', () => {
    const initial = makeTestSurface([lockedRect]);
    expect(() => resizeRectangleDimensionsCommand({ surface: initial, measurementId: 'm1', width: 120, height: 60 })).toThrow();
  });

  it('refuses resizeCircle (drag)', () => {
    const initial = makeTestSurface([lockedCircle]);
    expect(() => resizeCircleCommand({ surface: initial, measurementId: 'm1', newEdgePosition: { x: 85, y: 50 } })).toThrow();
  });

  it('refuses resizeCircleToRadius (typed input)', () => {
    const initial = makeTestSurface([lockedCircle]);
    expect(() => resizeCircleToRadiusCommand({ surface: initial, measurementId: 'm1', radius: 35 })).toThrow();
  });

  it('does NOT refuse allowed edits — identity, manual area, vertex label, label offset, duplicate', () => {
    // entities.ts's own doc: locked only blocks move/resize/vertex-edit/delete/split. These stay
    // usable so a locked Measurement is still fully renameable/annotatable/duplicable.
    const initial = makeTestSurface([lockedSquare]);
    expect(() => updateIdentityCommand({ surface: initial, measurementId: 'm1', identity: { ...lockedSquare.identity, name: 'Renamed' } })).not.toThrow();
    expect(() => setVertexLabelCommand({ surface: initial, measurementId: 'm1', vertexIndex: 0, label: { text: 'A', color: '#000' } })).not.toThrow();
    expect(() =>
      duplicateMeasurementsCommand({ surface: initial, measurementIds: ['m1'], newMeasurementIds: ['m1-copy'], dx: 5, dy: 5 }),
    ).not.toThrow();
  });
});
