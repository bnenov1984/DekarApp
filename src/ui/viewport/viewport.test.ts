import { describe, expect, it } from 'vitest';
import {
  defaultViewport,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomFromWheel,
  resetZoom,
  fitBounds,
  panBy,
  DEFAULT_VIEWPORT_CONFIG,
  type Viewport,
} from './viewport.js';

// PO follow-up ("replace Select tool with Pan") — panBy is the one pure pan primitive shared by
// viewportSession.ts's drag lifecycle (startPan/panTo/endPan), used identically by the explicit
// Pan tool and the Space/middle-mouse-drag override.
describe('panBy', () => {
  it('adds the delta to offsetX/offsetY and never touches scale', () => {
    const vp: Viewport = { scale: 1.5, offsetX: 10, offsetY: -5 };
    const after = panBy(vp, 20, -8);
    expect(after).toEqual({ scale: 1.5, offsetX: 30, offsetY: -13 });
  });

  it('a zero delta is a no-op', () => {
    const vp: Viewport = { scale: 2, offsetX: 5, offsetY: 5 };
    expect(panBy(vp, 0, 0)).toEqual(vp);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('are inverses of each other at the default (identity) viewport', () => {
    const vp = defaultViewport();
    const world = { x: 123, y: 45 };
    expect(screenToWorld(vp, worldToScreen(vp, world))).toEqual(world);
  });

  it('are inverses under an arbitrary scale/offset', () => {
    const vp: Viewport = { scale: 2.5, offsetX: 30, offsetY: -12 };
    const world = { x: 77, y: -8 };
    const screen = worldToScreen(vp, world);
    const back = screenToWorld(vp, screen);
    expect(back.x).toBeCloseTo(world.x, 10);
    expect(back.y).toBeCloseTo(world.y, 10);
  });
});

describe('zoomAt — pointer-centered zoom in', () => {
  it('keeps the same world point under the same screen point after zooming in', () => {
    const before = defaultViewport();
    const anchor = { x: 400, y: 300 };
    const worldBefore = screenToWorld(before, anchor);

    const after = zoomAt(before, anchor, 2); // 2x zoom in
    expect(after.scale).toBeCloseTo(2, 10);

    const worldAfter = screenToWorld(after, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });

  it('keeps the anchor pinned from an already-panned/zoomed starting viewport', () => {
    const before: Viewport = { scale: 1.4, offsetX: 50, offsetY: -20 };
    const anchor = { x: 250, y: 180 };
    const worldBefore = screenToWorld(before, anchor);

    const after = zoomAt(before, anchor, 1.7);

    const worldAfter = screenToWorld(after, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });
});

describe('zoomAt — pointer-centered zoom out', () => {
  it('keeps the same world point under the same screen point after zooming out', () => {
    const before: Viewport = { scale: 3, offsetX: 0, offsetY: 0 };
    const anchor = { x: 120, y: 90 };
    const worldBefore = screenToWorld(before, anchor);

    const after = zoomAt(before, anchor, 0.5); // zoom out
    expect(after.scale).toBeCloseTo(1.5, 10);

    const worldAfter = screenToWorld(after, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });
});

describe('zoomAt — clamping', () => {
  it('clamps to minScale and still keeps the anchor pinned at the clamped scale', () => {
    const before = defaultViewport();
    const anchor = { x: 200, y: 200 };
    const worldBefore = screenToWorld(before, anchor);

    const after = zoomAt(before, anchor, 0.0001); // would go far below minScale unclamped
    expect(after.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.minScale, 10);

    const worldAfter = screenToWorld(after, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it('clamps to maxScale and still keeps the anchor pinned at the clamped scale', () => {
    const before = defaultViewport();
    const anchor = { x: 200, y: 200 };
    const worldBefore = screenToWorld(before, anchor);

    const after = zoomAt(before, anchor, 10_000); // would go far above maxScale unclamped
    expect(after.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.maxScale, 10);

    const worldAfter = screenToWorld(after, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it('repeated wheel-in notches never exceed maxScale', () => {
    let vp = defaultViewport();
    for (let i = 0; i < 5000; i++) {
      vp = zoomFromWheel(vp, { x: 0, y: 0 }, -120); // wheel "up" a few thousand notches
    }
    expect(vp.scale).toBeLessThanOrEqual(DEFAULT_VIEWPORT_CONFIG.maxScale);
    expect(vp.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.maxScale, 6);
  });

  it('repeated wheel-out notches never go below minScale', () => {
    let vp = defaultViewport();
    for (let i = 0; i < 5000; i++) {
      vp = zoomFromWheel(vp, { x: 0, y: 0 }, 120); // wheel "down" a few thousand notches
    }
    expect(vp.scale).toBeGreaterThanOrEqual(DEFAULT_VIEWPORT_CONFIG.minScale);
    expect(vp.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.minScale, 6);
  });
});

describe('zoomFromWheel — direction', () => {
  it('negative deltaY (wheel up) zooms in', () => {
    const vp = zoomFromWheel(defaultViewport(), { x: 0, y: 0 }, -100);
    expect(vp.scale).toBeGreaterThan(1);
  });

  it('positive deltaY (wheel down) zooms out', () => {
    const vp = zoomFromWheel(defaultViewport(), { x: 0, y: 0 }, 100);
    expect(vp.scale).toBeLessThan(1);
  });
});

describe('resetZoom', () => {
  it('returns exactly to the default scale, anchor pinned', () => {
    const zoomed = zoomAt(defaultViewport(), { x: 50, y: 50 }, 3.7);
    const anchor = { x: 500, y: 400 };
    const worldBefore = screenToWorld(zoomed, anchor);

    const reset = resetZoom(zoomed, anchor);
    expect(reset.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.defaultScale, 10);

    const worldAfter = screenToWorld(reset, anchor);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
  });
});

// PO follow-up (UX review, item B8 "zoom-to-fit")
describe('fitBounds', () => {
  it('centers the bounds and scales it to fill the box minus padding, on the tighter axis', () => {
    // 100x50 bounds (2:1), box 400x400 with 0 padding: width-fit would need scale 4, height-fit
    // scale 8 — the tighter (smaller) one, 4, is the one that keeps the whole bounds visible.
    const result = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 400, 400, 0);
    expect(result.scale).toBeCloseTo(4, 10);
    // bounds center (50, 25) must map to the box center (200, 200)
    expect(result.offsetX + 50 * result.scale).toBeCloseTo(200, 8);
    expect(result.offsetY + 25 * result.scale).toBeCloseTo(200, 8);
  });

  it('padding shrinks the available area, and therefore the resulting scale', () => {
    const unpadded = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 400, 400, 0);
    const padded = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 400, 400, 40);
    expect(padded.scale).toBeLessThan(unpadded.scale);
    expect(padded.scale).toBeCloseTo(3.2, 10); // (400 - 80) / 100
  });

  it('clamps to the configured scale range like every other zoom', () => {
    const tiny = fitBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 400, 400, 0);
    expect(tiny.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.maxScale, 10);

    const huge = fitBounds({ minX: 0, minY: 0, maxX: 1_000_000, maxY: 1_000_000 }, 400, 400, 0);
    expect(huge.scale).toBeCloseTo(DEFAULT_VIEWPORT_CONFIG.minScale, 10);
  });

  it('a zero-height bounds (perfectly horizontal) fits on width alone, not a division by zero', () => {
    const result = fitBounds({ minX: 0, minY: 10, maxX: 100, maxY: 10 }, 400, 400, 0);
    expect(result.scale).toBeCloseTo(4, 10); // 400/100, height unconstrained
    expect(Number.isFinite(result.scale)).toBe(true);
  });

  it('a single-point bounds (both axes zero) falls back to the default scale, centered on it', () => {
    const result = fitBounds({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 400, 400, 0);
    expect(result.scale).toBe(DEFAULT_VIEWPORT_CONFIG.defaultScale);
    expect(result.offsetX + 5 * result.scale).toBeCloseTo(200, 8);
    expect(result.offsetY + 5 * result.scale).toBeCloseTo(200, 8);
  });
});

describe('no domain-geometry mutation', () => {
  it('viewport functions only ever produce Viewport values, never touch a Shape/Measurement', () => {
    // Structural guarantee, not just a runtime check: zoomAt's return type is `Viewport`, which
    // has no relationship to core/domain/entities.ts's Measurement/Shape types at all — there is
    // no code path in this module that could mutate domain geometry even if a caller tried to
    // feed it one, since it doesn't accept one.
    const vp = zoomAt(defaultViewport(), { x: 10, y: 10 }, 2);
    expect(Object.keys(vp).sort()).toEqual(['offsetX', 'offsetY', 'scale']);
  });
});
