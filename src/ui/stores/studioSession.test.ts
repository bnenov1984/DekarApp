import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  activeSurface,
  canRedo,
  canUndo,
  deleteSelectedMeasurement,
  endStudioSession,
  executeCommand,
  initStudioSession,
  redo,
  reorderMeasurements,
  selectedMeasurementId,
  selectMeasurement,
  selectMeasurementAt,
  undo,
} from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { splitCommand } from '../../application/commands/split.js';
import type { Surface } from '../../core/domain/entities.js';

// UI-layer session store exercised with a REAL Application command (not a mock) — this is the
// integration seam the commit exists to prove: UI -> studioSession -> CommandStack -> Core,
// with the store always reflecting the CommandStack's view of the current Surface.

function blankSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'blank',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

function buildCreateSquare(measurementId: string) {
  return (surface: Surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId,
      shapeParams: {
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      },
      identity: { name: 'Square', color: '#2E7D32' },
      provenance: 'Manual',
    });
}

describe('studioSession', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('starts with an empty undo history', () => {
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(false);
    expect(get(activeSurface)).toEqual(blankSurface());
  });

  it('executeCommand applies the command and updates undo availability', () => {
    executeCommand(buildCreateSquare('m1'));
    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(1);
    expect(get(canUndo)).toBe(true);
    expect(get(canRedo)).toBe(false);
  });

  it('undo restores the exact initial surface; redo reapplies the exact mutated one', () => {
    executeCommand(buildCreateSquare('m1'));
    const mutated = get(activeSurface);

    undo();
    expect(get(activeSurface)).toEqual(blankSurface());
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(true);

    redo();
    expect(get(activeSurface)).toEqual(mutated);
    expect(get(canUndo)).toBe(true);
    expect(get(canRedo)).toBe(false);
  });

  it('commands are always built against the current store value, not a stale reference', () => {
    executeCommand(buildCreateSquare('m1'));
    executeCommand(buildCreateSquare('m2')); // factory receives the post-m1 surface
    expect(get(activeSurface)!.layers[0]!.measurements.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('a failing command leaves the surface and undo state untouched', () => {
    executeCommand(buildCreateSquare('m1'));
    const before = get(activeSurface);

    expect(() =>
      executeCommand((surface) =>
        createMeasurementCommand({
          surface,
          layerId: 'layer1',
          measurementId: 'bad',
          shapeParams: {
            type: 'polygon',
            // bowtie — rejected by drawingEngine.create (18 §2)
            vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
          },
          identity: { name: 'Bad', color: '#000' },
          provenance: 'Manual',
        }),
      ),
    ).toThrow();

    expect(get(activeSurface)).toEqual(before);
    expect(get(canUndo)).toBe(true); // still just the one successful command
  });

  it('initStudioSession resets the undo history (fresh stack per project, 21 §4.2)', () => {
    executeCommand(buildCreateSquare('m1'));
    expect(get(canUndo)).toBe(true);

    initStudioSession(blankSurface());
    expect(get(canUndo)).toBe(false);
    expect(get(canRedo)).toBe(false);
  });

  it('undo/redo are safe no-ops without a session', () => {
    endStudioSession();
    expect(() => undo()).not.toThrow();
    expect(() => redo()).not.toThrow();
    expect(get(activeSurface)).toBeNull();
  });
});

describe('studioSession — selection (UI commit 4, 21 §6.3)', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('selects the measurement under a hit point', () => {
    executeCommand(buildCreateSquare('m1')); // 10x10 square at origin
    selectMeasurementAt({ x: 5, y: 5 });
    expect(get(selectedMeasurementId)).toBe('m1');
  });

  it('clears selection when clicking empty space', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurementAt({ x: 5, y: 5 });
    expect(get(selectedMeasurementId)).toBe('m1');

    selectMeasurementAt({ x: 500, y: 500 });
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('picks the topmost measurement on overlap', () => {
    executeCommand(buildCreateSquare('m1')); // 0,0 - 10,10
    executeCommand(buildCreateSquare('m2')); // also 0,0 - 10,10, drawn after -> on top
    selectMeasurementAt({ x: 5, y: 5 });
    expect(get(selectedMeasurementId)).toBe('m2');
  });

  it('initStudioSession clears any prior selection', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurementAt({ x: 5, y: 5 });
    expect(get(selectedMeasurementId)).toBe('m1');

    initStudioSession(blankSurface());
    expect(get(selectedMeasurementId)).toBeNull();
  });
});

// 11 §4 lifecycle rules — deleteMeasurementCommand already owns them (deleteMeasurement.ts);
// this only checks that deleteSelectedMeasurement resolves "which id" from selection correctly
// and clears the selection afterward, for all three cases (plain / split parent / split child).
describe('studioSession — deleteSelectedMeasurement', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('is a no-op when nothing is selected', () => {
    executeCommand(buildCreateSquare('m1'));
    deleteSelectedMeasurement();
    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(1);
  });

  it('deletes a plain measurement and clears the selection', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');

    deleteSelectedMeasurement();

    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(0);
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('deleting a split PARENT cascades to remove its children too', () => {
    executeCommand(buildCreateSquare('parcel'));
    executeCommand((surface) =>
      splitCommand({
        surface,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        childIds: ['child1', 'child2'],
      }),
    );
    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(3);

    selectMeasurement('parcel');
    deleteSelectedMeasurement();

    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(0);
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('deleting a split CHILD dissolves the group for its sibling, leaving the parent untouched', () => {
    executeCommand(buildCreateSquare('parcel'));
    executeCommand((surface) =>
      splitCommand({
        surface,
        parentMeasurementId: 'parcel',
        splitLine: [{ x: 5, y: -1 }, { x: 5, y: 11 }],
        childIds: ['child1', 'child2'],
      }),
    );

    selectMeasurement('child1');
    deleteSelectedMeasurement();

    const remaining = get(activeSurface)!.layers[0]!.measurements;
    expect(remaining.map((m) => m.id)).toEqual(['parcel', 'child2']);
    expect(remaining.find((m) => m.id === 'child2')!.parentId).toBeUndefined(); // group dissolved
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('is undoable — restores the exact prior surface', () => {
    executeCommand(buildCreateSquare('m1'));
    const beforeDelete = get(activeSurface);
    selectMeasurement('m1');

    deleteSelectedMeasurement();
    undo();

    expect(get(activeSurface)).toEqual(beforeDelete);
  });
});

// Layers panel drag-to-reorder (PO request) — reorderMeasurementsCommand already owns the
// front-to-back-reverses-into-raw-order logic (reorderMeasurements.ts); this only checks the
// store wiring: undo restores exact prior order, selection is left untouched by a reorder.
describe('studioSession — reorderMeasurements', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('changes the raw draw order and is undoable back to the exact prior surface', () => {
    executeCommand(buildCreateSquare('a'));
    executeCommand(buildCreateSquare('b'));
    executeCommand(buildCreateSquare('c'));
    const beforeReorder = get(activeSurface)!;
    expect(beforeReorder.layers[0]!.measurements.map((m) => m.id)).toEqual(['a', 'b', 'c']);

    reorderMeasurements(['a', 'c', 'b']); // drag 'a' to the front of the panel

    expect(get(activeSurface)!.layers[0]!.measurements.map((m) => m.id)).toEqual(['b', 'c', 'a']);

    undo();
    expect(get(activeSurface)).toEqual(beforeReorder);
  });

  it('leaves the current selection untouched', () => {
    executeCommand(buildCreateSquare('a'));
    executeCommand(buildCreateSquare('b'));
    selectMeasurement('a');

    reorderMeasurements(['b', 'a']);

    expect(get(selectedMeasurementId)).toBe('a');
  });
});
