import { writable, derived, get } from 'svelte/store';

// 15 §2.2 / 16 §3.2 PanelShell (Photoshop layout, 2026-10-11) — the right column stacks
// Properties over Layers with a draggable divider. `propertiesShare` is the fraction of the
// column's height Properties takes; Layers gets the rest. Remembered for the session only (a
// store, not component state, so it survives the column re-rendering); not persisted.

export const DEFAULT_PROPERTIES_SHARE = 0.5;
/** Neither section can be dragged shut — each keeps at least a fifth of the column. */
export const MIN_PROPERTIES_SHARE = 0.2;
export const MAX_PROPERTIES_SHARE = 0.8;

export const propertiesShare = writable(DEFAULT_PROPERTIES_SHARE);

function clamp(share: number): number {
  return Math.min(MAX_PROPERTIES_SHARE, Math.max(MIN_PROPERTIES_SHARE, share));
}

export function setPropertiesShare(share: number): void {
  if (!Number.isFinite(share)) return;
  propertiesShare.set(clamp(share));
}

/** Keyboard ↑/↓ on the focused divider. */
export function nudgePropertiesShare(delta: number): void {
  setPropertiesShare(get(propertiesShare) + delta);
}

/** Double-click on the divider. */
export function resetPropertiesShare(): void {
  propertiesShare.set(DEFAULT_PROPERTIES_SHARE);
}

/** The share for a divider dragged to `pointerY` in a column spanning `columnTop` to
 * `columnTop + columnHeight` (client pixels), clamped to the limits. */
export function shareFromPointer(pointerY: number, columnTop: number, columnHeight: number): number {
  if (columnHeight <= 0) return DEFAULT_PROPERTIES_SHARE;
  return clamp((pointerY - columnTop) / columnHeight);
}

// 15 §11 (Photoshop layout, 2026-10-11) — screen sizes. ≥1280: the full layout, right column
// docked. 1024–1279: the right column becomes a strip on the edge that opens it as an overlay over
// the canvas (the canvas doesn't shrink). <1024: view-only (PD-022) — no tool bar, no editing,
// right column as an overlay. Fed from the window width by Studio.svelte.

export type LayoutMode = 'full' | 'compact' | 'view';

export const FULL_LAYOUT_MIN_WIDTH = 1280;
export const EDITING_MIN_WIDTH = 1024;

export function layoutModeForWidth(width: number): LayoutMode {
  if (width >= FULL_LAYOUT_MIN_WIDTH) return 'full';
  if (width >= EDITING_MIN_WIDTH) return 'compact';
  return 'view';
}

export const layoutMode = writable<LayoutMode>('full');

/** PD-022 — below 1024px nothing may change the project (studioSession.ts enforces it). */
export const viewOnly = derived(layoutMode, (mode) => mode === 'view');

/** The right column shown as an overlay (compact and view-only sizes only). */
export const rightOverlayOpen = writable(false);

export function setViewportWidth(width: number): void {
  const mode = layoutModeForWidth(width);
  layoutMode.set(mode);
  if (mode === 'full') rightOverlayOpen.set(false); // docked again — nothing to overlay
}

export function toggleRightOverlay(): void {
  if (get(layoutMode) === 'full') return;
  rightOverlayOpen.update((open) => !open);
}

export function closeRightOverlay(): void {
  rightOverlayOpen.set(false);
}

/** Tab (Photoshop idiom) — hides/shows both side columns at any width; the canvas takes the
 * freed space. Session-only, like the divider share. */
export const sidePanelsHidden = writable(false);

export function toggleSidePanels(): void {
  const hide = !get(sidePanelsHidden);
  sidePanelsHidden.set(hide);
  if (hide) rightOverlayOpen.set(false);
}
