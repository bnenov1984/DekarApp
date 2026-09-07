import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { initStudioSession, activeSurface, undo } from './studioSession.js';
import {
  effectiveImageRect,
  findImageCornerAt,
  pointInRect,
  resizeRectAspectLocked,
  imageResizeDrag,
  pointerDown,
  pointerMove,
  pointerUp,
  isResizing,
} from './imageResizeSession.js';
import type { Surface } from '../../core/domain/entities.js';

// Resizable/movable/lockable imported image (PO request, iterated twice after live testing: first
// pass free-resized like a Rectangle, corrected to keep the image's aspect ratio; a click-without-
// drag no-commit guard and a measurement-priority guard were added for the same reasons
// vertexEditSession.ts's whole-shape move needed them) — same integration-seam approach as the
// other *Session.test.ts files: exercised against a real studioSession/CommandStack, not mocked.

function imageSurface(): Surface {
  return {
    id: 'surface1',
    kind: 'image',
    calibration: null,
    layers: [{ id: 'layer1', name: 'Default', visible: true, order: 0, measurements: [] }],
  };
}

describe('effectiveImageRect', () => {
  it('falls back to the contain-fit default when Surface.imageRect is unset', () => {
    const rect = effectiveImageRect(imageSurface(), 400, 200, 100, 100);
    expect(rect).toEqual({ origin: { x: 0, y: 25 }, width: 100, height: 50 });
  });

  it('returns the explicit imageRect once the Surface has one, ignoring bitmap/box size', () => {
    const surface: Surface = { ...imageSurface(), imageRect: { origin: { x: 5, y: 5 }, width: 40, height: 30 } };
    expect(effectiveImageRect(surface, 999, 999, 999, 999)).toEqual({ origin: { x: 5, y: 5 }, width: 40, height: 30 });
  });

  it('returns null for a degenerate (zero-size) contain-fit result', () => {
    expect(effectiveImageRect(imageSurface(), 0, 0, 100, 100)).toBeNull();
  });
});

describe('findImageCornerAt', () => {
  it('finds the corner within tolerance and returns null outside it', () => {
    const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 };
    expect(findImageCornerAt({ x: 1, y: 1 }, rect)).toBe(0);
    expect(findImageCornerAt({ x: 100, y: 50 }, rect)).toBe(2);
    expect(findImageCornerAt({ x: 50, y: 25 }, rect)).toBeNull(); // center — nowhere near a corner
  });
});

// Exported (PO follow-up, background layer selectability) — CanvasStage's click-to-select reuses
// this same bounds check to decide whether a miss on every Measurement still landed on the
// background image (select it) or truly empty canvas (deselect).
describe('pointInRect', () => {
  const rect = { origin: { x: 10, y: 10 }, width: 100, height: 50 };

  it('is true for a point inside the bounds, including on the edge', () => {
    expect(pointInRect({ x: 50, y: 30 }, rect)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true);
    expect(pointInRect({ x: 110, y: 60 }, rect)).toBe(true);
  });

  it('is false for a point outside the bounds', () => {
    expect(pointInRect({ x: 500, y: 500 }, rect)).toBe(false);
    expect(pointInRect({ x: 9, y: 30 }, rect)).toBe(false);
  });
});

describe('resizeRectAspectLocked', () => {
  const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 }; // 2:1 aspect ratio

  it('keeps the aspect ratio when the drag is width-dominant', () => {
    const result = resizeRectAspectLocked(rect, 2, { x: 200, y: 60 }, 2); // bottom-right corner, opposite fixed at (0,0)
    expect(result).toEqual({ origin: { x: 0, y: 0 }, width: 200, height: 100 });
  });

  it('keeps the aspect ratio when the drag is height-dominant', () => {
    const result = resizeRectAspectLocked(rect, 2, { x: 120, y: 100 }, 2);
    expect(result).toEqual({ origin: { x: 0, y: 0 }, width: 200, height: 100 });
  });

  it('keeps the fixed corner fixed regardless of which quadrant the drag lands in', () => {
    // dragging the bottom-right handle up and to the LEFT of the fixed top-left corner flips it
    const result = resizeRectAspectLocked(rect, 2, { x: -40, y: -30 }, 2);
    expect(result).toEqual({ origin: { x: -60, y: -30 }, width: 60, height: 30 }); // anchored left/up of (0,0)
    expect(result.width / result.height).toBeCloseTo(2);
  });

  it('throws on a degenerate (zero-size) result — dragged onto the fixed corner', () => {
    expect(() => resizeRectAspectLocked(rect, 2, { x: 0, y: 0 }, 2)).toThrow();
  });
});

