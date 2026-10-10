import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, executeCommand, setMeasurementLocked, undo } from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { vertexDrag, cancelDrag, pointerDown, deleteVertexAt, pointerMove, pointerUp } from './vertexEditSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Vertex Editing slice — same integration-seam approach as the other *Session.test.ts files:
// exercised against a real studioSession/CommandStack, not mocked.
//
// PO follow-up ("unify object selection and edit state") — there is no separate "enter edit mode"
// step anymore (the deleted `vertexEditingId`/`enterVertexEditing`): `pointerDown` takes the target
// `measurementId` directly (the caller — CanvasStage.svelte — already knows it's selected), and
// itself refuses to start a drag for a locked Measurement (the relocated choke point, previously
// `enterVertexEditing`'s own job).

function blankSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'blank',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

function createSquare(id: string): void {
  executeCommand((surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId: id,
      shapeParams: {
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      },
      identity: { name: 'Square', color: '#2E7D32' },
      provenance: 'Manual',
    }),
  );
}

function createRectangle(id: string): void {
  executeCommand((surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId: id,
      shapeParams: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 100, height: 50 },
      identity: { name: 'Rect', color: '#1565C0' },
      provenance: 'Manual',
    }),
  );
}

function createCircle(id: string): void {
  executeCommand((surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId: id,
      shapeParams: { type: 'circle', center: { x: 100, y: 100 }, radius: 50 },
      identity: { name: 'Circle', color: '#E65100' },
      provenance: 'Manual',
    }),
  );
}

function createLine(id: string): void {
  executeCommand((surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId: id,
      shapeParams: { type: 'line', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
      identity: { name: 'Line', color: '#4E342E' },
      provenance: 'Manual',
    }),
  );
}

function measurementShape(id: string) {
  return get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === id)!.shape;
}

const NO_MOD = { shiftKey: false, altKey: false };

beforeEach(() => {
  initStudioSession(blankSurface());
  cancelDrag();
});

describe('locked-measurement gate (relocated from the deleted enterVertexEditing)', () => {
  it('pointerDown refuses to start a drag for a locked measurement', () => {
    createSquare('m1');
    setMeasurementLocked('m1', true);
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1'); // vertex 0
    expect(get(vertexDrag)).toBeNull();
  });

  it('unlocking restores normal drag behavior', () => {
    createSquare('m1');
    setMeasurementLocked('m1', true);
    setMeasurementLocked('m1', false);
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1');
    expect(get(vertexDrag)?.kind).toBe('vertex');
  });

  it('pointerDown is a no-op for a measurement id that does not exist', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'nonexistent');
    expect(get(vertexDrag)).toBeNull();
  });

  it('cancelDrag clears any in-progress drag preview without committing it', () => {
    createSquare('m1');
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1');
    expect(get(vertexDrag)).not.toBeNull();

    cancelDrag();
    expect(get(vertexDrag)).toBeNull();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    }); // nothing committed
  });
});

describe('vertex drag', () => {
  beforeEach(() => {
    createSquare('m1');
  });

  it('mousedown on a vertex starts a vertex drag', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1'); // vertex 0
    const drag = get(vertexDrag);
    expect(drag?.kind).toBe('vertex');
    if (drag?.kind === 'vertex') expect(drag.index).toBe(0);
  });

  it('pointerMove updates the live preview without committing', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1');
    pointerMove({ x: -20, y: -20 }, NO_MOD);
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    }); // unchanged — nothing committed yet
    const drag = get(vertexDrag);
    if (drag?.kind === 'vertex') {
      expect(drag.previewShape).toEqual({
        type: 'polygon',
        vertices: [{ x: -20, y: -20 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      });
    }
  });

  it('pointerUp commits the moved vertex through editVertexCommand', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1');
    pointerMove({ x: -20, y: -20 }, NO_MOD);
    pointerUp();

    expect(get(vertexDrag)).toBeNull();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: -20, y: -20 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('is undoable through the normal CommandStack undo', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1');
    pointerMove({ x: -20, y: -20 }, NO_MOD);
    pointerUp();

    undo();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('an invalid candidate (would self-intersect) freezes the preview at the last valid position', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'm1'); // dragging vertex 0
    pointerMove({ x: -20, y: -20 }, NO_MOD); // valid
    const validDrag = get(vertexDrag);

    // moving vertex 0 to (50,200) makes edge (v0->v1) cross the opposite edge (v2->v3) —
    // guaranteed self-intersection, not just non-convexity.
    pointerMove({ x: 50, y: 200 }, NO_MOD);
    const afterInvalidAttempt = get(vertexDrag);
    expect(afterInvalidAttempt).toEqual(validDrag); // frozen, unchanged

    pointerUp();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: -20, y: -20 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });
});

