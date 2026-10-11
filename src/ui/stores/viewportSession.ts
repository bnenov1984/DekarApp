import { writable, get } from 'svelte/store';
import type { Point } from '../../core/domain/types.js';
import {
  defaultViewport,
  zoomFromWheel,
  zoomTo,
  zoomByStep,
  DEFAULT_VIEWPORT_CONFIG,
  type Viewport,
  type ViewportConfig,
} from '../viewport/viewport.js';

// PO request (canvas zoom) — the one Svelte-facing wrapper around viewport.ts's pure math.
// Session-only state (never persisted, never enters the domain model — 21_ARCHITECTURE §3):
// reopening a project always starts back at 100%, same "undo history is session-scoped"
// precedent as studioSession.ts's CommandStack (11 §7).

export const viewport = writable<Viewport>(defaultViewport());

export function zoomWheel(screenAnchor: Point, deltaY: number, deltaMode = 0, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): void {
  viewport.update((vp) => zoomFromWheel(vp, screenAnchor, deltaY, deltaMode, config));
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
 * and the status bar zoom %'s double-click both just bump this; CanvasStage reacts and does the math. */
export const fitToContentRequested = writable(0);

export function requestFitToContent(): void {
  fitToContentRequested.update((n) => n + 1);
}

/** 15 §2.2 Zoom (PO, 2026-10-11) — a zoom the status bar's ZoomMenu or the `+`/`-` keys ask for,
 * applied around the canvas center: to an exact scale, or by whole ×1.1 steps. */
export type CenterZoom = { readonly kind: 'to'; readonly scale: number } | { readonly kind: 'step'; readonly steps: number };

/** Neither the status bar nor Studio's key handler knows the canvas box, so they post a request
 * and CanvasStage applies it at the canvas center (`zoomAtCenter`). `seq` makes every request a
 * new value, so pressing `+` twice zooms twice. Same signal idea as `fitToContentRequested`. */
export const centerZoomRequested = writable<{ readonly seq: number; readonly zoom: CenterZoom } | null>(null);

function requestCenterZoom(zoom: CenterZoom): void {
  centerZoomRequested.update((current) => ({ seq: (current?.seq ?? 0) + 1, zoom }));
}

export function requestZoomTo(scale: number): void {
  requestCenterZoom({ kind: 'to', scale });
}

export function requestZoomStep(steps: number): void {
  requestCenterZoom({ kind: 'step', steps });
}

/** The ZoomMenu's 100%. */
export function requestZoomReset(config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): void {
  requestZoomTo(config.defaultScale);
}

/** CanvasStage's side of a center zoom request; `center` is the canvas box's center. */
export function zoomAtCenter(zoom: CenterZoom, center: Point, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): void {
  viewport.update((vp) => (zoom.kind === 'to' ? zoomTo(vp, center, zoom.scale, config) : zoomByStep(vp, center, zoom.steps, config)));
  // Consumed — a canvas mounted later (another project opened) must not replay it.
  centerZoomRequested.set(null);
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
