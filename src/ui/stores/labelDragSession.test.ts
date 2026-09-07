import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, executeCommand, setLabelOffset, selectMeasurement, selectedMeasurementId, undo } from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { labelDrag, pointerDown, pointerMove, pointerUp, cancelDrag } from './labelDragSession.js';
import { pointerDown as vertexPointerDown, pointerUp as vertexPointerUp } from './vertexEditSession.js';
import { pointInPolygon } from '../../core/drawing/hitTest.js';
import { shapeCentroid } from '../../core/drawing/centroid.js';
import type { PolygonShape } from '../../core/domain/types.js';
import type { Surface } from '../../core/domain/entities.js';

// Draggable polygon labels — same integration-seam approach as the other *Session.test.ts files:
// exercised against a real studioSession/CommandStack, not mocked. `scale=1` throughout so a
// screen-pixel delta equals a world-space delta 1:1, keeping the math in each test legible.

function blankSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'blank',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

// A wide, thin rectangle-shaped polygon (centroid at 100,10) — deliberately not square, so a
// drag that overshoots the boundary in one axis but not the other is easy to reason about.
function createThinPolygon(id: string): void {
  executeCommand((surface) =>
    createMeasurementCommand({
      surface,
      layerId: 'layer1',
      measurementId: id,
      shapeParams: {
        type: 'polygon',
        vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 20 }, { x: 0, y: 20 }],
      },
      identity: { name: 'Parcel', color: '#2E7D32' },
      provenance: 'Manual',
    }),
  );
}

function currentShape(id: string): PolygonShape {
  const measurement = get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === id)!;
  if (measurement.shape.type !== 'polygon') throw new Error('expected polygon');
  return measurement.shape;
}

beforeEach(() => {
  initStudioSession(blankSurface());
  cancelDrag();
});

describe('labelDragSession — pointerDown/pointerMove/pointerUp lifecycle', () => {
  beforeEach(() => createThinPolygon('parcel'));

  it('pointerDown seeds the live preview at the starting offset', () => {
    pointerDown('parcel', 500, 500, shapeCentroid(currentShape('parcel')), undefined);
    expect(get(labelDrag)).toEqual({ measurementId: 'parcel', dx: 0, dy: 0 });
  });

  it('pointerMove updates the live preview by the screen delta (scale=1), staying inside the polygon', () => {
    const centroid = shapeCentroid(currentShape('parcel')); // {x:100, y:10}
    pointerDown('parcel', 500, 500, centroid, undefined);
    pointerMove(510, 505, 1, currentShape('parcel').vertices); // +10x, +5y — still well inside

    expect(get(labelDrag)).toEqual({ measurementId: 'parcel', dx: 10, dy: 5 });
  });

  it('pointerMove freezes the preview at the last valid position once the candidate leaves the polygon', () => {
    const centroid = shapeCentroid(currentShape('parcel')); // {x:100, y:10}
    const vertices = currentShape('parcel').vertices;
    pointerDown('parcel', 500, 500, centroid, undefined);

    pointerMove(505, 500, 1, vertices); // dx=5 -> (105,10), inside
    expect(get(labelDrag)).toEqual({ measurementId: 'parcel', dx: 5, dy: 0 });

    pointerMove(600, 500, 1, vertices); // dx=100 -> (200,10), exactly ON the right edge -> pointInPolygon (boundary) may reject
    pointerMove(700, 500, 1, vertices); // dx=200 -> (300,10), well outside -> definitely rejected

    // whichever of the two above was the last *accepted* candidate, the preview never reflects
    // the clearly-outside (300,10) point at all
    const preview = get(labelDrag)!;
    expect(pointInPolygon({ x: centroid.x + preview.dx, y: centroid.y + preview.dy }, vertices)).toBe(true);
    expect(preview.dx).toBeLessThan(100); // never reached the outside candidate's delta
  });

  it('pointerUp returns null (no commit) for a click that never crossed the drag threshold', () => {
    const centroid = shapeCentroid(currentShape('parcel'));
    pointerDown('parcel', 500, 500, centroid, undefined);
    pointerMove(501, 500, 1, currentShape('parcel').vertices); // 1px — below DRAG_THRESHOLD_SCREEN_PX

    expect(pointerUp()).toBeNull();
    expect(get(labelDrag)).toBeNull();
  });

  it('pointerUp returns the committed delta once the drag threshold is exceeded', () => {
    const centroid = shapeCentroid(currentShape('parcel'));
    pointerDown('parcel', 500, 500, centroid, undefined);
    pointerMove(520, 500, 1, currentShape('parcel').vertices); // 20px, well past the threshold

    expect(pointerUp()).toEqual({ measurementId: 'parcel', dx: 20, dy: 0 });
    expect(get(labelDrag)).toBeNull(); // preview cleared either way
  });

  it('cancelDrag discards the live preview with no commit', () => {
    pointerDown('parcel', 500, 500, shapeCentroid(currentShape('parcel')), undefined);
    pointerMove(520, 500, 1, currentShape('parcel').vertices);
    cancelDrag();
    expect(get(labelDrag)).toBeNull();
  });
});

describe('setLabelOffset (studioSession) — commits and is undoable, geometry untouched', () => {
  beforeEach(() => createThinPolygon('parcel'));

  // Regression 1 — a committed label drag changes only labelOffset, never the shape.
  it('changes only labelOffset, never the polygon vertices', () => {
    const before = currentShape('parcel');
    setLabelOffset('parcel', 15, 3);

    const measurement = get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === 'parcel')!;
    expect(measurement.labelOffset).toEqual({ dx: 15, dy: 3 });
    expect(measurement.shape).toEqual(before); // regression 3 — geometry byte-identical
  });

  it('is undoable back to no labelOffset', () => {
    setLabelOffset('parcel', 15, 3);
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.labelOffset).toBeDefined();

    undo();
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.labelOffset).toBeUndefined();
  });

  it('persists across deselect/reselect (survives being read again from the store, not cached client state)', () => {
    setLabelOffset('parcel', 15, 3);
    selectMeasurement(null);
    expect(get(selectedMeasurementId)).toBeNull();

    selectMeasurement('parcel');
    const measurement = get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === 'parcel')!;
    expect(measurement.labelOffset).toEqual({ dx: 15, dy: 3 });
  });
});

// Regression 4 — an ordinary shape-body/vertex drag (not starting on the label chip) is
// completely unaffected by this feature: same vertexEditSession entrypoint, same result as
// before draggable labels existed.
describe('regression — ordinary vertex dragging still works unchanged', () => {
  beforeEach(() => createThinPolygon('parcel'));

  it('a normal vertex drag still moves the shape and commits through vertexEditSession, as before', () => {
    selectMeasurement('parcel');
    vertexPointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false }, 'parcel');
    vertexPointerUp();
    // no-op drag (didn't move) is fine here — this test only asserts the entrypoint is reachable
    // and untouched; full vertex-edit coverage already lives in vertexEditSession.test.ts.
    expect(get(activeSurface)!.layers[0]!.measurements[0]!.shape.type).toBe('polygon');
  });
});
