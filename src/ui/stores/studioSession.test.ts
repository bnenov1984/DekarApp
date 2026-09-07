import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  activeSurface,
  backgroundLockFlash,
  backgroundSelected,
  canRedo,
  canUndo,
  deleteSelectedMeasurement,
  duplicateSelectedMeasurement,
  deselectAll,
  endStudioSession,
  executeCommand,
  findMeasurementAt,
  flashBackgroundLock,
  initStudioSession,
  redo,
  reorderMeasurements,
  resizeImage,
  selectBackground,
  setImageLocked,
  setMeasurementLocked,
  setManualArea,
  setVertexLabel,
  selectedMeasurementId,
  selectedMeasurementIds,
  selectMeasurement,
  selectMeasurementAt,
  selectMeasurements,
  toggleMeasurementSelection,
  undo,
} from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { updateIdentityCommand } from '../../application/commands/updateIdentity.js';
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

// PO follow-up (UX review, item A13 "multi-select") — selectedMeasurementIds (a Set) is now the
// source of truth; selectedMeasurementId is a derived convenience view that's non-null only when
// *exactly one* id is selected (never "pick one arbitrarily" for 0 or >1).
describe('studioSession — multi-select', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
    executeCommand(buildCreateSquare('m1'));
    executeCommand(buildCreateSquare('m2'));
    executeCommand(buildCreateSquare('m3'));
  });

  it('selectMeasurement replaces the whole selection with just one id', () => {
    toggleMeasurementSelection('m1');
    toggleMeasurementSelection('m2');
    expect(get(selectedMeasurementIds).size).toBe(2);

    selectMeasurement('m3');
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m3']));
    expect(get(selectedMeasurementId)).toBe('m3'); // exactly one -> derived singular resolves
  });

  it('toggleMeasurementSelection adds an unselected id and removes an already-selected one', () => {
    toggleMeasurementSelection('m1');
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m1']));

    toggleMeasurementSelection('m2');
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m1', 'm2']));
    expect(get(selectedMeasurementId)).toBeNull(); // two selected -> derived singular is null, not a guess

    toggleMeasurementSelection('m1');
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m2']));
    expect(get(selectedMeasurementId)).toBe('m2'); // back down to one -> resolves again
  });

  it('selectMeasurements replaces the whole selection with exactly the given ids (marquee contract)', () => {
    toggleMeasurementSelection('m3'); // pre-existing selection a marquee drag should overwrite
    selectMeasurements(['m1', 'm2']);
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m1', 'm2']));

    selectMeasurements([]); // an empty marquee result clears the selection, same as a plain miss-click
    expect(get(selectedMeasurementIds).size).toBe(0);
  });

  it('every Measurement-selecting entrypoint clears a prior Background selection', () => {
    selectBackground();
    expect(get(backgroundSelected)).toBe(true);
    toggleMeasurementSelection('m1');
    expect(get(backgroundSelected)).toBe(false);

    selectBackground();
    selectMeasurements(['m1']);
    expect(get(backgroundSelected)).toBe(false);
  });

  it('deleteSelectedMeasurement deletes every selected id as one undo step', () => {
    toggleMeasurementSelection('m1');
    toggleMeasurementSelection('m3');
    const beforeDelete = get(activeSurface);

    deleteSelectedMeasurement();

    const remaining = get(activeSurface)!.layers[0]!.measurements.map((m) => m.id);
    expect(remaining).toEqual(['m2']);
    expect(get(selectedMeasurementIds).size).toBe(0);

    undo(); // one Ctrl+Z restores BOTH m1 and m3
    expect(get(activeSurface)).toEqual(beforeDelete);
  });

  it('duplicateSelectedMeasurement duplicates every selected id and selects every copy', () => {
    toggleMeasurementSelection('m1');
    toggleMeasurementSelection('m2');

    duplicateSelectedMeasurement();

    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(5); // 3 originals + 2 copies
    const selected = get(selectedMeasurementIds);
    expect(selected.size).toBe(2);
    for (const id of selected) {
      expect(['m1', 'm2', 'm3']).not.toContain(id); // selection moved to the fresh copies, not the originals
    }
  });
});

