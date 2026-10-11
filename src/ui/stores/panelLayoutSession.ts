import { writable, get } from 'svelte/store';

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
