import { describe, expect, it } from 'vitest';
import { CommandStack } from '../commandStack.js';
import { createMeasurementCommand } from './createMeasurement.js';
import { commitGhostCommand } from './commitGhost.js';
import { deleteMeasurementCommand } from './deleteMeasurement.js';
import { editVertexCommand } from './editVertex.js';
import { removeVertexCommand } from './removeVertex.js';
import { splitCommand } from './split.js';
import { recalibrateCommand } from './recalibrate.js';
import { makeSquareMeasurement, makeTestSurface } from './testFixtures.js';
import { findMeasurement } from '../surfaceOps.js';
import type { Surface } from '../../core/domain/entities.js';

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

describe('DeleteMeasurement — parent/child cascade (11 §4)', () => {
  it('deleting a split parent cascades to both children in one undoable action', () => {
    const parent = makeSquareMeasurement('parent');
    const childA = { ...makeSquareMeasurement('childA'), parentId: 'parent' };
    const childB = { ...makeSquareMeasurement('childB', 20), parentId: 'parent' };
    const initial = makeTestSurface([parent, childA, childB]);
    const stack = new CommandStack();

    const mutated = stack.execute(deleteMeasurementCommand({ surface: initial, measurementId: 'parent' }));
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

    const mutated = stack.execute(deleteMeasurementCommand({ surface: initial, measurementId: 'childA' }));
    const remaining = mutated.layers[0]!.measurements;
    expect(remaining.map((m) => m.id).sort()).toEqual(['childB', 'parent']);
    const survivingSibling = remaining.find((m) => m.id === 'childB')!;
    expect(survivingSibling.parentId).toBeUndefined(); // group dissolved
    const survivingParent = remaining.find((m) => m.id === 'parent')!;
    expect(survivingParent).toEqual(parent); // untouched

    expect(stack.undo<Surface>()).toEqual(initial);
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