// PO follow-up (background layer selectability + deselect-on-empty-click/Escape) —
// backgroundSelected is its own flag (the Background "layer" isn't a Measurement), kept mutually
// exclusive with selectedMeasurementId by every selection entrypoint; deselectAll is the single
// "select nothing" entrypoint (click-outside-object / Escape).
describe('studioSession — background selection', () => {
  beforeEach(() => {
    initStudioSession({ ...blankSurface(), kind: 'image' });
  });

  it('selectBackground selects the background and clears any Measurement selection', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');
    expect(get(selectedMeasurementId)).toBe('m1');

    selectBackground();
    expect(get(backgroundSelected)).toBe(true);
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('selecting a Measurement clears a prior Background selection', () => {
    executeCommand(buildCreateSquare('m1'));
    selectBackground();
    expect(get(backgroundSelected)).toBe(true);

    selectMeasurement('m1');
    expect(get(selectedMeasurementId)).toBe('m1');
    expect(get(backgroundSelected)).toBe(false);
  });

  it('selectMeasurementAt also clears a prior Background selection, even on a miss', () => {
    selectBackground();
    selectMeasurementAt({ x: 500, y: 500 });
    expect(get(backgroundSelected)).toBe(false);
    expect(get(selectedMeasurementId)).toBeNull();
  });

  it('deselectAll clears both selection channels', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');
    deselectAll();
    expect(get(selectedMeasurementId)).toBeNull();
    expect(get(backgroundSelected)).toBe(false);

    selectBackground();
    deselectAll();
    expect(get(backgroundSelected)).toBe(false);
  });

  it('initStudioSession/endStudioSession reset backgroundSelected', () => {
    selectBackground();
    expect(get(backgroundSelected)).toBe(true);

    initStudioSession(blankSurface());
    expect(get(backgroundSelected)).toBe(false);

    selectBackground();
    endStudioSession();
    expect(get(backgroundSelected)).toBe(false);
  });

  it('flashBackgroundLock increments the flash counter on every call', () => {
    expect(get(backgroundLockFlash)).toBe(0);
    flashBackgroundLock();
    expect(get(backgroundLockFlash)).toBe(1);
    flashBackgroundLock();
    expect(get(backgroundLockFlash)).toBe(2);
  });
});

