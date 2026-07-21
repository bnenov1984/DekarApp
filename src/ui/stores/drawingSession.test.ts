import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface } from './studioSession.js';
import {
  activeTool,
  drawingDraft,
  cursorSurfacePoint,
  snapEnabled,
  setTool,
  toggleSnap,
  pointerDown,
  pointerMove,
  pointerUp,
  handleEnter,
  handleEscape,
} from './drawingSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Tool Dock interaction layer (docs/UI_CHECKPOINT_REVIEW.md next-slice) — exercises drawingSession
// against a real studioSession/CommandStack, same integration-seam approach as
// studioSession.test.ts, rather than mocking the commit path.

function blankSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'blank',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

function allMeasurements() {
  return get(activeSurface)!.layers.flatMap((l) => l.measurements);
}

beforeEach(() => {
  initStudioSession(blankSurface());
  setTool(null); // back to the neutral interaction state — clears any leftover draft/serial-arm
  snapEnabled.set(true);
});

describe('tool switching', () => {
  it('setTool updates the active tool', () => {
    setTool('polygon');
    expect(get(activeTool)).toBe('polygon');
  });

  it('switching tools cancels any in-progress draft', () => {
    setTool('polygon');
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 50, y: 0 });
    expect(get(drawingDraft)).not.toBeNull();

    setTool('rectangle');
    expect(get(drawingDraft)).toBeNull();
    expect(get(activeTool)).toBe('rectangle');
  });

  // PO follow-up ("replace Select tool with Pan" / "neutral interaction state") — neither the
  // neutral state (`null`, direct selection/drag-to-edit lives in studioSession.ts/CanvasStage.svelte,
  // not here) nor the explicit Pan tool ever populates `drawingDraft` — same role 'select' used to
  // play in this file before both existed.
  it('pointerDown/pointerMove are no-ops in the neutral interaction state', () => {
    pointerDown({ x: 0, y: 0 });
    expect(get(drawingDraft)).toBeNull();
    pointerMove({ x: 10, y: 10 });
    expect(get(drawingDraft)).toBeNull();
    expect(get(cursorSurfacePoint)).toBeNull();
  });

  it('pointerDown/pointerMove are no-ops while the explicit Pan tool is active', () => {
    setTool('pan');
    pointerDown({ x: 0, y: 0 });
    expect(get(drawingDraft)).toBeNull();
    pointerMove({ x: 10, y: 10 });
    expect(get(drawingDraft)).toBeNull();
    expect(get(cursorSurfacePoint)).toBeNull();
  });
});

describe('polygon — point accumulation and closing', () => {
  beforeEach(() => setTool('polygon'));

  it('accumulates a vertex per click', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    const draft = get(drawingDraft);
    expect(draft?.kind).toBe('points');
    if (draft?.kind === 'points') expect(draft.points).toHaveLength(2);
  });

  it('pointerMove updates the live cursor position without adding a vertex', () => {
    pointerDown({ x: 0, y: 0 });
    pointerMove({ x: 40, y: 5 });
    expect(get(cursorSurfacePoint)).toEqual({ x: 40, y: 5 });
    const draft = get(drawingDraft);
    if (draft?.kind === 'points') expect(draft.points).toHaveLength(1);
  });

  it('clicking near the first vertex before 3 points exist does not close (canClose gate)', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 1, y: 1 }); // within snap tolerance of the first vertex, but only 2 points
    const draft = get(drawingDraft);
    expect(draft?.kind).toBe('points');
    if (draft?.kind === 'points') expect(draft.points).toHaveLength(2); // treated as a normal vertex, not a close
    expect(allMeasurements()).toHaveLength(0);
  });

  it('closes via self-snap to the first vertex once >= 3 points exist, without adding a 4th vertex', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    pointerDown({ x: 100, y: 100 });
    pointerDown({ x: 2, y: 2 }); // within tolerance of (0,0) — closes

    expect(get(drawingDraft)).toBeNull();
    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]!.shape).toEqual({
      type: 'polygon',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    });
  });

  it('Enter closes once >= 3 points exist', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    pointerDown({ x: 100, y: 100 });
    handleEnter();
    expect(get(drawingDraft)).toBeNull();
    expect(allMeasurements()).toHaveLength(1);
  });

  it('Enter is a no-op with fewer than 3 points', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    handleEnter();
    expect(get(drawingDraft)).not.toBeNull();
    expect(allMeasurements()).toHaveLength(0);
  });

  it('Escape cancels the draft with no trace, without changing the active tool', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    handleEscape();
    expect(get(drawingDraft)).toBeNull();
    expect(get(cursorSurfacePoint)).toBeNull();
    expect(get(activeTool)).toBe('polygon');
    expect(allMeasurements()).toHaveLength(0);
  });

  it('reverts to the neutral interaction state after a non-serial commit', () => {
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    pointerDown({ x: 100, y: 100 });
    handleEnter();
    expect(get(activeTool)).toBeNull();
  });

  it('stays armed on the tool when activated with Shift (serial drawing)', () => {
    setTool('polygon', { keepArmed: true });
    pointerDown({ x: 0, y: 0 });
    pointerDown({ x: 100, y: 0 });
    pointerDown({ x: 100, y: 100 });
    handleEnter();
    expect(get(activeTool)).toBe('polygon');
  });
});