describe('studioSession — image resize/move drag (pointerDown/Move/Up)', () => {
  beforeEach(() => {
    initStudioSession(imageSurface());
    pointerUp(); // defensive: clears any drag state a prior (possibly failing) test left mid-drag
  });

  it('resize: drags the opposite corner fixed, keeps aspect ratio, previews live, commits on pointerUp, is undoable', () => {
    const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 }; // 2:1

    const started = pointerDown({ x: 0, y: 0 }, rect, 2, false, false); // top-left corner, unlocked, no measurement here
    expect(started).toBe(true);
    expect(isResizing()).toBe(true);

    pointerMove({ x: -40, y: -30 }); // drag top-left further out
    expect(get(imageResizeDrag)!.width / get(imageResizeDrag)!.height).toBeCloseTo(2); // aspect preserved
    expect(get(activeSurface)!.imageRect).toBeUndefined(); // no Command yet — commit is pointerUp-only

    pointerUp();
    expect(isResizing()).toBe(false);
    expect(get(imageResizeDrag)).toBeNull();
    const committed = get(activeSurface)!.imageRect!;
    expect(committed.width / committed.height).toBeCloseTo(2);

    undo();
    expect(get(activeSurface)!.imageRect).toBeUndefined();
  });

  it('move: translates the rect rigidly (size unchanged) and is undoable', () => {
    const rect = { origin: { x: 10, y: 10 }, width: 100, height: 50 };
    pointerDown({ x: 50, y: 30 }, rect, 2, false, false); // inside the body, not a corner

    pointerMove({ x: 70, y: 50 }); // +20, +20
    expect(get(imageResizeDrag)).toEqual({ origin: { x: 30, y: 30 }, width: 100, height: 50 });

    pointerUp();
    expect(get(activeSurface)!.imageRect).toEqual({ origin: { x: 30, y: 30 }, width: 100, height: 50 });

    undo();
    expect(get(activeSurface)!.imageRect).toBeUndefined();
  });

  it('a click without drag commits nothing (no-op, same pattern as whole-shape move)', () => {
    const rect = { origin: { x: 10, y: 10 }, width: 100, height: 50 };
    pointerDown({ x: 50, y: 30 }, rect, 2, false, false);
    pointerUp(); // no pointerMove in between

    expect(get(activeSurface)!.imageRect).toBeUndefined();
  });

  it('locked blocks both resize and move entirely', () => {
    const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 };
    expect(pointerDown({ x: 0, y: 0 }, rect, 2, true, false)).toBe(false); // corner, but locked
    expect(pointerDown({ x: 50, y: 25 }, rect, 2, true, false)).toBe(false); // body, but locked
    expect(isResizing()).toBe(false);
  });

  it('a measurement under the cursor blocks the body-move hit but never the corner-resize hit', () => {
    const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 };
    expect(pointerDown({ x: 50, y: 25 }, rect, 2, false, true)).toBe(false); // body hit, measurement present -> blocked
    expect(pointerDown({ x: 0, y: 0 }, rect, 2, false, true)).toBe(true); // corner hit always wins
    pointerUp();
  });

  it('does not start a drag when the point misses both corners and the body', () => {
    const rect = { origin: { x: 0, y: 0 }, width: 100, height: 50 };
    expect(pointerDown({ x: 500, y: 500 }, rect, 2, false, false)).toBe(false);
    expect(isResizing()).toBe(false);
  });

  it('pointerUp is a no-op when nothing was being dragged', () => {
    pointerUp();
    expect(get(activeSurface)!.imageRect).toBeUndefined();
  });
});