// findMeasurementAt is the non-mutating lookup CanvasStage's double-click handler uses instead
// of selectMeasurementAt, specifically so a miss (e.g. double-clicking an imported background
// image, which isn't a Measurement) never clears an existing selection — found via live PO
// testing that it previously did, closing the Properties panel unexpectedly.
describe('studioSession — findMeasurementAt', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('returns the id under a hit point without touching the selection store', () => {
    executeCommand(buildCreateSquare('m1'));
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 5, y: 5 })).toBe('m1');
    expect(get(selectedMeasurementId)).toBeNull(); // pure lookup — no side effect
  });

  it('returns null on a miss and leaves any existing selection untouched', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 500, y: 500 })).toBeNull();
    expect(get(selectedMeasurementId)).toBe('m1'); // unlike selectMeasurementAt, a miss is a no-op
  });

  // PO follow-up (UX review, item A5 "eye icon = real visibility") — a hidden Measurement isn't
  // drawn (sceneRenderer.ts, verified live in the browser — Canvas2D isn't available under this
  // node-based test run), so it shouldn't be clickable where it used to be either.
  it('skips a hidden measurement — a click where it used to be is a miss', () => {
    executeCommand(buildCreateSquare('m1'));
    const identity = get(activeSurface)!.layers[0]!.measurements[0]!.identity;
    executeCommand((surface) => updateIdentityCommand({ surface, measurementId: 'm1', identity: { ...identity, hidden: true } }));
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 5, y: 5 })).toBeNull();
  });

  it('a hidden measurement below a visible one no longer blocks the visible one from being found', () => {
    executeCommand(buildCreateSquare('m1')); // 0,0 - 10,10
    executeCommand(buildCreateSquare('m2')); // also 0,0 - 10,10, drawn after -> on top
    const identity = get(activeSurface)!.layers[0]!.measurements[1]!.identity; // m2, the topmost
    executeCommand((surface) => updateIdentityCommand({ surface, measurementId: 'm2', identity: { ...identity, hidden: true } }));
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 5, y: 5 })).toBe('m1'); // falls through to the one underneath
  });

  // PO request ("fix overlapping vertex selection and locked layers") — a locked Measurement must
  // be completely absent from canvas hit-testing (visible but non-interactive), same category as
  // `hidden` above, so it can never win the topmost-hit race against an unlocked neighbor sharing
  // a coincident vertex/edge.
  it('skips a locked measurement — a click where it used to be is a miss', () => {
    executeCommand(buildCreateSquare('m1'));
    setMeasurementLocked('m1', true);
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 5, y: 5 })).toBeNull();
  });

  it('a locked measurement on top no longer blocks the unlocked one underneath from being found', () => {
    executeCommand(buildCreateSquare('m1')); // 0,0 - 10,10
    executeCommand(buildCreateSquare('m2')); // also 0,0 - 10,10, drawn after -> on top
    setMeasurementLocked('m2', true);
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 5, y: 5 })).toBe('m1'); // falls through to the unlocked one underneath
  });

  it('still finds a locked measurement that has no unlocked neighbor — a true miss, not a crash', () => {
    executeCommand(buildCreateSquare('m1'));
    setMeasurementLocked('m1', true);
    const surface = get(activeSurface)!;

    expect(findMeasurementAt(surface, { x: 500, y: 500 })).toBeNull();
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

  // PO follow-up ("per-measurement lock") — entities.ts's own contract: deletion is refused for a
  // locked Measurement, same "protection from accidental editing" as move/resize/vertex-edit/split.
  it('is a no-op for a single locked measurement, which stays selected', () => {
    executeCommand(buildCreateSquare('m1'));
    setMeasurementLocked('m1', true);
    selectMeasurement('m1');

    deleteSelectedMeasurement();

    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(1);
    expect(get(selectedMeasurementId)).toBe('m1');
  });

  it('deletes only the unlocked ids from a mixed selection, leaving the locked one selected', () => {
    executeCommand(buildCreateSquare('m1'));
    executeCommand(buildCreateSquare('m2'));
    setMeasurementLocked('m1', true);
    selectMeasurements(['m1', 'm2']);

    deleteSelectedMeasurement();

    const remaining = get(activeSurface)!.layers[0]!.measurements;
    expect(remaining.map((m) => m.id)).toEqual(['m1']);
    expect(get(selectedMeasurementIds)).toEqual(new Set(['m1']));
  });
});

