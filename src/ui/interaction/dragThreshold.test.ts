import { describe, expect, it } from 'vitest';
import { exceedsDragThreshold, DRAG_THRESHOLD_SCREEN_PX } from './dragThreshold.js';

describe('exceedsDragThreshold', () => {
  it('returns false for no movement', () => {
    expect(exceedsDragThreshold(100, 100, 100, 100)).toBe(false);
  });

  it('returns false for movement at or below the threshold', () => {
    expect(exceedsDragThreshold(0, 0, DRAG_THRESHOLD_SCREEN_PX, 0)).toBe(false);
    expect(exceedsDragThreshold(0, 0, 1, 1)).toBe(false);
  });

  it('returns true once movement exceeds the threshold', () => {
    expect(exceedsDragThreshold(0, 0, DRAG_THRESHOLD_SCREEN_PX + 1, 0)).toBe(true);
    expect(exceedsDragThreshold(0, 0, 0, DRAG_THRESHOLD_SCREEN_PX + 1)).toBe(true);
  });

  it('measures diagonal (Pythagorean) distance, not per-axis', () => {
    // 3-4-5 triangle: distance 5, comfortably past the default 4px threshold
    expect(exceedsDragThreshold(0, 0, 3, 4)).toBe(true);
  });

  it('accepts a custom threshold', () => {
    expect(exceedsDragThreshold(0, 0, 10, 0, 20)).toBe(false);
    expect(exceedsDragThreshold(0, 0, 25, 0, 20)).toBe(true);
  });

  it('works regardless of drag direction (negative deltas)', () => {
    expect(exceedsDragThreshold(50, 50, 40, 40)).toBe(true); // distance ~14.1
    expect(exceedsDragThreshold(50, 50, 48, 49)).toBe(false); // distance ~2.2
  });
});