describe('rectangle — drag commit', () => {
  beforeEach(() => setTool('rectangle'));

  it('commits a rectangle from origin/current on pointerUp', () => {
    pointerDown({ x: 10, y: 20 });
    pointerMove({ x: 60, y: 90 });
    pointerUp({ x: 60, y: 90 });

    expect(get(drawingDraft)).toBeNull();
    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]!.shape).toEqual({
      type: 'rectangle',
      origin: { x: 10, y: 20 },
      width: 50,
      height: 70,
      rotation: 0,
    });
  });

  it('discards a click-without-drag (degenerate rectangle) silently', () => {
    pointerDown({ x: 10, y: 20 });
    pointerUp({ x: 10, y: 20 });
    expect(get(drawingDraft)).toBeNull();
    expect(allMeasurements()).toHaveLength(0);
    expect(get(activeTool)).toBe('rectangle'); // nothing committed, stays armed
  });
});

describe('circle — drag commit', () => {
  beforeEach(() => setTool('circle'));

  it('commits a circle with the drag distance as radius', () => {
    pointerDown({ x: 0, y: 0 });
    pointerMove({ x: 30, y: 0 });
    pointerUp({ x: 30, y: 0 });

    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]!.shape).toEqual({ type: 'circle', center: { x: 0, y: 0 }, radius: 30 });
  });
});

describe('line (distance) — two-click commit', () => {
  beforeEach(() => setTool('line'));

  it('commits immediately on the second click', () => {
    pointerDown({ x: 0, y: 0 });
    expect(allMeasurements()).toHaveLength(0);

    pointerDown({ x: 40, y: 40 });
    expect(get(drawingDraft)).toBeNull();
    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]!.shape).toEqual({ type: 'line', from: { x: 0, y: 0 }, to: { x: 40, y: 40 } });
  });
});

describe('freehand — trace commit', () => {
  beforeEach(() => setTool('freehand'));

  it('traces points during the drag and commits an open path on release far from the start', () => {
    pointerDown({ x: 0, y: 0 });
    pointerMove({ x: 10, y: 0 });
    pointerMove({ x: 20, y: 0 });
    pointerUp({ x: 20, y: 0 });

    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]!.shape.type).toBe('freehand');
    if (measurements[0]!.shape.type === 'freehand') {
      expect(measurements[0]!.shape.closed).toBe(false);
      expect(measurements[0]!.shape.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('commits a closed path when released back near the start point', () => {
    pointerDown({ x: 0, y: 0 });
    pointerMove({ x: 50, y: 0 });
    pointerMove({ x: 50, y: 50 });
    pointerMove({ x: 2, y: 2 }); // back near start
    pointerUp({ x: 2, y: 2 });

    const measurements = allMeasurements();
    expect(measurements).toHaveLength(1);
    if (measurements[0]!.shape.type === 'freehand') {
      expect(measurements[0]!.shape.closed).toBe(true);
    }
  });

  it('discards a click-without-drag (fewer than 2 points)', () => {
    pointerDown({ x: 0, y: 0 });
    pointerUp({ x: 0, y: 0 });
    expect(allMeasurements()).toHaveLength(0);
  });
});

describe('snap toggle', () => {
  it('toggleSnap flips the persistent snap-enabled preference', () => {
    expect(get(snapEnabled)).toBe(true);
    toggleSnap();
    expect(get(snapEnabled)).toBe(false);
    toggleSnap();
    expect(get(snapEnabled)).toBe(true);
  });
});
