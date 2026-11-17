import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  vertexLabelDrag,
  pointerDown,
  pointerMove,
  pointerUp,
  cancelDrag,
  VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX,
} from './vertexLabelDragSession.js';

// Grilling session 2026-11-18 — same integration style as labelDragSession.test.ts: `scale=1`
// throughout so a screen-pixel delta equals a world-space delta 1:1, keeping the radius math in
// each test legible (so the clamp boundary is exactly VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX).

beforeEach(() => cancelDrag());

describe('vertexLabelDragSession — pointerDown/pointerMove/pointerUp lifecycle', () => {
  it('pointerDown seeds the live preview at the starting offset', () => {
    pointerDown('m1', 2, 500, 500, undefined);
    expect(get(vertexLabelDrag)).toEqual({ measurementId: 'm1', vertexIndex: 2, dx: 0, dy: 0 });
  });

  it('pointerMove updates the live preview by the screen delta while inside the radius', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(510, 505, 1); // +10x, +5y — well inside the 48px radius

    expect(get(vertexLabelDrag)).toEqual({ measurementId: 'm1', vertexIndex: 0, dx: 10, dy: 5 });
  });

  it('pointerMove clamps onto the radius edge once the candidate exceeds it, tracking direction', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(600, 500, 1); // dx=100 — well past the 48px radius, straight along +x

    const preview = get(vertexLabelDrag)!;
    expect(preview.dx).toBeCloseTo(VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX, 9);
    expect(preview.dy).toBeCloseTo(0, 9);
    expect(Math.hypot(preview.dx, preview.dy)).toBeCloseTo(VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX, 9);
  });

  it('clamps diagonally, preserving direction (not just axis-clamping each coordinate)', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(600, 600, 1); // candidate (100,100), distance ~141.4 — clamp to radius along the same 45° direction

    const preview = get(vertexLabelDrag)!;
    expect(Math.hypot(preview.dx, preview.dy)).toBeCloseTo(VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX, 9);
    expect(preview.dx).toBeCloseTo(preview.dy, 9); // still exactly on the 45° line
  });

  it('continues tracking the cursor smoothly around the rim rather than freezing at first contact', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(600, 500, 1); // clamped along +x
    const first = get(vertexLabelDrag)!;
    pointerMove(500, 600, 1); // now straight along +y, still past the radius
    const second = get(vertexLabelDrag)!;

    expect(first.dx).toBeCloseTo(VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX, 9);
    expect(second.dy).toBeCloseTo(VERTEX_LABEL_DRAG_RADIUS_SCREEN_PX, 9);
    expect(second.dx).toBeCloseTo(0, 9); // moved around the rim, not stuck at the first contact point
  });

  it('respects the current zoom scale when converting screen px to the world-space radius', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(600, 500, 2); // same 100 screen-px delta, but at 2x zoom -> 50 world units before clamp

    const preview = get(vertexLabelDrag)!;
    // world-space radius at scale=2 is 48/2 = 24
    expect(preview.dx).toBeCloseTo(24, 9);
  });

  it('pointerUp returns null (no commit) for a click that never crossed the drag threshold', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(501, 500, 1); // 1px — below the drag threshold

    expect(pointerUp()).toBeNull();
    expect(get(vertexLabelDrag)).toBeNull();
  });

  it('pointerUp returns the committed delta once the drag threshold is exceeded', () => {
    pointerDown('m1', 3, 500, 500, undefined);
    pointerMove(520, 500, 1); // 20px, well past the threshold

    expect(pointerUp()).toEqual({ measurementId: 'm1', vertexIndex: 3, dx: 20, dy: 0 });
    expect(get(vertexLabelDrag)).toBeNull(); // preview cleared either way
  });

  it('cancelDrag discards the live preview with no commit', () => {
    pointerDown('m1', 0, 500, 500, undefined);
    pointerMove(520, 500, 1);
    cancelDrag();
    expect(get(vertexLabelDrag)).toBeNull();
  });

  it('starts from an existing offset rather than always from zero', () => {
    pointerDown('m1', 0, 500, 500, { dx: 10, dy: -10 });
    expect(get(vertexLabelDrag)).toEqual({ measurementId: 'm1', vertexIndex: 0, dx: 10, dy: -10 });
    pointerMove(505, 495, 1); // +5x, -5y from the drag's own start
    expect(get(vertexLabelDrag)).toEqual({ measurementId: 'm1', vertexIndex: 0, dx: 15, dy: -15 });
  });
});