describe('edge drag (insert a vertex)', () => {
  beforeEach(() => {
    createSquare('m1');
  });

  it('mousedown on an edge starts an edge drag and previews an inserted vertex', () => {
    pointerDown({ x: 50, y: 0 }, NO_MOD, 'm1'); // midpoint of the top edge (0,0)-(100,0)
    const drag = get(vertexDrag);
    expect(drag?.kind).toBe('edge');
    if (drag?.kind === 'edge') {
      expect(drag.edgeIndex).toBe(0);
      expect(drag.previewShape).toEqual({
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      });
    }
  });

  it('pointerUp commits the inserted vertex through addVertexCommand', () => {
    pointerDown({ x: 50, y: 0 }, NO_MOD, 'm1');
    pointerMove({ x: 60, y: -5 }, NO_MOD);
    pointerUp();

    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 60, y: -5 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });
});

describe('Alt+click deletes a vertex', () => {
  beforeEach(() => {
    createSquare('m1');
  });

  it('removes the clicked vertex via removeVertexCommand', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    expect(get(vertexDrag)).toBeNull(); // deletion is immediate, not a drag
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('silently rejects a deletion that would leave fewer than 3 vertices', () => {
    // delete down to a triangle first
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    // now try to delete two more, reaching the 3-vertex floor
    pointerDown({ x: 100, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    pointerDown({ x: 100, y: 100 }, { shiftKey: false, altKey: true }, 'm1');
    const shapeAtFloor = measurementShape('m1');
    if (shapeAtFloor.type !== 'polygon') throw new Error('expected polygon');
    expect(shapeAtFloor.vertices).toHaveLength(3);

    // one more attempt must be silently rejected (18 §6 TOO_FEW_VERTICES)
    pointerDown({ x: 0, y: 100 }, { shiftKey: false, altKey: true }, 'm1');
    expect(measurementShape('m1')).toEqual(shapeAtFloor);
  });

  // CanvasStage calls deleteVertexAt at mouseup for an Alt+click that never crossed the drag
  // threshold (pointerDown is only called once a drag starts).
  it('deleteVertexAt removes the vertex under a still Alt+click', () => {
    deleteVertexAt({ x: 0, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    expect(get(vertexDrag)).toBeNull();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('deleteVertexAt ignores a click on an edge or the body, and a locked shape', () => {
    deleteVertexAt({ x: 50, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    deleteVertexAt({ x: 50, y: 50 }, { shiftKey: false, altKey: true }, 'm1');
    expect(get(vertexDrag)).toBeNull();
    setMeasurementLocked('m1', true);
    deleteVertexAt({ x: 0, y: 0 }, { shiftKey: false, altKey: true }, 'm1');
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });
});

describe('rectangle corner resize', () => {
  beforeEach(() => {
    createRectangle('r1'); // origin (0,0), 100x50
  });

  it('dragging a corner resizes, keeping the diagonally opposite corner fixed', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'r1'); // corner 0
    pointerMove({ x: -20, y: -10 }, NO_MOD);
    pointerUp();

    expect(measurementShape('r1')).toEqual({
      type: 'rectangle',
      origin: { x: -20, y: -10 },
      width: 120,
      height: 60,
      rotation: 0,
    });
  });

  it('is undoable', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'r1');
    pointerMove({ x: -20, y: -10 }, NO_MOD);
    pointerUp();

    undo();
    expect(measurementShape('r1')).toEqual({ type: 'rectangle', origin: { x: 0, y: 0 }, width: 100, height: 50, rotation: 0 });
  });

  it('a degenerate resize (corner dragged past its opposite) freezes at the last valid preview', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD, 'r1');
    pointerMove({ x: 50, y: 10 }, NO_MOD); // valid: width shrinks to 50
    const validDrag = get(vertexDrag);

    pointerMove({ x: 100, y: 50 }, NO_MOD); // degenerate: collapses exactly onto the opposite corner
    expect(get(vertexDrag)).toEqual(validDrag);
  });
});

describe('circle radius resize', () => {
  beforeEach(() => {
    createCircle('c1'); // center (100,100), radius 50
  });

  it('dragging the edge handle resizes the radius', () => {
    pointerDown({ x: 150, y: 100 }, NO_MOD, 'c1'); // handle at center.x+radius
    pointerMove({ x: 180, y: 100 }, NO_MOD);
    pointerUp();

    expect(measurementShape('c1')).toEqual({ type: 'circle', center: { x: 100, y: 100 }, radius: 80 });
  });

  it('is undoable', () => {
    pointerDown({ x: 150, y: 100 }, NO_MOD, 'c1');
    pointerMove({ x: 180, y: 100 }, NO_MOD);
    pointerUp();

    undo();
    expect(measurementShape('c1')).toEqual({ type: 'circle', center: { x: 100, y: 100 }, radius: 50 });
  });
});

describe('whole-shape move (all shape types)', () => {
  it('moves a Rectangle by dragging its body', () => {
    createRectangle('r1');
    pointerDown({ x: 50, y: 25 }, NO_MOD, 'r1'); // interior, not a corner
    pointerMove({ x: 60, y: 45 }, NO_MOD); // +10,+20
    pointerUp();

    expect(measurementShape('r1')).toEqual({ type: 'rectangle', origin: { x: 10, y: 20 }, width: 100, height: 50, rotation: 0 });
  });

  it('moves a Circle by dragging its body', () => {
    createCircle('c1');
    pointerDown({ x: 100, y: 100 }, NO_MOD, 'c1'); // center — well inside, not the edge handle
    pointerMove({ x: 105, y: 105 }, NO_MOD);
    pointerUp();

    expect(measurementShape('c1')).toEqual({ type: 'circle', center: { x: 105, y: 105 }, radius: 50 });
  });

  it('moves a Polygon by dragging its interior (not a vertex or edge)', () => {
    createSquare('m1'); // (0,0)-(100,0)-(100,100)-(0,100)
    pointerDown({ x: 50, y: 50 }, NO_MOD, 'm1'); // dead center — far from any vertex/edge
    pointerMove({ x: 60, y: 60 }, NO_MOD);
    pointerUp();

    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }, { x: 10, y: 110 }],
    });
  });

  it('moves a Line by dragging near its path', () => {
    createLine('l1'); // (0,0)-(100,0)
    pointerDown({ x: 50, y: 2 }, NO_MOD, 'l1'); // near the path, within tolerance
    pointerMove({ x: 50, y: 12 }, NO_MOD); // +0,+10
    pointerUp();

    expect(measurementShape('l1')).toEqual({ type: 'line', from: { x: 0, y: 10 }, to: { x: 100, y: 10 } });
  });

  it('a click without drag commits nothing (avoids a no-op undo entry)', () => {
    createRectangle('r1');
    const before = measurementShape('r1');
    pointerDown({ x: 50, y: 25 }, NO_MOD, 'r1');
    pointerUp(); // no pointerMove in between — dx/dy stay 0

    expect(measurementShape('r1')).toEqual(before);
  });

  it('is undoable', () => {
    createRectangle('r1');
    const before = measurementShape('r1');
    pointerDown({ x: 50, y: 25 }, NO_MOD, 'r1');
    pointerMove({ x: 60, y: 45 }, NO_MOD);
    pointerUp();

    undo();
    expect(measurementShape('r1')).toEqual(before);
  });
});

