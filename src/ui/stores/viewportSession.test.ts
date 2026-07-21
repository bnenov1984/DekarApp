import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { viewport, panDrag, startPan, panTo, endPan, resetViewport } from './viewportSession.js';

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
