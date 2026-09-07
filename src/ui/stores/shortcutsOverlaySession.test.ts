import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { shortcutsOverlayOpen, openShortcutsOverlay, closeShortcutsOverlay } from './shortcutsOverlaySession.js';

describe('shortcutsOverlaySession', () => {
  it('starts closed', () => {
    expect(get(shortcutsOverlayOpen)).toBe(false);
  });

  it('openShortcutsOverlay sets it to true', () => {
    openShortcutsOverlay();
    expect(get(shortcutsOverlayOpen)).toBe(true);
  });

  it('closeShortcutsOverlay sets it back to false', () => {
    openShortcutsOverlay();
    closeShortcutsOverlay();
    expect(get(shortcutsOverlayOpen)).toBe(false);
  });

  it('opening twice is idempotent', () => {
    openShortcutsOverlay();
    openShortcutsOverlay();
    expect(get(shortcutsOverlayOpen)).toBe(true);
  });
});