describe('PD-024 — linked vertex drag', () => {
  // Two 100x100 squares side by side, sharing the edge x=100: left's vertex 1 (100,0) and right's
  // vertex 0 (100,0) are the same point.
  function createPolygon(id: string, vertices: { x: number; y: number }[]): void {
    executeCommand((surface) =>
      createMeasurementCommand({
        surface,
        layerId: 'layer1',
        measurementId: id,
        shapeParams: { type: 'polygon', vertices },
        identity: { name: id, color: '#2E7D32' },
        provenance: 'Manual',
      }),
    );
  }

  beforeEach(() => {
    createPolygon('left', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    createPolygon('right', [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }]);
  });

  it('previews every shape sharing the dragged vertex', () => {
    pointerDown({ x: 100, y: 0 }, NO_MOD, 'left');
    pointerMove({ x: 120, y: -20 }, NO_MOD);
    const drag = get(vertexDrag);
    expect(drag?.kind).toBe('vertex');
    if (drag?.kind !== 'vertex') return;
    expect(drag.linkedPreviews).toEqual([
      {
        measurementId: 'right',
        vertexIndex: 0,
        previewShape: { type: 'polygon', vertices: [{ x: 120, y: -20 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] },
      },
    ]);
  });

  it('pointerUp moves both shapes in one undoable step', () => {
    pointerDown({ x: 100, y: 0 }, NO_MOD, 'left');
    pointerMove({ x: 120, y: -20 }, NO_MOD);
    pointerUp();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 120, y: -20 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 120, y: -20 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });

    undo();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it.each([
    ['Ctrl', { ...NO_MOD, ctrlKey: true }],
    ['Cmd', { ...NO_MOD, metaKey: true }],
  ])('%s+drag moves only the selected shape', (_label, detach) => {
    pointerDown({ x: 100, y: 0 }, detach, 'left');
    pointerMove({ x: 120, y: -20 }, detach);
    const drag = get(vertexDrag);
    if (drag?.kind === 'vertex') expect(drag.linkedPreviews).toEqual([]);
    pointerUp();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 120, y: -20 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('a locked neighbour blocks the drag, same as dragging a locked shape', () => {
    setMeasurementLocked('right', true);
    pointerDown({ x: 100, y: 0 }, NO_MOD, 'left');
    expect(get(vertexDrag)).toBeNull();
  });

  it('a locked neighbour does not block Ctrl/Cmd+drag of the unlocked shape alone', () => {
    setMeasurementLocked('right', true);
    pointerDown({ x: 100, y: 0 }, { ...NO_MOD, ctrlKey: true }, 'left');
    expect(get(vertexDrag)?.kind).toBe('vertex');
  });

  it('freezes when the move would make a neighbour self-intersect', () => {
    pointerDown({ x: 100, y: 0 }, NO_MOD, 'left');
    pointerMove({ x: 120, y: -20 }, NO_MOD);
    const valid = get(vertexDrag);
    // valid for left, but right's edge (100,100)→(210,50) would cross its own edge (200,0)→(200,100)
    pointerMove({ x: 210, y: 50 }, NO_MOD);
    expect(get(vertexDrag)).toEqual(valid);
  });

  it('snap is not captured by the neighbour that moves along', () => {
    // (103,2) is within the 8-unit snap radius of right's own (100,0) — if the neighbour were a
    // snap target, the drag would jump straight back to where it started.
    pointerDown({ x: 100, y: 0 }, NO_MOD, 'left');
    pointerMove({ x: 103, y: 2 }, NO_MOD);
    pointerUp();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 103, y: 2 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
  });

  // left's edge 1 (100,0)→(100,100) is right's closing edge 3 (100,100)→(100,0).
  it('dragging a shared edge previews the new vertex in every shape sharing it', () => {
    pointerDown({ x: 100, y: 40 }, NO_MOD, 'left');
    pointerMove({ x: 130, y: 40 }, NO_MOD);
    const drag = get(vertexDrag);
    expect(drag?.kind).toBe('edge');
    if (drag?.kind !== 'edge') return;
    expect(drag.linkedPreviews).toEqual([
      {
        measurementId: 'right',
        edgeIndex: 3,
        previewShape: { type: 'polygon', vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 130, y: 40 }] },
      },
    ]);
  });

  it('pointerUp after a shared-edge drag inserts the vertex into both shapes in one undoable step', () => {
    pointerDown({ x: 100, y: 40 }, NO_MOD, 'left');
    pointerMove({ x: 130, y: 40 }, NO_MOD);
    pointerUp();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 130, y: 40 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 130, y: 40 }] });
    undo();
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('Ctrl/Cmd+drag on a shared edge inserts into the selected shape only', () => {
    const detach = { ...NO_MOD, metaKey: true };
    pointerDown({ x: 100, y: 40 }, detach, 'left');
    pointerMove({ x: 130, y: 40 }, detach);
    const drag = get(vertexDrag);
    if (drag?.kind === 'edge') expect(drag.linkedPreviews).toEqual([]);
    pointerUp();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 130, y: 40 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('a locked neighbour blocks a shared-edge drag unless Ctrl/Cmd detaches it', () => {
    setMeasurementLocked('right', true);
    pointerDown({ x: 100, y: 40 }, NO_MOD, 'left');
    expect(get(vertexDrag)).toBeNull();
    pointerDown({ x: 100, y: 40 }, { ...NO_MOD, ctrlKey: true }, 'left');
    expect(get(vertexDrag)?.kind).toBe('edge');
  });

  const ALT = { ...NO_MOD, altKey: true };

  it('Alt+click on a shared vertex removes it from both shapes in one undoable step', () => {
    pointerDown({ x: 100, y: 0 }, ALT, 'left');
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
    undo();
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('Ctrl/Cmd+Alt+click removes the vertex from the selected shape only', () => {
    pointerDown({ x: 100, y: 0 }, { ...ALT, ctrlKey: true }, 'left');
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('Alt+click is silently rejected when a neighbour would drop below 3 vertices', () => {
    createPolygon('tri', [{ x: 100, y: 100 }, { x: 150, y: 150 }, { x: 100, y: 150 }]);
    expect(() => pointerDown({ x: 100, y: 100 }, ALT, 'left')).not.toThrow();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });

  it('Alt+click is silently rejected when a neighbour is locked', () => {
    setMeasurementLocked('right', true);
    expect(() => pointerDown({ x: 100, y: 0 }, ALT, 'left')).not.toThrow();
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
  });

  it('a still Alt+click (deleteVertexAt) follows the same linked rules', () => {
    deleteVertexAt({ x: 100, y: 0 }, ALT, 'left');
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
    undo();
    deleteVertexAt({ x: 100, y: 0 }, { ...ALT, metaKey: true }, 'left');
    expect(measurementShape('left')).toMatchObject({ vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(measurementShape('right')).toMatchObject({ vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }] });
  });
});
