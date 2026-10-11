import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  viewport,
  panDrag,
  startPan,
  panTo,
  endPan,
  resetViewport,
  centerZoomRequested,
  requestZoomReset,
  requestZoomTo,
  requestZoomStep,
  zoomAtCenter,
} from './viewportSession.js';

// PO follow-up ("replace Select tool with Pan") — the one shared pan-drag lifecycle
// (CanvasStage.svelte calls this identically from the explicit Pan tool and the Space/
// middle-mouse-drag override, so there's exactly one pan implementation, not two).

beforeEach(() => {
  resetViewport();
  panDrag.set(null);
});

describe('startPan / panTo / endPan', () => {
  it('startPan captures the drag origin and current viewport offset', () => {
    startPan(100, 200);
    expect(get(panDrag)).toEqual({ startClientX: 100, startClientY: 200, startOffsetX: 0, startOffsetY: 0 });
  });

  it('panTo moves the viewport by the screen-space delta from the drag origin', () => {
    startPan(100, 200);
    panTo(130, 180);
    expect(get(viewport)).toMatchObject({ offsetX: 30, offsetY: -20 });
  });

  it('panTo is an absolute delta from the origin, not incremental — repeated calls do not drift', () => {
    startPan(100, 200);
    panTo(110, 200);
    panTo(150, 200); // total delta from origin is +50, not +10 then +40 accumulated twice
    expect(get(viewport)).toMatchObject({ offsetX: 50, offsetY: 0 });
  });

  it('panTo is a safe no-op when no drag is active', () => {
    const before = get(viewport);
    panTo(999, 999);
    expect(get(viewport)).toEqual(before);
  });

  it('endPan clears the drag state', () => {
    startPan(0, 0);
    endPan();
    expect(get(panDrag)).toBeNull();
  });

  it('never touches scale', () => {
    startPan(0, 0);
    panTo(50, 50);
    expect(get(viewport).scale).toBe(1);
  });
});

// 15 §2.2 Zoom (PO, 2026-10-11) — the status bar's ZoomMenu and the `+`/`-` keys don't know the
// canvas box; they ask for a zoom and CanvasStage applies it around the canvas center.
describe('center zoom requests', () => {
  beforeEach(() => centerZoomRequested.set(null));

  it('requestZoomTo / requestZoomStep / requestZoomReset post a request', () => {
    requestZoomTo(1.5);
    expect(get(centerZoomRequested)?.zoom).toEqual({ kind: 'to', scale: 1.5 });
    requestZoomStep(-1);
    expect(get(centerZoomRequested)?.zoom).toEqual({ kind: 'step', steps: -1 });
    requestZoomReset();
    expect(get(centerZoomRequested)?.zoom).toEqual({ kind: 'to', scale: 1 });
  });

  it('each request is new, so repeating the same one triggers again', () => {
    requestZoomStep(1);
    const first = get(centerZoomRequested);
    requestZoomStep(1);
    expect(get(centerZoomRequested)).not.toBe(first);
    expect(get(centerZoomRequested)!.seq).toBe(first!.seq + 1);
  });

  it('only signals — the viewport itself is untouched until CanvasStage reacts', () => {
    const before = get(viewport);
    requestZoomTo(2);
    expect(get(viewport)).toEqual(before);
  });

  it('zoomAtCenter applies a request around the given anchor', () => {
    zoomAtCenter({ kind: 'to', scale: 2 }, { x: 100, y: 50 });
    expect(get(viewport)).toEqual({ scale: 2, offsetX: -100, offsetY: -50 });
    zoomAtCenter({ kind: 'step', steps: 1 }, { x: 100, y: 50 });
    expect(get(viewport).scale).toBeCloseTo(2.2, 10);
  });

  it('zoomAtCenter consumes the request, so a canvas mounted later does not replay it', () => {
    requestZoomTo(3);
    zoomAtCenter(get(centerZoomRequested)!.zoom, { x: 0, y: 0 });
    expect(get(centerZoomRequested)).toBeNull();
  });
});
