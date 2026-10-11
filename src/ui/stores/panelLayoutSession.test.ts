import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  propertiesShare,
  DEFAULT_PROPERTIES_SHARE,
  MIN_PROPERTIES_SHARE,
  MAX_PROPERTIES_SHARE,
  setPropertiesShare,
  nudgePropertiesShare,
  resetPropertiesShare,
  shareFromPointer,
} from './panelLayoutSession.js';

// 15 §2.2 (Photoshop layout, 2026-10-11) — the right column's divider between Properties (top)
// and Layers (below). The share is the fraction of the column's height Properties takes.

beforeEach(() => {
  resetPropertiesShare();
});

describe('panelLayoutSession — Properties/Layers divider', () => {
  it('starts at the default share', () => {
    expect(get(propertiesShare)).toBe(DEFAULT_PROPERTIES_SHARE);
  });

  it('setPropertiesShare stores a share inside the limits', () => {
    setPropertiesShare(0.35);
    expect(get(propertiesShare)).toBe(0.35);
  });

  it('setPropertiesShare clamps so neither section can be dragged shut', () => {
    setPropertiesShare(0);
    expect(get(propertiesShare)).toBe(MIN_PROPERTIES_SHARE);
    setPropertiesShare(1);
    expect(get(propertiesShare)).toBe(MAX_PROPERTIES_SHARE);
  });

  it('setPropertiesShare ignores a non-finite value', () => {
    setPropertiesShare(0.4);
    setPropertiesShare(Number.NaN);
    expect(get(propertiesShare)).toBe(0.4);
  });

  it('nudgePropertiesShare moves the divider by a step, still clamped (keyboard ↑/↓)', () => {
    setPropertiesShare(0.5);
    nudgePropertiesShare(0.05);
    expect(get(propertiesShare)).toBeCloseTo(0.55);
    nudgePropertiesShare(-1);
    expect(get(propertiesShare)).toBe(MIN_PROPERTIES_SHARE);
  });

  it('resetPropertiesShare returns to the default (double-click on the divider)', () => {
    setPropertiesShare(0.3);
    resetPropertiesShare();
    expect(get(propertiesShare)).toBe(DEFAULT_PROPERTIES_SHARE);
  });
});

describe('shareFromPointer', () => {
  it('is the pointer position as a fraction of the column height', () => {
    expect(shareFromPointer(300, 100, 800)).toBe(0.25);
  });

  it('clamps a pointer dragged past either end of the column', () => {
    expect(shareFromPointer(50, 100, 800)).toBe(MIN_PROPERTIES_SHARE);
    expect(shareFromPointer(2000, 100, 800)).toBe(MAX_PROPERTIES_SHARE);
  });

  it('falls back to the default for a column with no height yet', () => {
    expect(shareFromPointer(300, 100, 0)).toBe(DEFAULT_PROPERTIES_SHARE);
  });
});
