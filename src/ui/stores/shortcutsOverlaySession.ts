import { writable } from 'svelte/store';

// PO follow-up (UX review, item A8 "shortcuts help overlay") — a plain open/close flag, but a
// store rather than component-local state: both Studio.svelte (owns the `?` keydown handler and
// mounts ShortcutsOverlay.svelte) and StatusBar.svelte (owns the small "?" button that opens it
// for users who don't yet know the shortcut exists — a shortcut-overlay discoverable only via
// itself would be circular) need to read/drive the same flag.

export const shortcutsOverlayOpen = writable(false);

export function openShortcutsOverlay(): void {
  shortcutsOverlayOpen.set(true);
}

export function closeShortcutsOverlay(): void {
  shortcutsOverlayOpen.set(false);
}
