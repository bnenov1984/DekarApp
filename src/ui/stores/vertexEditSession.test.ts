import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, executeCommand, selectedMeasurementId, undo } from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import {
  vertexEditingId,
  vertexDrag,
  enterVertexEditing,
  exitVertexEditing,
  pointerDown,
  pointerMove,
  pointerUp,
} from './vertexEditSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Vertex Editing slice — same integration-seam approach as the other *Session.test.ts files:
// exercised against a real studioSession/CommandStack, not mocked.

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

function measurementShape(id: string) {
  return get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === id)!.shape;
}

const NO_MOD = { shiftKey: false, altKey: false };

beforeEach(() => {
  initStudioSession(blankSurface());
  exitVertexEditing();
});

describe('entering and exiting', () => {
  it('enterVertexEditing succeeds for a Polygon and also selects it', () => {
    createSquare('m1');
    expect(enterVertexEditing('m1')).toBe(true);
    expect(get(vertexEditingId)).toBe('m1');
    expect(get(selectedMeasurementId)).toBe('m1');
  });

  it('enterVertexEditing no-ops for shape types with no editable point list', () => {
    executeCommand((surface) =>
      createMeasurementCommand({
        surface,
        layerId: 'layer1',
        measurementId: 'r1',
        shapeParams: { type: 'rectangle', origin: { x: 0, y: 0 }, width: 10, height: 10 },
        identity: { name: 'Rect', color: '#1565C0' },
        provenance: 'Manual',
      }),
    );
    expect(enterVertexEditing('r1')).toBe(false);
    expect(get(vertexEditingId)).toBeNull();
  });

  it('exitVertexEditing clears both the editing id and any drag', () => {
    createSquare('m1');
    enterVertexEditing('m1');
    pointerDown({ x: 0, y: 0 }, NO_MOD);
    expect(get(vertexDrag)).not.toBeNull();

    exitVertexEditing();
    expect(get(vertexEditingId)).toBeNull();
    expect(get(vertexDrag)).toBeNull();
  });
});

describe('vertex drag', () => {
  beforeEach(() => {
    createSquare('m1');
    enterVertexEditing('m1');
  });

  it('mousedown on a vertex starts a vertex drag', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD); // vertex 0
    const drag = get(vertexDrag);
    expect(drag?.kind).toBe('vertex');
    if (drag?.kind === 'vertex') expect(drag.index).toBe(0);
  });

  it('pointerMove updates the live preview without committing', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD);
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
    pointerDown({ x: 0, y: 0 }, NO_MOD);
    pointerMove({ x: -20, y: -20 }, NO_MOD);
    pointerUp();

    expect(get(vertexDrag)).toBeNull();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: -20, y: -20 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('is undoable through the normal CommandStack undo', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD);
    pointerMove({ x: -20, y: -20 }, NO_MOD);
    pointerUp();

    undo();
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('an invalid candidate (would self-intersect) freezes the preview at the last valid position', () => {
    pointerDown({ x: 0, y: 0 }, NO_MOD); // dragging vertex 0
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
    enterVertexEditing('m1');
  });

  it('mousedown on an edge starts an edge drag and previews an inserted vertex', () => {
    pointerDown({ x: 50, y: 0 }, NO_MOD); // midpoint of the top edge (0,0)-(100,0)
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
    pointerDown({ x: 50, y: 0 }, NO_MOD);
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
    enterVertexEditing('m1');
  });

  it('removes the clicked vertex via removeVertexCommand', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: true });
    expect(get(vertexDrag)).toBeNull(); // deletion is immediate, not a drag
    expect(measurementShape('m1')).toEqual({
      type: 'polygon',
      vertices: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
    });
  });

  it('silently rejects a deletion that would leave fewer than 3 vertices', () => {
    // delete down to a triangle first
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: true });
    // now try to delete two more, reaching the 3-vertex floor
    pointerDown({ x: 100, y: 0 }, { shiftKey: false, altKey: true });
    pointerDown({ x: 100, y: 100 }, { shiftKey: false, altKey: true });
    const shapeAtFloor = measurementShape('m1');
    if (shapeAtFloor.type !== 'polygon') throw new Error('expected polygon');
    expect(shapeAtFloor.vertices).toHaveLength(3);

    // one more attempt must be silently rejected (18 §6 TOO_FEW_VERTICES)
    pointerDown({ x: 0, y: 100 }, { shiftKey: false, altKey: true });
    expect(measurementShape('m1')).toEqual(shapeAtFloor);
  });
});
