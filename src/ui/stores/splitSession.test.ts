import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, executeCommand, setMeasurementLocked, setManualArea, undo } from './studioSession.js';
import { createMeasurementCommand } from '../../application/commands/createMeasurement.js';
import {
  splittingId,
  splitLinePoints,
  startSplit,
  cancelSplit,
  pointerDown,
  pointerMove,
  confirmSplit,
  splitConfigOpen,
  splitPartsCount,
  splitDistribution,
  splitPartsError,
  openSplitConfig,
  closeSplitConfig,
  confirmSplitParts,
  canStartSplit,
  toggleSplitTool,
} from './splitSession.js';
import { activeTool, setTool } from './drawingSession.js';
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

  // PO follow-up ("per-measurement lock") — same "protection from accidental editing" gate
  // vertexEditSession.ts's enterVertexEditing refuses on.
  it('startSplit no-ops for a locked Polygon', () => {
    createSquare('parcel');
    setMeasurementLocked('parcel', true);
    expect(startSplit('parcel')).toBe(false);
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

// 15 §2.2 / W1 (Photoshop layout, 2026-10-11) — the tool bar's Split slot: the same manual
// line split as the `X` key, disabled (never hidden) when the selection can't be split.
describe('tool bar Split slot (canStartSplit / toggleSplitTool)', () => {
  it('canStartSplit is true only for an unlocked Polygon while nothing is being split', () => {
    expect(canStartSplit(null)).toBe(false);
    createSquare('parcel');
    expect(canStartSplit('parcel')).toBe(true);
    startSplit('parcel');
    expect(canStartSplit('parcel')).toBe(false);
    cancelSplit();
    setMeasurementLocked('parcel', true);
    expect(canStartSplit('parcel')).toBe(false);
  });

  it('canStartSplit is false for a non-Polygon shape and an unknown id', () => {
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
    expect(canStartSplit('r1')).toBe(false);
    expect(canStartSplit('missing')).toBe(false);
  });

  it('toggleSplitTool starts a manual split and leaves an armed drawing tool', () => {
    createSquare('parcel');
    setTool('polygon');
    toggleSplitTool('parcel');
    expect(get(splittingId)).toBe('parcel');
    expect(get(activeTool)).toBeNull();
  });

  it('toggleSplitTool cancels a split already in progress (second click)', () => {
    createSquare('parcel');
    toggleSplitTool('parcel');
    pointerDown({ x: 5, y: -1 });
    toggleSplitTool('parcel');
    expect(get(splittingId)).toBeNull();
    expect(get(splitLinePoints)).toHaveLength(0);
  });

  it('toggleSplitTool is a no-op without a splittable selection, leaving the armed tool alone', () => {
    setTool('rectangle');
    toggleSplitTool(null);
    expect(get(splittingId)).toBeNull();
    expect(get(activeTool)).toBe('rectangle');
    setTool(null);
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

  // QA regression — splitIntoPartsCommand (Equal/Random) already inherits the parent's manual
  // area to its children; the older Manual-split (line-draw) path had no such inheritance at all,
  // silently dropping a manual area on split.
  it('inherits the parent manual area to both children, same as the Equal/Random path', () => {
    setManualArea('parcel', 1200); // 1200 m² over a 100 px² square -> factor 12
    pointerDown({ x: 5, y: -1 });
    pointerDown({ x: 5, y: 11 });
    confirmSplit();

    const children = allMeasurements().filter((m) => m.parentId === 'parcel');
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.manualArea).toEqual({ squareMetersPerSquarePixel: 12 });
    }
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

// PO request ("Redesign and fix Split functionality") — the new primary Equal/Random config UI:
// no canvas interaction, everything computed from the config stores on a single confirm call.
describe('split config UI (openSplitConfig / confirmSplitParts)', () => {
  beforeEach(() => {
    createSquare('parcel'); // 10x10 = 100 px², convex — provably splittable at any count/ratio
  });

  it('openSplitConfig opens for a Polygon and resets defaults, mutually exclusive with Manual split', () => {
    startSplit('parcel'); // Manual split active
    expect(openSplitConfig('parcel')).toBe(true);

    expect(get(splitConfigOpen)).toBe('parcel');
    expect(get(splitPartsCount)).toBe(2);
    expect(get(splitDistribution)).toBe('equal');
    expect(get(splittingId)).toBeNull(); // Manual split was cancelled
  });

  it('startSplit closes an open config, mutually exclusive the other way too', () => {
    openSplitConfig('parcel');
    startSplit('parcel');
    expect(get(splitConfigOpen)).toBeNull();
    expect(get(splittingId)).toBe('parcel');
  });

  it('closeSplitConfig clears the open id and any error', () => {
    openSplitConfig('parcel');
    splitPartsError.set('boom');
    closeSplitConfig();
    expect(get(splitConfigOpen)).toBeNull();
    expect(get(splitPartsError)).toBeNull();
  });

  it('confirmSplitParts creates N equal-area children summing back to the parent, closes the config', () => {
    openSplitConfig('parcel');
    splitPartsCount.set(3);
    splitDistribution.set('equal');

    confirmSplitParts();

    expect(get(splitConfigOpen)).toBeNull();
    const measurements = allMeasurements();
    const parent = measurements.find((m) => m.id === 'parcel')!;
    expect(parent.shape).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
    }); // parent untouched — "допълнение, не замяна"

    const children = measurements.filter((m) => m.parentId === 'parcel');
    expect(children).toHaveLength(3);
    const areas = children.map((c) => {
      if (c.shape.type !== 'polygon') throw new Error('expected polygon');
      const [first, ...rest] = c.shape.vertices;
      const pts = [first!, ...rest];
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        area += a.x * b.y - b.x * a.y;
      }
      return Math.abs(area) / 2;
    });
    for (const area of areas) expect(area).toBeCloseTo(100 / 3, 0); // ~equal, generous tolerance
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(100, 6); // sums exactly back to the parent
  });

  it('confirmSplitParts creates N children for a random distribution, still covering the whole parent', () => {
    openSplitConfig('parcel');
    splitPartsCount.set(4);
    splitDistribution.set('random');

    confirmSplitParts();

    const children = allMeasurements().filter((m) => m.parentId === 'parcel');
    expect(children).toHaveLength(4);
    const totalArea = children.reduce((sum, c) => {
      if (c.shape.type !== 'polygon') throw new Error('expected polygon');
      const [first, ...rest] = c.shape.vertices;
      const pts = [first!, ...rest];
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        area += a.x * b.y - b.x * a.y;
      }
      return sum + Math.abs(area) / 2;
    }, 0);
    expect(totalArea).toBeCloseTo(100, 6); // coverage/no-overlap — sums exactly back to the parent
  });

  it('an invalid count sets an inline error instead of committing anything', () => {
    openSplitConfig('parcel');
    splitPartsCount.set(1); // below the minimum of 2

    confirmSplitParts();

    expect(get(splitPartsError)).not.toBeNull();
    expect(get(splitConfigOpen)).toBe('parcel'); // stays open so the user can fix it
    expect(allMeasurements()).toHaveLength(1); // nothing committed
  });

  it('is undoable as one atomic step for the whole batch', () => {
    const beforeSplit = get(activeSurface);
    openSplitConfig('parcel');
    splitPartsCount.set(3);
    confirmSplitParts();
    expect(allMeasurements()).toHaveLength(4);

    undo();
    expect(get(activeSurface)).toEqual(beforeSplit);
  });

  // PO request (manual area) — children inherit the parent's manual-area scale factor verbatim,
  // which is what makes "1200 m² split into 3 equal parts -> ~400/400/400 m²" fall out of the
  // geometry alone (entities.ts's Measurement.manualArea doc, splitIntoParts.ts).
  it('children inherit the parent manual area, proportional to their own geometry, summing back to it', () => {
    setManualArea('parcel', 1200);
    openSplitConfig('parcel');
    splitPartsCount.set(3);
    splitDistribution.set('equal');

    confirmSplitParts();

    const children = allMeasurements().filter((m) => m.parentId === 'parcel');
    expect(children).toHaveLength(3);
    for (const child of children) expect(child.manualArea).toEqual(get(activeSurface)!.layers[0]!.measurements.find((m) => m.id === 'parcel')!.manualArea);

    const displayedAreas = children.map((child) => {
      if (child.shape.type !== 'polygon') throw new Error('expected polygon');
      const [first, ...rest] = child.shape.vertices;
      const pts = [first!, ...rest];
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        area += a.x * b.y - b.x * a.y;
      }
      const areaPx = Math.abs(area) / 2;
      return areaPx * child.manualArea!.squareMetersPerSquarePixel;
    });
    for (const area of displayedAreas) expect(area).toBeCloseTo(400, 0); // ~400/400/400
    expect(displayedAreas.reduce((s, a) => s + a, 0)).toBeCloseTo(1200, 6); // sums exactly back to 1200
  });
});
