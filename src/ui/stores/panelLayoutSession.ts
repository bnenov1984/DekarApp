import { writable, derived, get } from 'svelte/store';

// 15 §2.2 / 16 §3.2 PanelShell (Photoshop layout, 2026-10-11; auto height, 2026-11-15 —
// .scratch/properties-panel) — the right column stacks Properties over Layers with a draggable
// divider. By default Properties takes the height of its content (`null`), bounded below by
// MIN_PROPERTIES_PX and above by AUTO_MAX_PROPERTIES_SHARE of the column, and Layers gets the
// rest; a fixed 50% share made Properties scroll on an ordinary selection. Dragging the divider
// (or ↑/↓ on it) switches to an override — the fraction of the column Properties takes — and
// double-click returns to automatic. Remembered for the session only (a store, not component
// state, so it survives the column re-rendering); not persisted.

/** Starting point for a keyboard nudge from automatic when the column can't report its measured
 * share yet, and the fallback of `shareFromPointer` for a column with no height. */
export const DEFAULT_PROPERTIES_SHARE = 0.5;
/** Neither section can be dragged shut — each keeps at least a fifth of the column. */
export const MIN_PROPERTIES_SHARE = 0.2;
export const MAX_PROPERTIES_SHARE = 0.8;
/** Automatic height: never shorter than this (the empty-state text and header stay readable)… */
export const MIN_PROPERTIES_PX = 160;
/** …and never more than this share of the column, so Layers always has room. */
export const AUTO_MAX_PROPERTIES_SHARE = 0.65;

/** `null` = automatic (content height); a number = the user's override share. */
export const propertiesShare = writable<number | null>(null);

function clamp(share: number): number {
  return Math.min(MAX_PROPERTIES_SHARE, Math.max(MIN_PROPERTIES_SHARE, share));
}

/** Drag on the divider — switches to an override. */
export function setPropertiesShare(share: number): void {
  if (!Number.isFinite(share)) return;
  propertiesShare.set(clamp(share));
}

/** Keyboard ↑/↓ on the focused divider. From automatic, the step starts at `measuredShare` — the
 * share the column currently gives Properties (RightColumn measures it) — so the first press moves
 * the divider from where it visibly is, not from an unrelated default. */
export function nudgePropertiesShare(delta: number, measuredShare: number = DEFAULT_PROPERTIES_SHARE): void {
  setPropertiesShare((get(propertiesShare) ?? measuredShare) + delta);
}

/** Double-click on the divider — back to automatic. */
export function resetPropertiesShare(): void {
  propertiesShare.set(null);
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
