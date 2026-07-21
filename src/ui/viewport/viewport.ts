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
  /** wheel sensitivity — deltaY in "one notch" units (~100 for most mice/trackpads) maps to this
   * multiplicative zoom factor per notch; exponential (not linear) so repeated notches compound
   * smoothly rather than the step size relatively shrinking as you zoom in. */
  readonly wheelZoomFactorPerNotch: number;
}

/** Proposed constants (PO request: "propose sensible constants... keep them in one location, not
 * hard-coded throughout the UI"). 10%–800% covers the requested range; 1.0015 per deltaY unit
 * compounds to roughly ×1.16 per typical 100-unit mouse-wheel notch — a smooth, deterministic
 * step, no animation/inertia (precision work shouldn't feel delayed, PO request). */
export const DEFAULT_VIEWPORT_CONFIG: ViewportConfig = {
  minScale: 0.1,
  maxScale: 8,
  defaultScale: 1,
  wheelZoomFactorPerNotch: 1.0015,
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

/** Wheel-event deltaY -> a zoomAt call, isolating the "which direction/how much" mapping so
 * CanvasStage's handler is just event plumbing. Wheel-up (deltaY < 0, per the DOM convention) zooms
 * in; wheel-down zooms out. */
export function zoomFromWheel(viewport: Viewport, screenAnchor: Point, deltaY: number, config: ViewportConfig = DEFAULT_VIEWPORT_CONFIG): Viewport {
  const factor = Math.pow(config.wheelZoomFactorPerNotch, -deltaY);
  return zoomAt(viewport, screenAnchor, factor, config);
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
