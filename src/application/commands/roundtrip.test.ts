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
import { setLabelOffsetCommand } from './setLabelOffset.js';
import { setManualAreaCommand } from './setManualArea.js';
import { makeSquareMeasurement, makeTestSurface } from './testFixtures.js';
import { childrenOf, findMeasurement } from '../surfaceOps.js';
import { shoelaceArea } from '../../core/measurement/formulas.js';
import { isSimplePolygon } from '../../core/drawing/geometry.js';
import type { Measurement, Surface } from '../../core/domain/entities.js';
import fc from 'fast-check';

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

describe('SetLabelOffset — round trip', () => {
  it('sets a label offset; undo/redo exact', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    const stack = new CommandStack();

    const mutated = stack.execute(setLabelOffsetCommand({ surface: initial, measurementId: 'm1', dx: 3, dy: -4 }));
    expect(findMeasurement(mutated, 'm1')!.measurement.labelOffset).toEqual({ dx: 3, dy: -4 });
    expect(findMeasurement(initial, 'm1')!.measurement.labelOffset).toBeUndefined();

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('overwrites a previous offset rather than accumulating it', () => {
    const initial = makeTestSurface([{ ...makeSquareMeasurement('m1'), labelOffset: { dx: 1, dy: 1 } }]);
    const mutated = setLabelOffsetCommand({ surface: initial, measurementId: 'm1', dx: 9, dy: 9 }).do();
    expect(findMeasurement(mutated, 'm1')!.measurement.labelOffset).toEqual({ dx: 9, dy: 9 });
  });

  it('throws for a measurement that does not exist', () => {
    const initial = makeTestSurface([]);
    expect(() => setLabelOffsetCommand({ surface: initial, measurementId: 'missing', dx: 1, dy: 1 })).toThrow();
  });
});

describe('SetManualArea — round trip', () => {
  it('derives a squareMetersPerSquarePixel factor from the current geometric area; undo/redo exact', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]); // 10x10 square, 100 px²
    const stack = new CommandStack();

    const mutated = stack.execute(setManualAreaCommand({ surface: initial, measurementId: 'm1', manualAreaM2: 1200 }));
    const manualArea = findMeasurement(mutated, 'm1')!.measurement.manualArea;
    expect(manualArea).toBeDefined();
    expect(manualArea!.squareMetersPerSquarePixel).toBeCloseTo(12, 8); // 1200 / 100px²
    expect(findMeasurement(initial, 'm1')!.measurement.manualArea).toBeUndefined();

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('clearing with null removes the field entirely, not just sets it to undefined', () => {
    const withManualArea = { ...makeSquareMeasurement('m1'), manualArea: { squareMetersPerSquarePixel: 12 } };
    const initial = makeTestSurface([withManualArea]);
    const mutated = setManualAreaCommand({ surface: initial, measurementId: 'm1', manualAreaM2: null }).do();
    expect('manualArea' in findMeasurement(mutated, 'm1')!.measurement).toBe(false);
  });

  it('throws for a non-positive manualAreaM2', () => {
    const initial = makeTestSurface([makeSquareMeasurement('m1')]);
    expect(() => setManualAreaCommand({ surface: initial, measurementId: 'm1', manualAreaM2: 0 })).toThrow();
    expect(() => setManualAreaCommand({ surface: initial, measurementId: 'm1', manualAreaM2: -5 })).toThrow();
  });

  it('throws for a non-polygon measurement', () => {
    const circle: Measurement = {
      id: 'm1',
      shape: { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
      identity: { name: 'Circle', color: '#000' },
      provenance: 'Manual',
      locked: false,
    };
    const initial = makeTestSurface([circle]);
    expect(() => setManualAreaCommand({ surface: initial, measurementId: 'm1', manualAreaM2: 100 })).toThrow();
  });

  it('throws for a measurement that does not exist', () => {
    const initial = makeTestSurface([]);
    expect(() => setManualAreaCommand({ surface: initial, measurementId: 'missing', manualAreaM2: 100 })).toThrow();
  });
});

describe('SplitIntoParts — round trip', () => {
  it('adds N children referencing the parent, parent untouched; undo/redo exact', () => {
    const parent = makeSquareMeasurement('parent'); // 0..10 square
    const initial = makeTestSurface([parent]);
    const stack = new CommandStack();

    const mutated = stack.execute(
      splitIntoPartsCommand({
        surface: initial,
        parentMeasurementId: 'parent',
        childShapes: [
          { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
        ],
        childIds: ['c1', 'c2'],
      }),
    );
    const ids = mutated.layers[0]!.measurements.map((m) => m.id).sort();
    expect(ids).toEqual(['c1', 'c2', 'parent']);
    expect(findMeasurement(mutated, 'c1')!.measurement.parentId).toBe('parent');
    expect(findMeasurement(mutated, 'c2')!.measurement.parentId).toBe('parent');
    expect(findMeasurement(mutated, 'parent')!.measurement).toEqual(parent); // untouched, PD-009

    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(mutated);
  });

  it('inherits the parent manualArea scale factor onto every child', () => {
    const parent = { ...makeSquareMeasurement('parent'), manualArea: { squareMetersPerSquarePixel: 12 } };
    const initial = makeTestSurface([parent]);

    const mutated = splitIntoPartsCommand({
      surface: initial,
      parentMeasurementId: 'parent',
      childShapes: [
        { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }] },
        { type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 10 }] },
      ],
      childIds: ['c1', 'c2'],
    }).do();
    expect(findMeasurement(mutated, 'c1')!.measurement.manualArea).toEqual({ squareMetersPerSquarePixel: 12 });
    expect(findMeasurement(mutated, 'c2')!.measurement.manualArea).toEqual({ squareMetersPerSquarePixel: 12 });
  });

  it('throws for fewer than 2 child shapes', () => {
    const initial = makeTestSurface([makeSquareMeasurement('parent')]);
    expect(() =>
      splitIntoPartsCommand({
        surface: initial,
        parentMeasurementId: 'parent',
        childShapes: [{ type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }],
        childIds: ['c1'],
      }),
    ).toThrow();
  });

  it('throws for a mismatched childShapes/childIds length', () => {
    const initial = makeTestSurface([makeSquareMeasurement('parent')]);
    expect(() =>
      splitIntoPartsCommand({
        surface: initial,
        parentMeasurementId: 'parent',
        childShapes: [
          { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
        ],
        childIds: ['c1'],
      }),
    ).toThrow();
  });

  it('throws for a non-polygon parent', () => {
    const circle: Measurement = {
      id: 'parent',
      shape: { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
      identity: { name: 'Circle', color: '#000' },
      provenance: 'Manual',
      locked: false,
    };
    const initial = makeTestSurface([circle]);
    expect(() =>
      splitIntoPartsCommand({
        surface: initial,
        parentMeasurementId: 'parent',
        childShapes: [
          { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
        ],
        childIds: ['c1', 'c2'],
      }),
    ).toThrow();
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

// PD-021 — Manual Area след Split: запазена сума (Live Rebalancing). T-INV-15.
// The parts of a split parcel divide a fixed total: reshaping one part redistributes area between
// the parts rather than inflating the group's sum. The conserved total is the parent's own area
// (PD-009 keeps the parent alive and untouched by child edits), so these tests assert the property
// the user actually cares about — "the parts still add up to the area I typed in" — rather than any
// particular internal factor value.
describe('PD-021 — Split group conserves the parent manual area', () => {
  // 20x10 rectangle = 200 px²; a manual area of 1200 m² makes the parent's factor 6 m²/px².
  const TOTAL_M2 = 1200;

  function parcel(): Measurement {
    return {
      id: 'parcel',
      shape: {
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
      },
      identity: { name: 'Parcel', color: '#2E7D32' },
      provenance: 'Manual',
      locked: false,
    };
  }

  function polygonVertices(measurement: Measurement): readonly { x: number; y: number }[] {
    if (measurement.shape.type !== 'polygon') throw new Error('expected a polygon');
    return measurement.shape.vertices;
  }

  /** The area this Measurement actually displays: live geometric px² through its own stored
   * factor — the same arithmetic the UI's display helper performs, expressed here without
   * reaching across the layer boundary into it. */
  function displayedArea(measurement: Measurement): number {
    return shoelaceArea(polygonVertices(measurement)) * (measurement.manualArea?.squareMetersPerSquarePixel ?? 0);
  }

  function groupSum(surface: Surface, parentId: string): number {
    return childrenOf(surface, parentId).reduce((sum, child) => sum + displayedArea(child), 0);
  }

  /** Index of the vertex at (x, y) — found by coordinate rather than assumed position, so these
   * tests don't depend on the order the split algorithm happens to emit vertices in. */
  function vertexIndexAt(measurement: Measurement, x: number, y: number): number {
    const index = polygonVertices(measurement).findIndex((v) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.y - y) < 1e-9);
    if (index < 0) throw new Error(`no vertex at (${x}, ${y})`);
    return index;
  }

  /** manual area set → split down the middle into two 10x10 halves. */
  function splitParcel(stack: CommandStack): Surface {
    const withTotal = stack.execute<Surface>(
      setManualAreaCommand({ surface: makeTestSurface([parcel()]), measurementId: 'parcel', manualAreaM2: TOTAL_M2 }),
    );
    return stack.execute<Surface>(
      splitCommand({
        surface: withTotal,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 10, y: -1 }, { x: 10, y: 11 }],
        childIds: ['partA', 'partB'],
      }),
    );
  }

  it('already sums to the entered total at the moment of the split', () => {
    const afterSplit = splitParcel(new CommandStack());
    expect(groupSum(afterSplit, 'parcel')).toBeCloseTo(TOTAL_M2, 6);
  });

  it('still sums to the entered total after a child vertex edit moves the dividing boundary', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);

    // Drag partA's two boundary vertices from x=10 out to x=14: partA grows, partB is untouched,
    // so the group's *geometric* area no longer equals the parent's. The displayed areas must
    // still divide the same 1200 m².
    const partA = findMeasurement(afterSplit, 'partA')!.measurement;
    const afterFirst = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'partA',
        vertexIndex: vertexIndexAt(partA, 10, 0),
        newPosition: { x: 14, y: 0 },
      }),
    );
    const afterSecond = stack.execute<Surface>(
      editVertexCommand({
        surface: afterFirst,
        measurementId: 'partA',
        vertexIndex: vertexIndexAt(findMeasurement(afterFirst, 'partA')!.measurement, 10, 10),
        newPosition: { x: 14, y: 10 },
      }),
    );

    expect(groupSum(afterSecond, 'parcel')).toBeCloseTo(TOTAL_M2, 6);

    // and the redistribution went the way the geometry says it should — whichever part is now
    // geometrically larger holds the larger share of the total (which part the split algorithm
    // named 'partA' is its own business, so this asserts the property, not the naming)
    const [smaller, larger] = [findMeasurement(afterSecond, 'partA')!.measurement, findMeasurement(afterSecond, 'partB')!.measurement].sort(
      (a, b) => shoelaceArea(polygonVertices(a)) - shoelaceArea(polygonVertices(b)),
    );
    expect(displayedArea(larger!)).toBeGreaterThan(displayedArea(smaller!));
  });

  it('leaves the parent parcel own area untouched while its parts are reshaped', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);
    const parentBefore = findMeasurement(afterSplit, 'parcel')!.measurement;

    const partA = findMeasurement(afterSplit, 'partA')!.measurement;
    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'partA',
        vertexIndex: vertexIndexAt(partA, 10, 0),
        newPosition: { x: 14, y: 0 },
      }),
    );

    expect(findMeasurement(edited, 'parcel')!.measurement).toEqual(parentBefore);
    expect(displayedArea(findMeasurement(edited, 'parcel')!.measurement)).toBeCloseTo(TOTAL_M2, 6);
  });

  it('conserves the total across an N-way Split-into-parts too', () => {
    const stack = new CommandStack();
    const withTotal = stack.execute<Surface>(
      setManualAreaCommand({ surface: makeTestSurface([parcel()]), measurementId: 'parcel', manualAreaM2: TOTAL_M2 }),
    );
    const afterSplit = stack.execute<Surface>(
      splitIntoPartsCommand({
        surface: withTotal,
        parentMeasurementId: 'parcel',
        childShapes: [
          { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10 }, { x: 0, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 6, y: 0 }, { x: 13, y: 0 }, { x: 13, y: 10 }, { x: 6, y: 10 }] },
          { type: 'polygon', vertices: [{ x: 13, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 13, y: 10 }] },
        ],
        childIds: ['p1', 'p2', 'p3'],
      }),
    );

    const p2 = findMeasurement(afterSplit, 'p2')!.measurement;
    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'p2',
        vertexIndex: vertexIndexAt(p2, 13, 0),
        newPosition: { x: 17, y: 0 },
      }),
    );

    expect(groupSum(edited, 'parcel')).toBeCloseTo(TOTAL_M2, 6);
  });

  it('rebalances on vertex insertion and on vertex removal, not just on a drag', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);

    const added = stack.execute<Surface>(
      addVertexCommand({ surface: afterSplit, measurementId: 'partA', edgeIndex: 0, position: { x: 5, y: -4 } }),
    );
    expect(groupSum(added, 'parcel')).toBeCloseTo(TOTAL_M2, 6);

    const removed = stack.execute<Surface>(
      removeVertexCommand({ surface: added, measurementId: 'partA', vertexIndex: 1 }),
    );
    expect(groupSum(removed, 'parcel')).toBeCloseTo(TOTAL_M2, 6);
  });

  it('does not drift across many successive edits', () => {
    const stack = new CommandStack();
    let surface = splitParcel(stack);

    for (const x of [12, 14, 16, 9, 11, 13]) {
      const partA = findMeasurement(surface, 'partA')!.measurement;
      const index = polygonVertices(partA).findIndex((v) => v.y === 0 && v.x > 5);
      surface = stack.execute<Surface>(
        editVertexCommand({ surface, measurementId: 'partA', vertexIndex: index, newPosition: { x, y: 0 } }),
      );
      expect(groupSum(surface, 'parcel')).toBeCloseTo(TOTAL_M2, 6);
    }
  });

  it('undo restores every part area exactly, and redo puts the rebalanced areas back', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);
    const partA = findMeasurement(afterSplit, 'partA')!.measurement;

    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'partA',
        vertexIndex: vertexIndexAt(partA, 10, 0),
        newPosition: { x: 14, y: 0 },
      }),
    );

    // whole-Surface snapshot: the sibling's rebalanced factor is restored with everything else
    expect(stack.undo<Surface>()).toEqual(afterSplit);
    expect(stack.redo<Surface>()).toEqual(edited);
  });

  it('conserves at both levels when a part is itself split', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);

    // partA (10x10, 600 m²) split again down its own middle — line derived from partA's actual
    // bounds rather than assuming which half of the parcel the split algorithm made it
    const xs = polygonVertices(findMeasurement(afterSplit, 'partA')!.measurement).map((v) => v.x);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const nested = stack.execute<Surface>(
      splitCommand({
        surface: afterSplit,
        parentMeasurementId: 'partA',
        splitLine: [{ x: midX, y: -1 }, { x: midX, y: 11 }],
        childIds: ['a1', 'a2'],
      }),
    );
    expect(groupSum(nested, 'partA')).toBeCloseTo(displayedArea(findMeasurement(nested, 'partA')!.measurement), 6);

    // reshaping a sub-part conserves partA's area and leaves the outer group alone
    const a1 = findMeasurement(nested, 'a1')!.measurement;
    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: nested,
        measurementId: 'a1',
        vertexIndex: vertexIndexAt(a1, midX, 0),
        newPosition: { x: midX + 2, y: 0 },
      }),
    );
    expect(groupSum(edited, 'partA')).toBeCloseTo(600, 6);
    expect(groupSum(edited, 'parcel')).toBeCloseTo(TOTAL_M2, 6);
  });

  it('rebalances the parts when the parent parcel itself is reshaped', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);
    const parentM = findMeasurement(afterSplit, 'parcel')!.measurement;

    // shrink the parent: its own manual-area factor is untouched, so its displayed total drops,
    // and the parts must divide the new total
    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'parcel',
        vertexIndex: vertexIndexAt(parentM, 20, 0),
        newPosition: { x: 16, y: 0 },
      }),
    );

    const newTotal = displayedArea(findMeasurement(edited, 'parcel')!.measurement);
    expect(newTotal).toBeLessThan(TOTAL_M2);
    expect(groupSum(edited, 'parcel')).toBeCloseTo(newTotal, 6);
  });

  it('leaves measurements without a manual area completely alone', () => {
    const stack = new CommandStack();
    const initial = makeTestSurface([parcel()]);
    const afterSplit = stack.execute<Surface>(
      splitCommand({
        surface: initial,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 10, y: -1 }, { x: 10, y: 11 }],
        childIds: ['partA', 'partB'],
      }),
    );

    const partA = findMeasurement(afterSplit, 'partA')!.measurement;
    const edited = stack.execute<Surface>(
      editVertexCommand({
        surface: afterSplit,
        measurementId: 'partA',
        vertexIndex: vertexIndexAt(partA, 10, 0),
        newPosition: { x: 14, y: 0 },
      }),
    );

    for (const id of ['parcel', 'partA', 'partB']) {
      expect(findMeasurement(edited, id)!.measurement.manualArea).toBeUndefined();
    }
  });

  it('deleting a part dissolves the group rather than inflating the survivor', () => {
    const stack = new CommandStack();
    const afterSplit = splitParcel(stack);
    const partBBefore = findMeasurement(afterSplit, 'partB')!.measurement;

    const afterDelete = stack.execute<Surface>(
      deleteMeasurementsCommand({ surface: afterSplit, measurementIds: ['partA'] }),
    );

    // 11 §4 — the survivor loses parentId and keeps its own area; it is not grown to cover the gap
    const partBAfter = findMeasurement(afterDelete, 'partB')!.measurement;
    expect(partBAfter.parentId).toBeUndefined();
    expect(displayedArea(partBAfter)).toBeCloseTo(displayedArea(partBBefore), 6);
  });
});

