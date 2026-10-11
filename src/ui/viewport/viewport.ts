import type { Point } from '../../core/domain/types.js';

// PO request (canvas zoom) — the "smallest coherent viewport abstraction" for ISS-010
// (docs/27_NOTES/PHASE_4_IMPLEMENTATION_ISSUES.md), which flagged exactly this gap: "Surface-space
// == CSS-pixel-space simplification... once pan/zoom arrive, a real Surface<->screen transform is
// needed... blocks the Pan tool in Tool Dock." This module is that transform, kept pure and
// UI-layer only (never Core — viewport state is display/session state, not domain geometry,
// 21_ARCHITECTURE §3/§6). CanvasStage.svelte is the only consumer; every zoom/pan calculation
// lives here so it isn't scattered across the component.
//
// Convention: `screen = world * scale + offset` (CSS pixels, before devicePixelRatio — DPR is
// applied on top of this transform by the caller, sceneRenderer.ts's ctx.setTransform, and is
// never part of Viewport itself). `world` is exactly what was previously called "Surface space."

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ViewportConfig {
  readonly minScale: number;
  readonly maxScale: number;
  readonly defaultScale: number;
  /** One zoom step — a mouse-wheel notch, `+`/`-`, Zoom in/out (15 §2.2). Multiplicative, so
   * repeated steps compound evenly at any zoom level. */
  readonly zoomStep: number;
  /** A pixel-mode wheel delta at least this big is one mouse-wheel notch (mice report 50–400+
   * per notch depending on OS and settings); smaller deltas are a trackpad or pinch, zoomed in
   * proportion, `zoomStep` per this many pixels. */
  readonly wheelNotchPixels: number;
}

/** Proposed constants (PO request: "propose sensible constants... keep them in one location, not
 * hard-coded throughout the UI"). 10%–800% covers the requested range. A ×1.1 step (PO,
 * 2026-10-11) — about 7 notches double the zoom; no animation/inertia (precision work shouldn't
 * feel delayed, PO request). */
export const DEFAULT_VIEWPORT_CONFIG: ViewportConfig = {
  minScale: 0.1,
  maxScale: 8,
  defaultScale: 1,
  zoomStep: 1.1,
  wheelNotchPixels: 50,
};

export function defaultViewport(config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): Viewport {
  return { scale: config.defaultScale, offsetX: 0, offsetY: 0 };
}

/** PO follow-up ("replace Select tool with Pan") — a plain screen-space offset delta, shared by
 * both the explicit Pan tool and the Space/middle-mouse-drag override (viewportSession.ts's
 * pan-drag lifecycle) so there's exactly one pan implementation, not two. Never touches `scale`. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, offsetX: viewport.offsetX + dx, offsetY: viewport.offsetY + dy };
}

export function screenToWorld(viewport: Viewport, screenPoint: Point): Point {
  return {
    x: (screenPoint.x - viewport.offsetX) / viewport.scale,
    y: (screenPoint.y - viewport.offsetY) / viewport.scale,
  };
}

export function worldToScreen(viewport: Viewport, worldPoint: Point): Point {
  return {
    x: worldPoint.x * viewport.scale + viewport.offsetX,
    y: worldPoint.y * viewport.scale + viewport.offsetY,
  };
}

function clampScale(scale: number, config: ViewportConfig): number {
  return Math.min(config.maxScale, Math.max(config.minScale, scale));
}

/**
 * Pointer-centered zoom: `screenAnchor` is the point that must remain visually fixed (the mouse
 * position). Solves for a new (scale, offset) such that
 * `screenToWorld(before, screenAnchor) === screenToWorld(after, screenAnchor)` — the same world
 * point stays under the same screen point before and after. `scaleFactor` > 1 zooms in, < 1 zooms
 * out; the result is clamped to `config.minScale`/`maxScale` (clamping changes the *effective*
 * factor actually applied, which is exactly what keeps the anchor pinned correctly at the limits
 * too, not just mid-range).
 */
export function zoomAt(viewport: Viewport, screenAnchor: Point, scaleFactor: number, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): Viewport {
  const newScale = clampScale(viewport.scale * scaleFactor, config);
  const worldAnchor = screenToWorld(viewport, screenAnchor);
  return {
    scale: newScale,
    offsetX: screenAnchor.x - worldAnchor.x * newScale,
    offsetY: screenAnchor.y - worldAnchor.y * newScale,
  };
}

/** WheelEvent.deltaMode values: 0 = pixels, 1 = lines, 2 = pages. */
export type WheelDeltaMode = 0 | 1 | 2;

/** The zoom factor for one wheel event (15 §2.2, PO 2026-10-11). Wheel-up (deltaY < 0, the DOM
 * convention) zooms in. A mouse notch — a line/page-mode delta, or a pixel delta of at least
 * `wheelNotchPixels` — is exactly one `zoomStep`, however big a delta the mouse reports (Windows
 * mice often report 300–400 per notch, which used to jump 100% → ~180%). Smaller pixel deltas
 * (trackpad scroll, pinch) zoom proportionally, so they stay smooth and never exceed one step. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): number {
  if (deltaY === 0) return 1;
  const isNotch = deltaMode !== 0 || Math.abs(deltaY) >= config.wheelNotchPixels;
  const steps = isNotch ? -Math.sign(deltaY) : -deltaY / config.wheelNotchPixels;
  return Math.pow(config.zoomStep, steps);
}

/** Wheel event -> a zoomAt call, so CanvasStage's handler is just event plumbing. */
export function zoomFromWheel(
  viewport: Viewport,
  screenAnchor: Point,
  deltaY: number,
  deltaMode = 0,
  config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG,
): Viewport {
  return zoomAt(viewport, screenAnchor, wheelZoomFactor(deltaY, deltaMode, config), config);
}

/** Resets to `config.defaultScale`, pinning `screenAnchor` in place the same way `zoomAt` does —
 * used by the zoom indicator's optional "click to reset" affordance so resetting doesn't also
 * recenter the viewport out from under whatever the user was looking at. */
export function resetZoom(viewport: Viewport, screenAnchor: Point, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): Viewport {
  return zoomAt(viewport, screenAnchor, config.defaultScale / viewport.scale, config);
}

export interface FitBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** PO follow-up (UX review, item B8 "zoom-to-fit") — the one other way (besides pointer-centered
 * zoom) this module produces a Viewport: scale + center `bounds` (Core's `shapeBounds`/
 * `unionBounds`, drawing/bounds.ts, unioned across every Measurement + the background image, if
 * any — CanvasStage.svelte owns collecting that) so it exactly fills `boxWidth`/`boxHeight` minus
 * `paddingPx` on each side, then clamps to the same scale range every other zoom respects. A
 * zero-width or zero-height `bounds` (a single point, or a perfectly axis-aligned Line) leaves
 * that axis unconstrained rather than dividing by zero; if *both* axes are degenerate (a single
 * point) falls back to `config.defaultScale`, simply centered on it. */
export function fitBounds(
  bounds: FitBounds,
  boxWidth: number,
  boxHeight: number,
  paddingPx: number,
  config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG,
): Viewport {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  const availableWidth = Math.max(boxWidth - paddingPx * 2, 1);
  const availableHeight = Math.max(boxHeight - paddingPx * 2, 1);

  const scaleX = boundsWidth > 0 ? availableWidth / boundsWidth : Infinity;
  const scaleY = boundsHeight > 0 ? availableHeight / boundsHeight : Infinity;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) ? clampScale(rawScale, config) : config.defaultScale;

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: boxWidth / 2 - centerX * scale,
    offsetY: boxHeight / 2 - centerY * scale,
  };
}
