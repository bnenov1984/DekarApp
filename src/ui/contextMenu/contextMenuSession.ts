import { writable } from 'svelte/store';

// PO follow-up (UX review, item A14 "no context menus") — professionals' muscle memory is
// right-click -> verb; before this, right-click did nothing anywhere in the app (canvas rows,
// Layers panel rows, chips), silently falling back to the browser's own native menu. A plain
// open/close + position + items store (same "session store, not component-local state" pattern as
// shortcutsOverlaySession.ts) since the menu is triggered from several different components
// (CanvasStage, MeasurementList, MeasurementChip) but rendered once, at the Studio level, so it's
// never clipped by any panel's own overflow:auto/hidden.

export interface ContextMenuItem {
  readonly label: string;
  readonly action: () => void;
  readonly disabled?: boolean;
  /** styled like the Delete button elsewhere (danger color) — for destructive actions only. */
  readonly danger?: boolean;
}

export interface ContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
}

export const contextMenu = writable<ContextMenuState | null>(null);

export function openContextMenu(x: number, y: number, items: readonly ContextMenuItem[]): void {
  if (items.length === 0) return; // nothing to show — same "no-op, don't show an empty menu" discipline as everywhere else
  contextMenu.set({ x, y, items });
}

export function closeContextMenu(): void {
  contextMenu.set(null);
}
