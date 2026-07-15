import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, undo } from './studioSession.js';
import { activeTool, setTool } from './drawingSession.js';
import {
  calibrating,
  calibrationDraft,
  plausibilityWarning,
  startCalibration,
  cancelCalibration,
  redrawLine,
  pointerDown,
  pointerMove,
  commitCalibration,
} from './calibrationSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Calibration UI slice — same integration-seam approach as drawingSession.test.ts/
// studioSession.test.ts: exercised against a real studioSession/CommandStack, not mocked.

function blankSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'blank',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

beforeEach(() => {
  initStudioSession(blankSurface());
  cancelCalibration();
  plausibilityWarning.set(null);
});

describe('starting and cancelling', () => {
  it('startCalibration arms calibration mode and discards any active drawing tool', () => {
    setTool('polygon');
    startCalibration();
    expect(get(calibrating)).toBe(true);
    expect(get(activeTool)).toBe('select');
  });

  it('cancelCalibration clears the draft with no trace', () => {
    startCalibration();
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 100, y: 0 }, { shiftKey: false, altKey: false });
    expect(get(calibrationDraft)).not.toBeNull();

    cancelCalibration();
    expect(get(calibrating)).toBe(false);
    expect(get(calibrationDraft)).toBeNull();
  });

  it('pointerDown is a no-op when calibration mode is not active', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    expect(get(calibrationDraft)).toBeNull();
  });
});

describe('two-click reference line capture', () => {
  beforeEach(() => startCalibration());

  it('first click places the start point', () => {
    pointerDown({ x: 10, y: 10 }, { shiftKey: false, altKey: false });
    const draft = get(calibrationDraft);
    expect(draft).toEqual({ from: { x: 10, y: 10 } });
  });

  it('second click places the end point', () => {
    pointerDown({ x: 10, y: 10 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 210, y: 10 }, { shiftKey: false, altKey: false });
    const draft = get(calibrationDraft);
    expect(draft).toEqual({ from: { x: 10, y: 10 }, to: { x: 210, y: 10 } });
  });

  it('further clicks are ignored once both points are placed (waiting on numeric input)', () => {
    pointerDown({ x: 10, y: 10 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 210, y: 10 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 999, y: 999 }, { shiftKey: false, altKey: false });
    expect(get(calibrationDraft)).toEqual({ from: { x: 10, y: 10 }, to: { x: 210, y: 10 } });
  });

  it('pointerMove tracks the live cursor without placing a point', () => {
    pointerDown({ x: 10, y: 10 }, { shiftKey: false, altKey: false });
    pointerMove({ x: 50, y: 10 }, { shiftKey: false, altKey: false });
    expect(get(calibrationDraft)).toEqual({ from: { x: 10, y: 10 } });
  });

  it('Redraw clears only the line, calibration mode stays active', () => {
    pointerDown({ x: 10, y: 10 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 210, y: 10 }, { shiftKey: false, altKey: false });
    redrawLine();
    expect(get(calibrationDraft)).toBeNull();
    expect(get(calibrating)).toBe(true);
  });
});

describe('commitCalibration', () => {
  beforeEach(() => startCalibration());

  it('produces the exact Calibration fromReferenceLine would, via the CommandStack', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 200, y: 0 }, { shiftKey: false, altKey: false }); // 200px reference line
    commitCalibration(10, 'm', 800, 600); // 200px = 10m -> 0.05 m/px

    const surface = get(activeSurface)!;
    expect(surface.calibration).toEqual({ kind: 'linear', metersPerPixel: 0.05 });
  });

  it('exits calibration mode and clears the draft after commit', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 200, y: 0 }, { shiftKey: false, altKey: false });
    commitCalibration(10, 'm', 800, 600);

    expect(get(calibrating)).toBe(false);
    expect(get(calibrationDraft)).toBeNull();
  });

  it('is undoable through the normal CommandStack undo', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 200, y: 0 }, { shiftKey: false, altKey: false });
    commitCalibration(10, 'm', 800, 600);
    expect(get(activeSurface)!.calibration).not.toBeNull();

    undo();
    expect(get(activeSurface)!.calibration).toBeNull();
  });

  it('is a no-op if the line has only one point placed', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    commitCalibration(10, 'm', 800, 600);
    expect(get(activeSurface)!.calibration).toBeNull();
    expect(get(calibrating)).toBe(true); // still mid-flow, nothing committed
  });

  it('is a no-op for a non-positive real length', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 200, y: 0 }, { shiftKey: false, altKey: false });
    commitCalibration(0, 'm', 800, 600);
    expect(get(activeSurface)!.calibration).toBeNull();
  });

  it('records a plausibility warning for an implausible scale', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 10, y: 0 }, { shiftKey: false, altKey: false }); // 10px reference line
    commitCalibration(1000, 'm', 800, 600); // wildly wrong: 10px = 1000m

    const warning = get(plausibilityWarning);
    expect(warning?.plausible).toBe(false);
  });

  it('records a plausible result for a realistic backyard-sized calibration', () => {
    pointerDown({ x: 0, y: 0 }, { shiftKey: false, altKey: false });
    pointerDown({ x: 200, y: 0 }, { shiftKey: false, altKey: false });
    commitCalibration(10, 'm', 800, 600);

    const warning = get(plausibilityWarning);
    expect(warning?.plausible).toBe(true);
  });
});
