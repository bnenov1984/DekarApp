import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  propertiesShare,
  DEFAULT_PROPERTIES_SHARE,
  MIN_PROPERTIES_SHARE,
  MAX_PROPERTIES_SHARE,
  MIN_PROPERTIES_PX,
  AUTO_MAX_PROPERTIES_SHARE,
  setPropertiesShare,
  nudgePropertiesShare,
  resetPropertiesShare,
  shareFromPointer,
  layoutModeForWidth,
  layoutMode,
  viewOnly,
  setViewportWidth,
  sidePanelsHidden,
  toggleSidePanels,
  rightOverlayOpen,
  toggleRightOverlay,
  closeRightOverlay,
} from './panelLayoutSession.js';

// 15 §2.2 (Photoshop layout, 2026-10-11; auto height, 2026-11-15) — the right column's divider
// between Properties (top) and Layers (below). `null` means Properties takes the height of its
// content (at least MIN_PROPERTIES_PX, at most AUTO_MAX_PROPERTIES_SHARE of the column); a number
// is the user's override — the fraction of the column Properties takes.

beforeEach(() => {
  resetPropertiesShare();
  setViewportWidth(1400);
  sidePanelsHidden.set(false);
  closeRightOverlay();
});

describe('panelLayoutSession — Properties/Layers divider', () => {
  it('starts automatic: Properties sized to its content', () => {
    expect(get(propertiesShare)).toBeNull();
  });

  it('bounds the automatic height so neither section disappears', () => {
    expect(MIN_PROPERTIES_PX).toBeGreaterThan(0);
    expect(AUTO_MAX_PROPERTIES_SHARE).toBeGreaterThan(MIN_PROPERTIES_SHARE);
    expect(AUTO_MAX_PROPERTIES_SHARE).toBeLessThanOrEqual(MAX_PROPERTIES_SHARE);
  });

  it('setPropertiesShare switches to an override inside the limits', () => {
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

  it('nudgePropertiesShare moves an override by a step, still clamped (keyboard ↑/↓)', () => {
    setPropertiesShare(0.5);
    nudgePropertiesShare(0.05);
    expect(get(propertiesShare)).toBeCloseTo(0.55);
    nudgePropertiesShare(-1);
    expect(get(propertiesShare)).toBe(MIN_PROPERTIES_SHARE);
  });

  it('nudgePropertiesShare from automatic starts at the measured share the column reports', () => {
    nudgePropertiesShare(0.05, 0.3);
    expect(get(propertiesShare)).toBeCloseTo(0.35);
  });

  it('nudgePropertiesShare from automatic without a measurement starts at the default share', () => {
    nudgePropertiesShare(0.1);
    expect(get(propertiesShare)).toBeCloseTo(DEFAULT_PROPERTIES_SHARE + 0.1);
  });

  it('resetPropertiesShare returns to automatic (double-click on the divider)', () => {
    setPropertiesShare(0.3);
    resetPropertiesShare();
    expect(get(propertiesShare)).toBeNull();
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

  it('falls back to the default share for a column with no height yet', () => {
    expect(shareFromPointer(300, 100, 0)).toBe(DEFAULT_PROPERTIES_SHARE);
  });
});

// 15 §11 (Photoshop layout, 2026-10-11) — screen sizes and the Tab toggle.
describe('layoutModeForWidth', () => {
  it('is the full layout from 1280px up', () => {
    expect(layoutModeForWidth(1280)).toBe('full');
    expect(layoutModeForWidth(1920)).toBe('full');
  });

  it('is compact (right column as an overlay) from 1024 to 1279px', () => {
    expect(layoutModeForWidth(1024)).toBe('compact');
    expect(layoutModeForWidth(1279)).toBe('compact');
  });

  it('is view-only below 1024px (PD-022)', () => {
    expect(layoutModeForWidth(1023)).toBe('view');
    expect(layoutModeForWidth(390)).toBe('view');
  });
});

describe('setViewportWidth', () => {
  it('sets the layout mode and viewOnly from the width', () => {
    setViewportWidth(1200);
    expect(get(layoutMode)).toBe('compact');
    expect(get(viewOnly)).toBe(false);
    setViewportWidth(900);
    expect(get(layoutMode)).toBe('view');
    expect(get(viewOnly)).toBe(true);
  });

  it('closes the right-column overlay when the window grows back to the full layout', () => {
    setViewportWidth(1200);
    toggleRightOverlay();
    expect(get(rightOverlayOpen)).toBe(true);
    setViewportWidth(1400);
    expect(get(rightOverlayOpen)).toBe(false);
  });

  it('keeps the overlay open while resizing within the overlay sizes', () => {
    setViewportWidth(1200);
    toggleRightOverlay();
    setViewportWidth(900);
    expect(get(rightOverlayOpen)).toBe(true);
  });
});

describe('toggleSidePanels (Tab)', () => {
  it('hides and shows both side columns', () => {
    expect(get(sidePanelsHidden)).toBe(false);
    toggleSidePanels();
    expect(get(sidePanelsHidden)).toBe(true);
    toggleSidePanels();
    expect(get(sidePanelsHidden)).toBe(false);
  });

  it('also closes an open right-column overlay when hiding', () => {
    setViewportWidth(1200);
    toggleRightOverlay();
    toggleSidePanels();
    expect(get(rightOverlayOpen)).toBe(false);
  });
});

describe('toggleRightOverlay', () => {
  it('opens and closes the overlay', () => {
    setViewportWidth(1200);
    toggleRightOverlay();
    expect(get(rightOverlayOpen)).toBe(true);
    toggleRightOverlay();
    expect(get(rightOverlayOpen)).toBe(false);
  });

  it('does nothing in the full layout, where the column is always docked', () => {
    toggleRightOverlay();
    expect(get(rightOverlayOpen)).toBe(false);
  });
});
