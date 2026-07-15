import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, executeCommand, undo } from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import { splittingId, splitLinePoints, startSplit, cancelSplit, pointerDown, pointerMove, confirmSplit } from './splitSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Split slice — same integration-seam approach as the other *Session.test.ts files: exercised
// against a real studioSession/CommandStack, not mocked.

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
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      },
      identity: { name: 'Parcel', color: '#2E7D32' },
      provenance: 'Manual',
    }),
  );
}

function allMeasurements() {
  return get(activeSurface)!.layers[0]!.measurements;
}

beforeEach(() => {
  initStudioSession(blankSurface());
  cancelSplit();
});

describe('starting and cancelling', () => {
  it('startSplit succeeds for a Polygon', () => {
    createSquare('parcel');
    expect(startSplit('parcel')).toBe(true);
    expect(get(splittingId)).toBe('parcel');
  });

  it('startSplit no-ops for a non-Polygon shape', () => {
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
    expect(startSplit('r1')).toBe(false);
    expect(get(splittingId)).toBeNull();
  });

  it('cancelSplit clears the line with no trace', () => {
    createSquare('parcel');
    startSplit('parcel');
    pointerDown({ x: 5, y: -1 });
    pointerDown({ x: 5, y: 11 });
    expect(get(splitLinePoints)).toHaveLength(2);

    cancelSplit();
    expect(get(splittingId)).toBeNull();
    expect(get(splitLinePoints)).toHaveLength(0);
  });

  it('pointerDown/pointerMove are no-ops when not splitting', () => {
    pointerDown({ x: 0, y: 0 });
    pointerMove({ x: 1, y: 1 });
    expect(get(splitLinePoints)).toHaveLength(0);
  });
});

describe('confirmSplit', () => {
  beforeEach(() => {
    createSquare('parcel');
    startSplit('parcel');
  });

  it('is a no-op while the line crosses the boundary fewer than exactly twice', () => {
    pointerDown({ x: 5, y: -1 }); // one point only — can't cross twice yet
    confirmSplit();
    expect(allMeasurements()).toHaveLength(1); // just the parent, nothing added
    expect(get(splittingId)).toBe('parcel'); // still mid-flow
  });

  it('commits two children and leaves the parent untouched once the line crosses exactly twice', () => {
    pointerDown({ x: 5, y: -1 });
    pointerDown({ x: 5, y: 11 }); // vertical line straight through the square
    confirmSplit();

    expect(get(splittingId)).toBeNull(); // Split mode exited after commit
    const measurements = allMeasurements();
    expect(measurements).toHaveLength(3); // parent + 2 children

    const parent = measurements.find((m) => m.id === 'parcel')!;
    expect(parent.shape).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    }); // PD-009 — parent never mutated

    const children = measurements.filter((m) => m.parentId === 'parcel');
    expect(children).toHaveLength(2);
    const totalArea = children.reduce((sum, c) => {
      if (c.shape.type !== 'polygon') throw new Error('expected polygon');
      const [first, ...rest] = c.shape.vertices;
      let area = 0;
      const pts = [first!, ...rest];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        area += a.x * b.y - b.x * a.y;
      }
      return sum + Math.abs(area) / 2;
    }, 0);
    expect(totalArea).toBeCloseTo(100, 8); // INV-4 — children partition the parent's area exactly
  });

  it('a hovered (not yet clicked) cursor position is never committed — only placed points are', () => {
    pointerDown({ x: 5, y: -1 });
    pointerMove({ x: 5, y: 11 }); // second point only hovered, not clicked
    confirmSplit(); // confirmSplit only ever commits *placed* points — still just 1 point here
    expect(allMeasurements()).toHaveLength(1); // no commit — matches Polygon/Line's "cursor is preview-only" rule
  });

  it('is undoable — removes exactly the two children, parent and Surface otherwise identical', () => {
    const beforeSplit = get(activeSurface);
    pointerDown({ x: 5, y: -1 });
    pointerDown({ x: 5, y: 11 });
    confirmSplit();
    expect(allMeasurements()).toHaveLength(3);

    undo();
    expect(get(activeSurface)).toEqual(beforeSplit);
  });
});