// PO follow-up (UX review, item B6 "Ctrl+D duplicate") — duplicateMeasurementCommand already owns
// the geometry/identity cloning (duplicateMeasurement.ts); this only checks the store wiring:
// resolves "which id" from selection, generates a fresh id, and selects the copy afterward.
describe('studioSession — duplicateSelectedMeasurement', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
  });

  it('is a no-op when nothing is selected', () => {
    executeCommand(buildCreateSquare('m1'));
    duplicateSelectedMeasurement();
    expect(get(activeSurface)!.layers[0]!.measurements).toHaveLength(1);
  });

  it('clones the selected measurement, offset, and selects the copy', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');

    duplicateSelectedMeasurement();

    const measurements = get(activeSurface)!.layers[0]!.measurements;
    expect(measurements).toHaveLength(2);
    const copyId = get(selectedMeasurementId);
    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe('m1');
    const copy = measurements.find((m) => m.id === copyId)!;
    expect(copy.shape).not.toEqual(measurements.find((m) => m.id === 'm1')!.shape); // offset, not identical
  });

  it('is undoable — restores the exact prior surface', () => {
    executeCommand(buildCreateSquare('m1'));
    selectMeasurement('m1');
    const beforeDuplicate = get(activeSurface);

    duplicateSelectedMeasurement();
    undo();

    expect(get(activeSurface)).toEqual(beforeDuplicate);
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

// Resizable imported image (PO request) — resizeImageCommand already owns the geometry
// (resizeImage.ts); this only checks the store wiring: undoable, no interaction with selection.
describe('studioSession — resizeImage', () => {
  beforeEach(() => {
    initStudioSession({ ...blankSurface(), kind: 'image' });
  });

  it('sets imageRect on the active surface and is undoable', () => {
    const before = get(activeSurface)!;

    resizeImage({ x: 5, y: 5 }, 200, 100);

    expect(get(activeSurface)!.imageRect).toEqual({ origin: { x: 5, y: 5 }, width: 200, height: 100 });

    undo();
    expect(get(activeSurface)).toEqual(before);
  });
});

// Lockable Background layer (PO request) — setImageLockedCommand already owns the field flip
// (setImageLocked.ts); this only checks the store wiring, undoable.
describe('studioSession — setImageLocked', () => {
  beforeEach(() => {
    initStudioSession({ ...blankSurface(), kind: 'image' });
  });

  it('toggles imageLocked on the active surface and is undoable', () => {
    expect(get(activeSurface)!.imageLocked).toBeUndefined(); // undefined == locked, the safe default

    setImageLocked(false);
    expect(get(activeSurface)!.imageLocked).toBe(false);

    undo();
    expect(get(activeSurface)!.imageLocked).toBeUndefined();
  });
});

// Per-measurement lock (PO follow-up) — setMeasurementLockedCommand already owns the field flip
// (setMeasurementLocked.ts); this only checks the store wiring, undoable.
describe('studioSession — setMeasurementLocked', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
    executeCommand(buildCreateSquare('m1'));
  });

  it('toggles locked on the target measurement and is undoable', () => {
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.locked).toBe(false);

    setMeasurementLocked('m1', true);
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.locked).toBe(true);

    undo();
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.locked).toBe(false);
  });
});

// Manual area (PO request) — setManualAreaCommand already owns the scale-factor derivation
// (setManualArea.ts); this only checks the store wiring, undoable.
describe('studioSession — setManualArea', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
    executeCommand(buildCreateSquare('m1')); // 10x10 = 100 px²
  });

  it('sets a manual area scale factor and is undoable', () => {
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.manualArea).toBeUndefined();

    setManualArea('m1', 1200);
    const manualArea = get(activeSurface)!.layers[0]!.measurements[0]!.manualArea;
    expect(manualArea).toBeDefined();
    expect(manualArea!.squareMetersPerSquarePixel).toBeCloseTo(12, 8); // 1200 / 100px²

    undo();
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.manualArea).toBeUndefined();
  });

  it('clears the manual area with null', () => {
    setManualArea('m1', 1200);
    setManualArea('m1', null);
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.manualArea).toBeUndefined();
  });
});

// Per-vertex annotation (PO request) — setVertexLabelCommand already owns the array bookkeeping
// (vertexLabels.ts); this only checks the store wiring, undoable.
describe('studioSession — setVertexLabel', () => {
  beforeEach(() => {
    initStudioSession(blankSurface());
    executeCommand(buildCreateSquare('m1'));
  });

  it('sets a label at a vertex index and is undoable', () => {
    const before = get(activeSurface)!;

    setVertexLabel('m1', 1, { text: 'B', color: '#1565C0' });

    expect(get(activeSurface)!.layers[0]!.measurements[0]!.vertexLabels).toEqual([null, { text: 'B', color: '#1565C0' }]);

    undo();
    expect(get(activeSurface)).toEqual(before);
  });
});