describe('PD-024 — shared vertices (INV-19, T-INV-19)', () => {
  // 20x10 parcel split down x=10 into two 10x10 parts. The boundary vertices (10,0) and (10,10)
  // exist once in each part; the outer corners also exist in the parcel. Which child id ends up on
  // which side is the split algorithm's business, so tests ask `sides()` instead of assuming.
  function parcel(): Measurement {
    return {
      id: 'parcel',
      shape: { type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }] },
      identity: { name: 'Parcel', color: '#2E7D32' },
      provenance: 'Manual',
      locked: false,
    };
  }

  function vertices(surface: Surface, id: string): readonly { x: number; y: number }[] {
    const shape = findMeasurement(surface, id)!.measurement.shape;
    if (shape.type !== 'polygon') throw new Error('expected a polygon');
    return shape.vertices;
  }

  function indexAt(surface: Surface, id: string, x: number, y: number): number {
    const index = vertices(surface, id).findIndex((v) => Math.abs(v.x - x) < 1e-6 && Math.abs(v.y - y) < 1e-6);
    if (index < 0) throw new Error(`${id} has no vertex at (${x}, ${y})`);
    return index;
  }

  function hasVertexAt(surface: Surface, id: string, x: number, y: number): boolean {
    return vertices(surface, id).some((v) => Math.abs(v.x - x) < 1e-6 && Math.abs(v.y - y) < 1e-6);
  }

  function split(stack: CommandStack, surface: Surface = makeTestSurface([parcel()])): Surface {
    return stack.execute<Surface>(
      splitCommand({ surface, parentMeasurementId: 'parcel', splitLine: [{ x: 10, y: -1 }, { x: 10, y: 11 }], childIds: ['partA', 'partB'] }),
    );
  }

  function sides(surface: Surface): { left: string; right: string } {
    return hasVertexAt(surface, 'partA', 0, 0) ? { left: 'partA', right: 'partB' } : { left: 'partB', right: 'partA' };
  }

  function patch(surface: Surface, id: string, changes: Partial<Measurement>): Surface {
    return {
      ...surface,
      layers: surface.layers.map((layer) => ({
        ...layer,
        measurements: layer.measurements.map((m) => (m.id === id ? { ...m, ...changes } : m)),
      })),
    };
  }

  function moveVertex(stack: CommandStack, surface: Surface, id: string, from: [number, number], to: [number, number]): Surface {
    return stack.execute<Surface>(
      editVertexCommand({ surface, measurementId: id, vertexIndex: indexAt(surface, id, ...from), newPosition: { x: to[0], y: to[1] } }),
    );
  }

  it('dragging a shared boundary vertex moves both parts and leaves the parent untouched; undo/redo are atomic', () => {
    const stack = new CommandStack();
    const afterSplit = split(stack);

    const moved = moveVertex(stack, afterSplit, 'partA', [10, 0], [12, 0]);
    expect(hasVertexAt(moved, 'partA', 12, 0)).toBe(true);
    expect(hasVertexAt(moved, 'partB', 12, 0)).toBe(true);
    expect(hasVertexAt(moved, 'partB', 10, 0)).toBe(false);
    expect(findMeasurement(moved, 'parcel')).toEqual(findMeasurement(afterSplit, 'parcel'));
    // no gap, no overlap: the parts still exactly tile the parcel
    expect(shoelaceArea(vertices(moved, 'partA')) + shoelaceArea(vertices(moved, 'partB'))).toBeCloseTo(200, 9);

    expect(stack.undo<Surface>()).toEqual(afterSplit);
    expect(stack.redo<Surface>()).toEqual(moved);
  });

  it('a part outer corner does not drag the parent, and the parent corner does not drag its parts', () => {
    const stack = new CommandStack();
    const afterSplit = split(stack);

    const { left, right } = sides(afterSplit);

    const partCornerMoved = moveVertex(stack, afterSplit, left, [0, 0], [-2, 0]);
    expect(hasVertexAt(partCornerMoved, 'parcel', 0, 0)).toBe(true);

    const parentCornerMoved = moveVertex(stack, afterSplit, 'parcel', [20, 0], [22, 0]);
    expect(hasVertexAt(parentCornerMoved, right, 20, 0)).toBe(true);
  });

  it('moves manually drawn neighbours snapped vertex-to-vertex (PD-009 equivalence)', () => {
    const initial = makeTestSurface([makeSquareMeasurement('left'), makeSquareMeasurement('right', 10)]);
    const moved = moveVertex(new CommandStack(), initial, 'left', [10, 0], [11, -1]);
    expect(vertices(moved, 'left')[1]).toEqual({ x: 11, y: -1 });
    expect(vertices(moved, 'right')[0]).toEqual({ x: 11, y: -1 });
  });

  it('linked: false (Ctrl/Cmd+drag) moves only the source shape', () => {
    const initial = makeTestSurface([makeSquareMeasurement('left'), makeSquareMeasurement('right', 10)]);
    const moved = new CommandStack().execute<Surface>(
      editVertexCommand({ surface: initial, measurementId: 'left', vertexIndex: 1, newPosition: { x: 11, y: -1 }, linked: false }),
    );
    expect(vertices(moved, 'left')[1]).toEqual({ x: 11, y: -1 });
    expect(vertices(moved, 'right')[0]).toEqual({ x: 10, y: 0 });
  });

  it('a locked neighbour refuses the whole move; the Surface is unchanged', () => {
    const stack = new CommandStack();
    const locked = patch(split(stack), 'partB', { locked: true });
    const depthBefore = stack.undoDepth;
    expect(() => moveVertex(stack, locked, 'partA', [10, 0], [12, 0])).toThrow(/locked/);
    expect(stack.undoDepth).toBe(depthBefore);
  });

  it('a hidden neighbour follows (hiding is visual only)', () => {
    const stack = new CommandStack();
    const hidden = patch(split(stack), 'partB', { identity: { name: 'partB', color: '#000', hidden: true } });
    const moved = moveVertex(stack, hidden, 'partA', [10, 0], [12, 0]);
    expect(hasVertexAt(moved, 'partB', 12, 0)).toBe(true);
  });

  it('a move that would make any participant self-intersect is rejected entirely', () => {
    const stack = new CommandStack();
    const afterSplit = split(stack);
    const { left } = sides(afterSplit);
    const depthBefore = stack.undoDepth;
    // (21,5) is still a simple quadrilateral for the left part, but makes the right part's edge
    // (10,10)→(21,5) cross its own edge (20,0)→(20,10).
    expect(() => moveVertex(stack, afterSplit, left, [10, 0], [21, 5])).toThrow(/self-intersect/);
    expect(stack.undoDepth).toBe(depthBefore);
  });

  it('PD-021: a linked move keeps the Split group summing to the entered total', () => {
    const stack = new CommandStack();
    const withTotal = stack.execute<Surface>(setManualAreaCommand({ surface: makeTestSurface([parcel()]), measurementId: 'parcel', manualAreaM2: 1200 }));
    const afterSplit = split(stack, withTotal);
    const { left, right } = sides(afterSplit);
    const moved = moveVertex(stack, afterSplit, right, [10, 10], [15, 10]);
    const displayed = (id: string) =>
      shoelaceArea(vertices(moved, id)) * (findMeasurement(moved, id)!.measurement.manualArea?.squareMetersPerSquarePixel ?? 0);
    expect(displayed('partA') + displayed('partB')).toBeCloseTo(1200, 6);
    expect(displayed(left)).toBeGreaterThan(displayed(right)); // the boundary really moved
  });

  it('nested split: a grandchild links to its cousin, never to its parent or grandparent', () => {
    const stack = new CommandStack();
    const afterSplit = split(stack);
    const { left, right } = sides(afterSplit);
    const nested = stack.execute<Surface>(
      splitCommand({ surface: afterSplit, parentMeasurementId: left, splitLine: [{ x: -1, y: 5 }, { x: 11, y: 5 }], childIds: ['sub1', 'sub2'] }),
    );
    const lower = hasVertexAt(nested, 'sub1', 10, 0) ? 'sub1' : 'sub2';
    const moved = moveVertex(stack, nested, lower, [10, 0], [12, 0]);
    expect(hasVertexAt(moved, right, 12, 0)).toBe(true); // cousin follows
    expect(findMeasurement(moved, left)).toEqual(findMeasurement(nested, left)); // parent untouched
    expect(findMeasurement(moved, 'parcel')).toEqual(findMeasurement(nested, 'parcel')); // grandparent untouched
  });

  it('property: after a linked drag of a split boundary point, the parts still tile the moved outline', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 9 }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 8 }),
        fc.double({ min: 0.2, max: 0.8, noNaN: true }),
        fc.double({ min: 0.2, max: 0.8, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        (n, rawEdgeA, rawEdgeB, tA, tB, dx, dy) => {
          const outline = Array.from({ length: n }, (_, i) => {
            const theta = (2 * Math.PI * i) / n;
            return { x: 10 * Math.cos(theta), y: 10 * Math.sin(theta) };
          });
          const edgeA = rawEdgeA % n;
          const edgeB = rawEdgeB % n;
          fc.pre(edgeA !== edgeB);
          const on = (edge: number, t: number) => {
            const p = outline[edge]!;
            const q = outline[(edge + 1) % n]!;
            return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
          };
          const a = on(edgeA, tA);
          const b = on(edgeB, tB);
          const line = [
            { x: a.x - 0.01 * (b.x - a.x), y: a.y - 0.01 * (b.y - a.y) },
            { x: b.x + 0.01 * (b.x - a.x), y: b.y + 0.01 * (b.y - a.y) },
          ];
          const stack = new CommandStack();
          const afterSplit = stack.execute<Surface>(
            splitCommand({
              surface: makeTestSurface([{ ...parcel(), shape: { type: 'polygon', vertices: outline } }]),
              parentMeasurementId: 'parcel',
              splitLine: line,
              childIds: ['partA', 'partB'],
            }),
          );

          const target = { x: a.x + dx, y: a.y + dy };
          // The parts' combined outline is the parcel with the boundary point moved off edgeA.
          const movedOutline = [...outline.slice(0, edgeA + 1), target, ...outline.slice(edgeA + 1)];
          fc.pre(isSimplePolygon(movedOutline));
          let moved: Surface;
          try {
            moved = moveVertex(stack, afterSplit, 'partA', [a.x, a.y], [target.x, target.y]);
          } catch {
            return; // a drag that would self-intersect a part is rejected as a whole — nothing to check
          }
          const sum = shoelaceArea(vertices(moved, 'partA')) + shoelaceArea(vertices(moved, 'partB'));
          expect(sum).toBeCloseTo(shoelaceArea(movedOutline), 6);
          expect(hasVertexAt(moved, 'partB', target.x, target.y)).toBe(true);
        },
      ),
    );
  });

  // Two 10x10 squares side by side: left's edge 1 (10,0)→(10,10) is right's closing edge 3
  // (10,10)→(10,0), so a shared edge is matched in the opposite direction and across the wrap.
  function sideBySide(): Surface {
    return makeTestSurface([makeSquareMeasurement('left'), makeSquareMeasurement('right', 10)]);
  }

  function insertVertex(stack: CommandStack, surface: Surface, id: string, edgeIndex: number, at: [number, number], linked?: boolean): Surface {
    return stack.execute<Surface>(addVertexCommand({ surface, measurementId: id, edgeIndex, position: { x: at[0], y: at[1] }, ...(linked === undefined ? {} : { linked }) }));
  }

  it('insert: a vertex added on a shared edge is added to both shapes, at the right index in each; undo is atomic', () => {
    const stack = new CommandStack();
    const initial = sideBySide();
    const inserted = insertVertex(stack, initial, 'left', 1, [10, 4]);
    expect(vertices(inserted, 'left')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(vertices(inserted, 'right')).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 4 }]);
    expect(stack.undo<Surface>()).toEqual(initial);
    expect(stack.redo<Surface>()).toEqual(inserted);
  });

  it('insert: vertex labels shift in every shape that gained the vertex (INV-17)', () => {
    const label = (text: string) => ({ text, color: '#1565C0' });
    const initial = patch(patch(sideBySide(), 'left', { vertexLabels: ['A', 'B', 'C', 'D'].map(label) }), 'right', {
      vertexLabels: [null, label('Q'), label('R'), label('S')],
    });
    // from the right shape's side this time: its closing edge 3 is the shared one, so its new
    // vertex is appended after every labelled one
    const inserted = insertVertex(new CommandStack(), initial, 'right', 3, [10, 4]);
    expect(findMeasurement(inserted, 'left')!.measurement.vertexLabels).toEqual([label('A'), label('B'), null, label('C'), label('D')]);
    expect(findMeasurement(inserted, 'right')!.measurement.vertexLabels).toEqual([null, label('Q'), label('R'), label('S')]);
    expect(vertices(inserted, 'left')[2]).toEqual({ x: 10, y: 4 });
  });

  it('insert: the new vertex is shared, so a following drag moves both shapes', () => {
    const stack = new CommandStack();
    const inserted = insertVertex(stack, sideBySide(), 'left', 1, [10, 4]);
    const moved = moveVertex(stack, inserted, 'left', [10, 4], [13, 4]);
    expect(hasVertexAt(moved, 'right', 13, 4)).toBe(true);
    expect(shoelaceArea(vertices(moved, 'left')) + shoelaceArea(vertices(moved, 'right'))).toBeCloseTo(200, 9);
  });

  it('insert: on a Split boundary both parts gain the vertex, the parent does not', () => {
    const stack = new CommandStack();
    const afterSplit = split(stack);
    const { left, right } = sides(afterSplit);
    const from = indexAt(afterSplit, left, 10, 0);
    const to = indexAt(afterSplit, left, 10, 10);
    // the shared edge is whichever of left's edges joins its two boundary vertices
    const n = vertices(afterSplit, left).length;
    const edgeIndex = (from + 1) % n === to ? from : to;
    const inserted = insertVertex(stack, afterSplit, left, edgeIndex, [10, 6]);
    expect(hasVertexAt(inserted, left, 10, 6)).toBe(true);
    expect(hasVertexAt(inserted, right, 10, 6)).toBe(true);
    expect(findMeasurement(inserted, 'parcel')).toEqual(findMeasurement(afterSplit, 'parcel'));
  });

  it('insert: linked: false (Ctrl/Cmd) inserts into the source shape only', () => {
    const inserted = insertVertex(new CommandStack(), sideBySide(), 'left', 1, [10, 4], false);
    expect(vertices(inserted, 'left')).toHaveLength(5);
    expect(vertices(inserted, 'right')).toHaveLength(4);
  });

  it('insert: a curve lying along the edge is never touched (PD-024 — curves share vertices, not edges)', () => {
    const curve: Measurement = {
      ...makeSquareMeasurement('curve'),
      shape: { type: 'curve', controlPoints: [{ x: 10, y: 0 }, { x: 10, y: 10 }], closed: false },
    };
    const initial = makeTestSurface([makeSquareMeasurement('left'), curve]);
    const inserted = insertVertex(new CommandStack(), initial, 'left', 1, [10, 4]);
    expect(vertices(inserted, 'left')).toHaveLength(5);
    expect(findMeasurement(inserted, 'curve')).toEqual(findMeasurement(initial, 'curve'));
  });

  it('insert: a locked neighbour refuses the whole insert; the Surface is unchanged', () => {
    const stack = new CommandStack();
    const initial = patch(sideBySide(), 'right', { locked: true });
    expect(() => insertVertex(stack, initial, 'left', 1, [10, 4])).toThrow(/locked/);
    expect(stack.undoDepth).toBe(0);
  });

  it('insert: an off-edge position that self-intersects any participant is rejected entirely', () => {
    const stack = new CommandStack();
    // (25,5) bulges the left square fine but folds the right square's closing edge across its own edge 1
    expect(() => insertVertex(stack, sideBySide(), 'left', 1, [25, 5])).toThrow(/self-intersect/);
    expect(stack.undoDepth).toBe(0);
  });
});
