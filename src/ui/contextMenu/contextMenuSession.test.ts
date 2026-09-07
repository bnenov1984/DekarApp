import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { contextMenu, openContextMenu, closeContextMenu, type ContextMenuItem } from './contextMenuSession.js';

function makeItems(count: number): ContextMenuItem[] {
  return Array.from({ length: count }, (_, i) => ({ label: `Item ${i}`, action: vi.fn() }));
}

describe('contextMenuSession', () => {
  it('starts closed', () => {
    expect(get(contextMenu)).toBeNull();
  });

  it('openContextMenu sets position and items', () => {
    const items = makeItems(2);
    openContextMenu(10, 20, items);
    expect(get(contextMenu)).toEqual({ x: 10, y: 20, items });
  });

  it('opening with an empty items array is a no-op — never shows an empty menu', () => {
    closeContextMenu();
    openContextMenu(10, 20, []);
    expect(get(contextMenu)).toBeNull();
  });

  it('closeContextMenu resets to null', () => {
    openContextMenu(5, 5, makeItems(1));
    closeContextMenu();
    expect(get(contextMenu)).toBeNull();
  });

  it('opening a second menu replaces the first, not accumulates', () => {
    openContextMenu(0, 0, makeItems(1));
    const second = makeItems(3);
    openContextMenu(50, 50, second);
    expect(get(contextMenu)).toEqual({ x: 50, y: 50, items: second });
  });
});
