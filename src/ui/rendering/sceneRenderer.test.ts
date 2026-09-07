import { describe, expect, it } from 'vitest';
import { computeContainRect } from './sceneRenderer.js';

// sceneRenderer.ts as a whole draws to a real CanvasRenderingContext2D (a browser-only API not
// available under this project's node-based vitest run, same boundary as every other Canvas2D
// call in this file — verified live in the browser instead, ADR-002). computeContainRect is the
// one piece of pure math in the module, so it's the one piece with a unit test.

describe('computeContainRect', () => {
  it('scales a wider-than-box image down to fit the box width, centering vertically', () => {
    const rect = computeContainRect(400, 200, 100, 100);
    expect(rect).toEqual({ x: 0, y: 25, width: 100, height: 50 });
  });

  it('scales a taller-than-box image down to fit the box height, centering horizontally', () => {
    const rect = computeContainRect(200, 400, 100, 100);
    expect(rect).toEqual({ x: 25, y: 0, width: 50, height: 100 });
  });

  it('fills the box exactly when the aspect ratios already match', () => {
    const rect = computeContainRect(200, 100, 400, 200);
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });

  it('returns a degenerate all-zero rect for a zero-size box instead of dividing by zero', () => {
    expect(computeContainRect(400, 200, 0, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns a degenerate all-zero rect for a zero-size image', () => {
    expect(computeContainRect(0, 0, 400, 200)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
