import { writable, get } from 'svelte/store';
import type { Point } from '../../core/domain/types.js';
import {
  defaultViewport,
  zoomFromWheel,
  resetZoom as resetZoomAtAnchor,
  DEFAULT_VIEWPORT_CONFIG,
  type Viewport,
  type ViewportConfig,
} from '../viewport/viewport.js';

// PO request (canvas zoom) — the one Svelte-facing wrapper around viewport.ts's pure math.
// Session-only state (never persisted, never enters the domain model — 21_ARCHITECTURE §3):
// reopening a project always starts back at 100%, same "undo history is session-scoped"
// precedent as studioSession.ts's CommandStack (11 §7).

export const viewport = writable<Viewport>(defaultViewport());

export function zoomWheel(screenAnchor: Point, deltaY: number, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): void {
  viewport.update((vp) => zoomFromWheel(vp, screenAnchor, deltaY, config));
}

/** Zoom indicator's optional "click to reset" (PO request, §3) — pins `screenAnchor` (typically
 * the indicator's own position, or the viewport center) rather than snapping straight back to
 * (0,0) pan, matching zoomWheel's own pointer-centered feel. */
export function resetZoomAt(screenAnchor: Point): void {
  viewport.update((vp) => resetZoomAtAnchor(vp, screenAnchor));
}

/** Called when a new/different Surface opens (appState.ts) — a freshly opened project starts at
 * 100%, never inheriting whatever zoom/pan the previous session left the viewport at. */
export function resetViewport(): void {
  viewport.set(defaultViewport());
}

/** PO follow-up (UX review, item B8 "zoom-to-fit") — a bump signal, not the fit itself: computing
 * the actual Viewport needs the Surface's Measurements/background image bounds (Core geometry)
 * *and* the current canvas box size, both of which only CanvasStage.svelte has in hand (same
 * "session module can't reach into component-local state" reason imageResizeDrag/
 * backgroundLockFlash use the identical signal-store pattern). Studio.svelte's keyboard shortcut
 * and the zoom indicator's double-click both just bump this; CanvasStage reacts and does the math. */
export const fitToContentRequested = writable(0);

export function requestFitToContent(): void {
  fitToContentRequested.update((n) => n + 1);
}

// PO follow-up ("replace Select tool with Pan") — the one shared pan-drag lifecycle, used
// identically by the explicit Pan tool and the Space/middle-mouse-drag override
// (CanvasStage.svelte) so there's exactly one pan implementation, not two. Mirrors
// imageResizeSession.ts's own pointerDown/Move/Up drag-lifecycle shape. Absolute delta from the
// drag's origin (not incremental per-move `panBy` calls) — avoids any rounding drift accumulating
// across many small mousemove events during one drag.
export interface PanDrag {
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startOffsetX: number;
  readonly startOffsetY: number;
}

export const panDrag = writable<PanDrag | null>(null);

export function startPan(clientX: number, clientY: number): void {
  const vp = get(viewport);
  panDrag.set({ startClientX: clientX, startClientY: clientY, startOffsetX: vp.offsetX, startOffsetY: vp.offsetY });
}

export function panTo(clientX: number, clientY: number): void {
  const drag = get(panDrag);
  if (!drag) return;
  viewport.update((vp) => ({
    ...vp,
    offsetX: drag.startOffsetX + (clientX - drag.startClientX),
    offsetY: drag.startOffsetY + (clientY - drag.startClientY),
  }));
}

export function endPan(): void {
  panDrag.set(null);
}
